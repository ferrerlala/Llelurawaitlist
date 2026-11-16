// Independent final QA reviewer and the 100-point internal pre-QA score.
//
// Independence: the reviewer does NOT reuse the facts, CDS suggestions or QA results stored by
// the earlier stages. It re-reads the final approved journal and supporting documents with its
// own deterministic extraction pass, re-derives the CDS support, re-checks the case manager's
// final CDS answers against the journal, and evaluates all 17 checklist categories itself.
// Case manager attestations (records verified in WellSky) are applied explicitly and labeled.

import { DEFAULT_QA_CHECKLIST } from '../config/qa-checklist.ts';
import type { OrgSettings, ReviewRecord } from '../data/types.ts';
import { runValidation } from '../engine/analyze.ts';
import { extractWithRules } from '../engine/clinical-data-extractor.ts';
import type { AnalysisResult, QaResult, QaScoringConfig, QaStatus } from '../engine/types.ts';
import { buildFindings } from './consistency.ts';
import { finalApprovalValid, latestJournal } from './engine.ts';
import type { ConsistencyFinding, FindingState } from './types.ts';
import { journalTemplateFor } from '../config/journal-template.ts';

export interface CategoryScore {
  categoryId: string;
  number: number;
  title: string;
  points: number;
  status: QaStatus;
  factor: number;
  earned: number;
  applicable: boolean;
  attested: boolean;
  basis: string;
}

export interface QaScore {
  score: number;
  earned: number;
  applicablePoints: number;
  totalPoints: number;
  band: string;
  counts: { passed: number; correction: number; needsReview: number; missing: number; unable: number; notApplicable: number };
  categories: CategoryScore[];
  critical: string[];
  high: string[];
  recommended: string[];
  readiness: { ready: boolean; label: 'Ready for Human QA Review' | 'Not Ready for Human QA Review'; reasons: string[] };
  disclaimer: string;
}

export interface IndependentQaResult {
  method: string;
  analysis: AnalysisResult;
  qa: QaResult[];
  findings: ConsistencyFinding[];
  openFindings: ConsistencyFinding[];
  closedFindings: { finding: ConsistencyFinding; state: FindingState }[];
  score: QaScore;
}

const DEFAULT_SCORING: QaScoringConfig = DEFAULT_QA_CHECKLIST.scoring!;
const CONTRADICTION_KINDS = new Set(['journal_conflict', 'cds_contradiction']);
const CDS_KINDS = new Set(['journal_conflict', 'cds_contradiction', 'cds_unresolved', 'classification']);

export function isOpen(f: ConsistencyFinding, states: Record<string, FindingState>): boolean {
  const s = states[f.id];
  if (!s) return true;
  if (s.status === 'rejected' || s.status === 'unable_to_verify') return false;
  // Clarification requests are resolved by the case manager's recorded answer.
  if (f.kind === 'classification' && ['accepted', 'edited', 'info_provided'].includes(s.status)) return false;
  // Any other finding that is still produced after a fix was applied is still open: the fix did not resolve it.
  return true;
}

function applyAttestations(qa: QaResult[], review: ReviewRecord): QaResult[] {
  const att = review.workflow?.attestations ?? {};
  const states = review.workflow?.findingStates ?? {};
  return qa.map((q) => {
    const a = att[q.categoryId];
    const unable = Object.entries(states).some(([id, s]) => id.endsWith(`qa_${q.categoryId}`) && s.status === 'unable_to_verify');
    if (unable && q.status !== 'Mismatch' && q.status !== 'Missing') return { ...q, status: 'Unable to Verify', notes: `${q.notes ? `${q.notes} ` : ''}Case manager marked this as unable to verify.` };
    if (!a) return q;
    const evidence = { text: `Case manager attestation (${a.byName}, ${new Date(a.at).toLocaleDateString()}): ${a.text}`, location: null };
    if (q.status === 'Needs Review' || q.status === 'Unable to Verify') {
      return { ...q, status: 'Complete', evidenceFound: [...q.evidenceFound, evidence], notes: `${q.notes ? `${q.notes} ` : ''}Verified by case manager attestation, not by a document in this file.` };
    }
    if (q.status === 'Missing') return { ...q, status: 'Needs Review', evidenceFound: [...q.evidenceFound, evidence], notes: `${q.notes ? `${q.notes} ` : ''}Attestation recorded, but required journal documentation is still missing.` };
    return q;
  });
}

export function runIndependentQa(review: ReviewRecord, settings: OrgSettings): IndependentQaResult {
  const checklist = settings.qaChecklist;
  const scoring = checklist.scoring ?? DEFAULT_SCORING;
  const states = review.workflow?.findingStates ?? {};
  const journalText = latestJournal(review)?.text ?? review.input.documents.find((d) => d.type === 'Narrative / Journal Note')?.text ?? '';

  // 1. Independent extraction and validation of the final documentation.
  const extraction = extractWithRules(review.input.documents, settings.functionalAreas);
  const base = runValidation(review.input, extraction, { mode: 'mock', label: 'Independent QA reviewer (separate rule-based pass)' },
    { cdsTemplate: settings.cdsTemplate, qaChecklist: checklist, functionalAreas: settings.functionalAreas });
  const qaAttested = applyAttestations(base.qa, review);
  const analysis: AnalysisResult = { ...base, qa: qaAttested };

  // 2. Journal ↔ final CDS answers, re-derived independently.
  const findings = buildFindings({ analysis, decisions: review.decisions, journalText, template: journalTemplateFor(settings, review.input.assessmentType), checklist, areas: settings.functionalAreas });
  const open = findings.filter((f) => isOpen(f, states));
  const closed = Object.entries(states)
    .filter(([id, s]) => !open.some((f) => f.id === id) && s.status !== 'open')
    .map(([id, s]) => ({ finding: findings.find((f) => f.id === id) ?? ({ id, title: s.title } as ConsistencyFinding), state: s }));

  // 3. Journal and CDS consistency (QA 8) from the independent comparison.
  const unconfirmed = analysis.cds.filter((c) => c.mapped && c.status !== 'Not Documented' && !review.decisions[`cds:${c.fieldId}`]);
  const cdsOpen = open.filter((f) => CDS_KINDS.has(f.kind) || f.id === 'journal_missing:adl_iadl');
  const contradictions = cdsOpen.filter((f) => CONTRADICTION_KINDS.has(f.kind) && (f.severity === 'Critical' || f.severity === 'High'));
  const cdsUnable = findings.filter((f) => CDS_KINDS.has(f.kind) && states[f.id]?.status === 'unable_to_verify');
  const qa = analysis.qa.map((q): QaResult => {
    if (q.categoryId !== 'narrative_cds') return q;
    let status: QaStatus;
    let correction: string;
    if (contradictions.length) { status = 'Mismatch'; correction = `${contradictions.length} unresolved journal/CDS contradiction(s): ${contradictions.map((f) => f.title).join('; ')}.`; }
    else if (cdsOpen.length || unconfirmed.length) {
      status = 'Needs Review';
      correction = [cdsOpen.length ? `${cdsOpen.length} open journal/CDS finding(s)` : '', unconfirmed.length ? `${unconfirmed.length} prepared CDS answer(s) not yet confirmed by the case manager` : ''].filter(Boolean).join('; ') + '.';
    } else if (cdsUnable.length) { status = 'Unable to Verify'; correction = `${cdsUnable.length} journal/CDS item(s) marked unable to verify.`; }
    else { status = 'Complete'; correction = 'Every prepared CDS answer is confirmed and supported by the approved journal.'; }
    return {
      ...q, status, recommendedCorrection: correction,
      evidenceFound: [{ text: `Independent comparison of the approved journal (v${latestJournal(review)?.version ?? 1}) with ${analysis.cds.filter((c) => c.mapped).length} prepared CDS questions`, location: null }],
      evidenceMissing: [...contradictions, ...cdsOpen.filter((f) => !contradictions.includes(f))].map((f) => f.title).concat(unconfirmed.length ? [`${unconfirmed.length} CDS answer(s) awaiting confirmation`] : []),
    };
  });

  return {
    method: 'Independent rule-based re-read of the final journal and supporting documents; does not reuse earlier AI-stage results.',
    analysis: { ...analysis, qa }, qa, findings, openFindings: open, closedFindings: closed,
    score: scoreQa(qa, open, review, checklist.categories, scoring),
  };
}

export function scoreQa(qa: QaResult[], open: ConsistencyFinding[], review: ReviewRecord, categories: { id: string; points?: number; priority: string }[], scoring: QaScoringConfig): QaScore {
  const att = review.workflow?.attestations ?? {};
  const cats: CategoryScore[] = qa.map((q) => {
    const points = categories.find((c) => c.id === q.categoryId)?.points ?? 0;
    const applicable = q.status !== 'Not Applicable';
    const factor = applicable ? scoring.factors[q.status as Exclude<QaStatus, 'Not Applicable'>] ?? 0 : 0;
    const basis =
      q.status === 'Complete' ? (att[q.categoryId] ? 'Verified (case manager attestation of the record)' : 'Fully supported by the documentation')
        : q.status === 'Needs Review' ? 'Partially complete — evidence present but requires review'
          : q.status === 'Unable to Verify' ? 'Record not accessible to this tool — verify in WellSky (full points are never awarded unverified)'
            : q.status === 'Missing' ? 'Required documentation is missing'
              : q.status === 'Mismatch' ? 'Contradictory information — points deducted'
                : 'Not applicable — excluded from the denominator';
    return { categoryId: q.categoryId, number: q.number, title: q.title, points, status: q.status, factor, earned: Math.round(points * factor * 100) / 100, applicable, attested: !!att[q.categoryId], basis };
  });
  const applicablePoints = cats.filter((c) => c.applicable).reduce((n, c) => n + c.points, 0);
  const earned = cats.reduce((n, c) => n + c.earned, 0);
  const score = applicablePoints ? Math.round((earned / applicablePoints) * 1000) / 10 : 0;
  const band = scoring.bands.find((b) => score >= b.min)?.label ?? scoring.bands[scoring.bands.length - 1].label;

  const criticalFindings = open.filter((f) => f.severity === 'Critical');
  const criticalQa = qa.filter((q) => scoring.criticalCategories.includes(q.categoryId) && (q.status === 'Mismatch' || q.status === 'Missing'));
  const critical = [...criticalFindings.map((f) => f.title), ...criticalQa.filter((q) => !criticalFindings.some((f) => f.qaCategoryIds.includes(q.categoryId))).map((q) => `QA ${q.number}. ${q.title}: ${q.status}`)];
  const high = [
    ...open.filter((f) => f.severity === 'High' && !critical.some((c) => c === f.title || (f.qaCategoryIds.length === 1 && c.startsWith(`QA ${qa.find((q) => q.categoryId === f.qaCategoryIds[0])?.number}.`)))).map((f) => f.title),
    ...qa.filter((q) => q.status === 'Missing' && categories.find((c) => c.id === q.categoryId)?.priority === 'High' && !scoring.criticalCategories.includes(q.categoryId)).map((q) => `QA ${q.number}. ${q.title}: Missing`),
  ];
  const missing = qa.filter((q) => q.status === 'Missing');
  const contradictions = open.filter((f) => CONTRADICTION_KINDS.has(f.kind) || f.kind === 'fil' || f.kind === 'discrepancy');
  const reasons: string[] = [];
  if (critical.length) reasons.push(`${critical.length} critical finding(s) unresolved`);
  if (missing.length) reasons.push(`Required evidence missing: ${missing.map((q) => `QA ${q.number}`).join(', ')}`);
  if (contradictions.length) reasons.push(`${contradictions.length} journal/CDS contradiction(s) unresolved`);
  if (!finalApprovalValid(review)) reasons.push('Case manager has not approved the final documentation (or it changed after approval)');
  const ready = reasons.length === 0;

  return {
    score, earned: Math.round(earned * 100) / 100, applicablePoints, totalPoints: cats.reduce((n, c) => n + c.points, 0), band,
    counts: {
      passed: qa.filter((q) => q.status === 'Complete').length,
      correction: qa.filter((q) => q.status === 'Mismatch').length,
      needsReview: qa.filter((q) => q.status === 'Needs Review').length,
      missing: missing.length,
      unable: qa.filter((q) => q.status === 'Unable to Verify').length,
      notApplicable: qa.filter((q) => q.status === 'Not Applicable').length,
    },
    categories: cats, critical, high,
    recommended: [...open.slice(0, 12).map((f) => `${f.title}: ${f.suggestedCorrection}`)],
    readiness: { ready, label: ready ? 'Ready for Human QA Review' : 'Not Ready for Human QA Review', reasons },
    disclaimer: scoring.disclaimer,
  };
}
