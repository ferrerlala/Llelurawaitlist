// The final validation numbers: Journal QA, CDs report QA, Journal-to-CDs matching, and the issue counts.
// A score is never shown as 100 while anything is missing or unresolved.
import type { JournalTemplate } from '../config/journal-template.ts';
import type { ReviewRecord } from '../data/types.ts';
import { cdsRows, type CdsRow } from './cds-view.ts';
import type { IndependentQaResult } from './independent-qa.ts';
import type { LintIssue } from './journal-lint.ts';

export interface ValidationScores {
  journal: number;
  cdsReport: number;
  matching: number;
  overall: number;
  identified: number;
  corrected: number;
  unresolved: number;
  cmInput: number;
  /** CDs rows compared with the journal: matched, different, or not yet comparable. */
  comparison: { row: CdsRow; journal: string; cds: string; result: 'Matched' | 'Different' | 'Not confirmed' | 'Needs CM input' }[];
}

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 100);
/** Never 100 while something is open. */
export const capScore = (score: number, open: number) => (open > 0 ? Math.min(score, 99) : score);

const JOURNAL_KINDS = new Set(['journal_conflict', 'journal_missing', 'classification', 'discrepancy']);

export function validationScores(review: ReviewRecord, template: JournalTemplate, qa: IndependentQaResult, lint: LintIssue[]): ValidationScores {
  // Journal: required fields with no problem and no open finding on them.
  const required = template.fields.filter((f) => f.required);
  const badFields = new Set([...lint.map((l) => l.fieldId), ...qa.openFindings.filter((f) => JOURNAL_KINDS.has(f.kind) && f.journalFieldId).map((f) => f.journalFieldId!)]);
  const journalOpen = lint.length + qa.openFindings.filter((f) => JOURNAL_KINDS.has(f.kind)).length;
  const journal = capScore(pct(required.filter((f) => !badFields.has(f.id)).length, required.length), journalOpen);

  // CDs report: every journal-mapped CDS field resolved (confirmed or not applicable).
  const rows = cdsRows(review);
  const needsInput = rows.filter((r) => ['Needs Clarification', 'Contradictory', 'Unable to Verify', 'Missing'].includes(r.status));
  const resolved = rows.filter((r) => r.status === 'Confirmed' || r.status === 'Not Applicable');
  const cdsReport = capScore(pct(resolved.length, rows.length), rows.length - resolved.length);

  // Matching: each confirmed CDS answer agrees with what the approved journal supports.
  const comparison = rows.filter((r) => r.status !== 'Not Applicable').map((r) => {
    const journalSays = /^(Select after verification|Unable to determine)/i.test(r.c.suggestedResponse) ? (r.c.candidates.join(' or ') || r.c.suggestedResponse) : r.c.suggestedResponse;
    const d = review.decisions[`cds:${r.c.fieldId}`];
    let result: ValidationScores['comparison'][number]['result'];
    if (r.status === 'Confirmed') {
      const supported = r.c.status === 'Ready for Review' ? d!.value.trim() === r.c.suggestedResponse.trim() : r.c.candidates.length ? r.c.candidates.includes(d!.value) || d!.value.trim() === r.c.suggestedResponse.trim() : true;
      result = supported ? 'Matched' : 'Different';
    } else if (r.status === 'Suggested') result = 'Not confirmed';
    else result = 'Needs CM input';
    return { row: r, journal: journalSays, cds: r.status === 'Confirmed' ? d!.value : '', result };
  });
  const contradictions = qa.openFindings.filter((f) => f.kind === 'journal_conflict' || f.kind === 'cds_contradiction').length;
  const matchedN = comparison.filter((c) => c.result === 'Matched').length;
  const matchOpen = comparison.length - matchedN + contradictions;
  const matching = capScore(pct(matchedN, comparison.length + contradictions), matchOpen);

  const aiFixed = (review.workflow?.aiCorrections ?? []).reduce((n, e) => n + e.items.length, 0);
  const corrected = qa.closedFindings.filter((c) => c.state.status !== 'rejected').length + aiFixed;
  const unresolved = lint.length + qa.openFindings.length;
  const overall = capScore(qa.score.score, unresolved + needsInput.length);
  return { journal, cdsReport, matching, overall, identified: corrected + unresolved, corrected, unresolved, cmInput: needsInput.length, comparison };
}
