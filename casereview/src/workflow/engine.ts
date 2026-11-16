// Workflow engine: journal approval → CDS generation → validation → corrections → final approval.
// Every change is explicit, versioned and audited. Nothing here edits the journal or a CDS answer
// without a case manager action.

import type { SourceDocument } from '@shared/extraction-contract.ts';
import { applyDecision, audit, createReview } from '../data/review-actions.ts';
import type { AppUser, AuditEntry, ReviewDecision, ReviewRecord } from '../data/types.ts';
import type { AnalysisResult, ReviewInput } from '../engine/types.ts';
import type { JournalTemplate } from '../config/journal-template.ts';
import { setJournalField, type DraftField, type JournalFieldInput } from './journal-builder.ts';
import type { ConsistencyFinding, FindingState, FindingStatus, RerunImpact, WorkflowState } from './types.ts';

/** Runs Stage A + Stage B on the given input (provider chosen by the caller). */
export type Analyzer = (input: ReviewInput) => Promise<AnalysisResult>;

export const JOURNAL_DOC_ID = 'annual-journal';

export function latestJournal(r: ReviewRecord) {
  const v = r.workflow?.journal.versions;
  return v?.length ? v[v.length - 1] : null;
}

function journalDocument(text: string, version: number, assessmentDate: string): SourceDocument {
  return { id: JOURNAL_DOC_ID, name: `Annual journal ${assessmentDate || ''} (approved v${version})`.replace('  ', ' '), type: 'Narrative / Journal Note', text };
}

/** Case manager approves the journal draft: create the review and generate the CDS automatically. */
export async function approveJournal(args: {
  user: AppUser;
  analyze: Analyzer;
  caseIdentifier: string;
  assessmentType: ReviewInput['assessmentType'];
  assessmentDate: string;
  program: string;
  journalText: string;
  inputs: Record<string, JournalFieldInput>;
  draftFields: DraftField[];
  template: JournalTemplate;
  previousReviewId: string | null;
  previousAssessmentDate: string | null;
  supportingDocuments?: SourceDocument[];
}): Promise<{ review: ReviewRecord; audit: AuditEntry[] }> {
  const now = new Date().toISOString();
  const input: ReviewInput = {
    caseIdentifier: args.caseIdentifier, assessmentType: args.assessmentType, assessmentDate: args.assessmentDate, program: args.program,
    documents: [journalDocument(args.journalText, 1, args.assessmentDate), ...(args.supportingDocuments ?? [])],
  };
  const analysis = await args.analyze(input);
  const { review, audit: entries } = createReview(args.user, input, analysis);
  const workflow: WorkflowState = {
    stage: 'Journal Approved',
    journal: {
      templateId: args.template.id, previousReviewId: args.previousReviewId, previousAssessmentDate: args.previousAssessmentDate,
      inputs: args.inputs, draftFields: args.draftFields,
      versions: [{ version: 1, text: args.journalText, createdAt: now, createdBy: args.user.id, createdByName: args.user.name, reason: 'Annual journal approved', approvedAt: now, approvedByName: args.user.name }],
    },
    findingStates: {}, attestations: {}, finalApproval: null, lastRerun: null,
  };
  return {
    review: { ...review, workflow },
    audit: [
      ...entries,
      audit(args.user, review.id, 'journal.approved', 'journal', 'v1', null, `Journal v1 approved${args.previousReviewId ? ' (prefilled from previous assessment)' : ''}`),
      audit(args.user, review.id, 'cds.generated', 'cds', review.id, null, `${analysis.cds.filter((c) => c.mapped && c.status !== 'Not Documented').length} CDS answers prepared from the approved journal`),
    ],
  };
}

/** Keep human CDS/QA decisions only where the regenerated suggestion is unchanged. */
function carryDecisions(prev: AnalysisResult, next: AnalysisResult, decisions: Record<string, ReviewDecision>) {
  const kept: Record<string, ReviewDecision> = {};
  const invalidated: string[] = [];
  for (const [key, d] of Object.entries(decisions)) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    let same = false;
    if (kind === 'cds') {
      const a = prev.cds.find((c) => c.fieldId === id);
      const b = next.cds.find((c) => c.fieldId === id);
      same = !!a && !!b && a.suggestedResponse === b.suggestedResponse && a.status === b.status && a.evidence.map((e) => e.text).join('|') === b.evidence.map((e) => e.text).join('|');
      // A verified answer chosen among candidates stays valid while it is still a candidate.
      if (!same && b && d.status !== 'rejected' && (b.candidates.includes(d.value) || b.suggestedResponse === d.value)) same = true;
    } else if (kind === 'qa') {
      same = prev.qa.find((q) => q.categoryId === id)?.status === next.qa.find((q) => q.categoryId === id)?.status;
    } else if (kind === 'adl') {
      same = prev.adl.find((r) => r.areaId === id)?.result === next.adl.find((r) => r.areaId === id)?.result;
    } else if (kind === 'issue') {
      same = prev.issues.find((i) => i.id === id)?.title === next.issues.find((i) => i.id === id)?.title;
    } else same = true;
    if (same) kept[key] = d; else invalidated.push(key);
  }
  return { kept, invalidated };
}

/** Save a corrected journal as a new approved version and re-run every dependent stage. */
export async function reviseJournal(review: ReviewRecord, newText: string, reason: string, user: AppUser, analyze: Analyzer): Promise<{ review: ReviewRecord; audit: AuditEntry[] }> {
  const wf = review.workflow;
  if (!wf) throw new Error('Not an annual-assessment workflow review');
  const prevVersion = latestJournal(review)!;
  if (prevVersion.text === newText) return { review, audit: [] };
  const version = prevVersion.version + 1;
  const now = new Date().toISOString();
  const documents = review.input.documents.map((d) => (d.id === JOURNAL_DOC_ID ? journalDocument(newText, version, review.input.assessmentDate) : d));
  const input: ReviewInput = { ...review.input, documents };
  const analysis = await analyze(input);
  const { kept, invalidated } = carryDecisions(review.analysis, analysis, review.decisions);
  const impact: RerunImpact = {
    at: now, reason,
    changedCds: analysis.cds.flatMap((c) => {
      const old = review.analysis.cds.find((x) => x.fieldId === c.fieldId);
      return old && (old.suggestedResponse !== c.suggestedResponse || old.status !== c.status)
        ? [{ fieldId: c.fieldId, label: `${c.code ? `${c.code} ` : ''}${c.label}`.slice(0, 120), before: `${old.status}: ${old.suggestedResponse}`, after: `${c.status}: ${c.suggestedResponse}` }]
        : [];
    }),
    changedQa: analysis.qa.flatMap((q) => {
      const old = review.analysis.qa.find((x) => x.categoryId === q.categoryId);
      return old && old.status !== q.status ? [{ categoryId: q.categoryId, title: `${q.number}. ${q.title}`, before: old.status, after: q.status }] : [];
    }),
    invalidatedDecisions: invalidated,
  };
  const entries: AuditEntry[] = [
    audit(user, review.id, 'journal.revised', 'journal', `v${version}`, `v${prevVersion.version}`, `v${version}`, reason),
    audit(user, review.id, 'validation.rerun', 'review', review.id, null, `${impact.changedCds.length} CDS answer(s) and ${impact.changedQa.length} QA result(s) changed; ${invalidated.length} decision(s) need re-confirmation`),
    ...invalidated.map((k) => audit(user, review.id, 'decision.invalidated', k.split(':')[0], k.split(':').slice(1).join(':'), review.decisions[k]?.value ?? null, null, 'Journal change affected this item')),
  ];
  if (wf.finalApproval) entries.push(audit(user, review.id, 'final_approval.invalidated', 'review', review.id, wf.finalApproval.at, null, 'Documentation changed after final approval'));
  return {
    review: {
      ...review, input, analysis, decisions: kept,
      workflow: {
        ...wf, stage: 'Corrections', finalApproval: null, lastRerun: impact,
        journal: {
          ...wf.journal,
          versions: [...wf.journal.versions, { version, text: newText, createdAt: now, createdBy: user.id, createdByName: user.name, reason, approvedAt: now, approvedByName: user.name }],
        },
      },
    },
    audit: entries,
  };
}

export interface CdsMatchSummary { journalVersion: number; at: string; confirmed: number; updated: number; needPick: number }

/** CDS answers that do not yet follow the final journal: unconfirmed single answers, or confirmed values that differ from it. */
export function cdsJournalGaps(review: ReviewRecord) {
  const unconfirmed: string[] = [];
  const differs: string[] = [];
  for (const c of review.analysis.cds) {
    if (!c.mapped || c.status !== 'Ready for Review' || !c.suggestedResponse.trim()) continue;
    const d = review.decisions[`cds:${c.fieldId}`];
    if (!d || d.status === 'rejected') unconfirmed.push(c.fieldId);
    else if (d.value.trim() !== c.suggestedResponse.trim()) differs.push(c.fieldId);
  }
  return { unconfirmed, differs, total: unconfirmed.length + differs.length };
}

/**
 * Fill the CDS from the final approved journal so both records match: every CDS answer the journal
 * supports with one clear answer is confirmed, and any confirmed answer that no longer matches the
 * journal is updated to the journal's answer. Answers the journal leaves open are never guessed.
 */
export function matchCdsToJournal(review: ReviewRecord, user: AppUser, opts: { updateConfirmed?: boolean } = {}): { review: ReviewRecord; audit: AuditEntry[]; summary: CdsMatchSummary } {
  const v = latestJournal(review)?.version ?? 1;
  let r = review;
  const entries: AuditEntry[] = [];
  let confirmed = 0, updated = 0, needPick = 0;
  for (const c of review.analysis.cds) {
    if (!c.mapped) continue;
    const d = r.decisions[`cds:${c.fieldId}`];
    if (c.status === 'Ready for Review' && c.suggestedResponse.trim()) {
      const same = d && d.status !== 'rejected' && d.value.trim() === c.suggestedResponse.trim();
      if (same) continue;
      // A confirmed answer is only replaced when the case manager asked for it explicitly.
      if (d && d.status !== 'rejected' && opts.updateConfirmed === false) continue;
      const res = applyDecision(user, r, 'cds', c.fieldId, {
        status: 'approved', value: c.suggestedResponse, originalValue: c.suggestedResponse,
        note: d ? `Updated to match the final journal v${v} (was: ${d.value})` : `Filled from the final journal v${v}`,
      });
      r = res.review; entries.push(...res.audit);
      if (d) updated++; else confirmed++;
    } else if ((c.status === 'Needs Verification' || c.status === 'Unable to Determine') && !d) needPick++;
  }
  const summary: CdsMatchSummary = { journalVersion: v, at: new Date().toISOString(), confirmed, updated, needPick };
  entries.push(audit(user, review.id, 'cds.matched_to_journal', 'review', review.id, null, `Journal v${v}: ${confirmed} filled, ${updated} updated, ${needPick} need the case manager`));
  return { review: r.workflow ? { ...r, workflow: { ...r.workflow, cdsMatch: summary } } : r, audit: entries, summary };
}

/** Re-run validation without a journal change (e.g. after settings change). */
export async function rerunValidation(review: ReviewRecord, user: AppUser, analyze: Analyzer) {
  const analysis = await analyze(review.input);
  const { kept, invalidated } = carryDecisions(review.analysis, analysis, review.decisions);
  return {
    review: { ...review, analysis, decisions: kept, workflow: review.workflow ? { ...review.workflow, lastRerun: { at: new Date().toISOString(), reason: 'Validation re-run', changedCds: [], changedQa: [], invalidatedDecisions: invalidated } } : undefined },
    audit: [audit(user, review.id, 'validation.rerun', 'review', review.id, null, `Re-run; ${invalidated.length} decision(s) need re-confirmation`)],
  };
}

export type FindingAction =
  | { type: 'accept_option'; optionId: string; note?: string }
  | { type: 'provide_info'; fieldId: string; content: string; note?: string }
  | { type: 'edit_answer'; fieldId: string; value: string; note?: string }
  | { type: 'reject'; note: string }
  | { type: 'unable'; note: string }
  | { type: 'attest'; text: string };

function withState(review: ReviewRecord, finding: ConsistencyFinding, status: FindingStatus, user: AppUser, note: string, value?: string): ReviewRecord {
  const wf = review.workflow!;
  const prev = wf.findingStates[finding.id];
  const at = new Date().toISOString();
  const state: FindingState = {
    status, note, value, by: user.id, byName: user.name, at, title: finding.title,
    before: prev?.before ?? (finding.mismatch || finding.journalInfo || finding.cdsAnswer || undefined),
    history: [...(prev?.history ?? []), { status, note, value, at, byName: user.name }],
  };
  return { ...review, workflow: { ...wf, findingStates: { ...wf.findingStates, [finding.id]: state } } };
}

/** Apply a case manager decision on a finding. Journal changes trigger a full re-run. */
export async function applyFindingAction(
  review: ReviewRecord, finding: ConsistencyFinding, action: FindingAction, user: AppUser, analyze: Analyzer, template: JournalTemplate,
): Promise<{ review: ReviewRecord; audit: AuditEntry[] }> {
  if (!review.workflow) throw new Error('Not an annual-assessment workflow review');
  const log = (act: string, after: string, note = '') => audit(user, review.id, `finding.${act}`, 'finding', finding.id, finding.title, after, note);
  const journal = latestJournal(review)!.text;

  if (action.type === 'accept_option') {
    const opt = finding.options.find((o) => o.id === action.optionId);
    if (!opt) throw new Error('Unknown option');
    let r = withState(review, finding, 'accepted', user, action.note ?? '', opt.label);
    const entries = [log('accepted', opt.label, action.note)];
    if (opt.cdsAnswer) {
      const res = applyDecision(user, r, 'cds', opt.cdsAnswer.fieldId, {
        status: opt.cdsAnswer.value === opt.cdsAnswer.original ? 'approved' : 'edited', value: opt.cdsAnswer.value, originalValue: opt.cdsAnswer.original,
        note: `From finding: ${finding.title}`,
      });
      r = res.review;
      entries.push(...res.audit);
    }
    if (opt.journalPatch) {
      const res = await reviseJournal(r, setJournalField(journal, template, opt.journalPatch.fieldId, opt.journalPatch.content), `Correction accepted: ${finding.title} — ${opt.label}`, user, analyze);
      r = res.review;
      entries.push(...res.audit);
    }
    return { review: r, audit: entries };
  }
  if (action.type === 'provide_info') {
    const r = withState(review, finding, 'info_provided', user, action.note ?? '', action.content);
    const res = await reviseJournal(r, setJournalField(journal, template, action.fieldId, action.content), `Information provided: ${finding.title}`, user, analyze);
    return { review: res.review, audit: [log('info_provided', action.content, action.note), ...res.audit] };
  }
  if (action.type === 'edit_answer') {
    const c = review.analysis.cds.find((x) => x.fieldId === action.fieldId);
    const r = withState(review, finding, 'edited', user, action.note ?? '', action.value);
    const res = applyDecision(user, r, 'cds', action.fieldId, { status: 'edited', value: action.value, originalValue: c?.suggestedResponse ?? '', note: action.note ?? `From finding: ${finding.title}` });
    return { review: res.review, audit: [log('edited', action.value, action.note), ...res.audit] };
  }
  if (action.type === 'attest') {
    const qa = finding.qaCategoryIds[0];
    let r = withState(review, finding, 'accepted', user, action.text, action.text);
    if (qa) {
      r = { ...r, workflow: { ...r.workflow!, attestations: { ...r.workflow!.attestations, [qa]: { qaCategoryId: qa, text: action.text, by: user.id, byName: user.name, at: new Date().toISOString() } } } };
    }
    return { review: r, audit: [log('attested', action.text)] };
  }
  const status: FindingStatus = action.type === 'reject' ? 'rejected' : 'unable_to_verify';
  return { review: withState(review, finding, status, user, action.note), audit: [log(status, status, action.note)] };
}

export function approveFinal(review: ReviewRecord, user: AppUser, score: number | null, note: string) {
  const wf = review.workflow!;
  const v = latestJournal(review)!;
  return {
    review: {
      ...review, workflowStatus: 'Reviewed' as const,
      workflow: { ...wf, stage: 'Final Approved' as const, finalApproval: { by: user.id, byName: user.name, at: new Date().toISOString(), note, journalVersion: v.version, analysisGeneratedAt: review.analysis.generatedAt, decisionsSignature: decisionsSignature(review), score } },
    },
    audit: [audit(user, review.id, 'final_approval', 'review', review.id, null, `Final documentation approved (journal v${v.version}; pre-QA score ${score ?? 'n/a'})`, note)],
  };
}

export function finalApprovalValid(review: ReviewRecord): boolean {
  const fa = review.workflow?.finalApproval;
  const v = latestJournal(review);
  return !!fa && !!v && fa.journalVersion === v.version && fa.analysisGeneratedAt === review.analysis.generatedAt && fa.decisionsSignature === decisionsSignature(review);
}

export function decisionsSignature(review: ReviewRecord): string {
  return Object.entries(review.decisions).sort(([a], [b]) => a.localeCompare(b)).map(([k, d]) => `${k}=${d.status}:${d.value}`).join('|');
}
