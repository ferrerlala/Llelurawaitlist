// CDS rows as the case manager sees them, with one plain evidence status per answer.
import type { ReviewRecord } from '../data/types.ts';
import type { CdsResponse } from '../engine/types.ts';

export type EvidenceStatus = 'Suggested' | 'Confirmed' | 'Missing' | 'Contradictory' | 'Unable to Verify' | 'Needs Clarification' | 'Not Applicable';

export interface CdsRow {
  c: CdsResponse;
  status: EvidenceStatus;
  /** The confirmed answer, or the proposed answer when not yet confirmed. */
  answer: string;
  evidence: string;
}

export function evidenceStatus(c: CdsResponse, review: ReviewRecord): EvidenceStatus {
  const d = review.decisions[`cds:${c.fieldId}`];
  if (d && d.status === 'rejected') return 'Not Applicable';
  if (d && d.value.trim()) return 'Confirmed';
  if (!c.mapped) return 'Not Applicable';
  if (c.status === 'Ready for Review') return 'Suggested';
  if (c.status === 'Unable to Determine') return 'Contradictory';
  if (c.status === 'Not Documented') return 'Missing';
  if (c.candidates.length > 1 || /^Select after verification/i.test(c.suggestedResponse)) return 'Needs Clarification';
  if (/^Narrative states|requires verification/i.test(`${c.suggestedResponse} ${c.rationale}`)) return 'Unable to Verify';
  return 'Suggested';
}

/** Mapped CDS rows (the questions the journal can answer), in instrument order. */
export function cdsRows(review: ReviewRecord): CdsRow[] {
  return review.analysis.cds.filter((c) => c.mapped).map((c) => {
    const d = review.decisions[`cds:${c.fieldId}`];
    const status = evidenceStatus(c, review);
    const answer = d && d.value.trim() ? d.value : status === 'Missing' || /^(Select after verification|Unable to determine)/i.test(c.suggestedResponse) ? '' : c.suggestedResponse;
    return { c, status, answer, evidence: c.evidence[0]?.text ?? '' };
  });
}

export function groupBySection<T extends { c: CdsResponse }>(rows: T[]): { name: string; rows: T[] }[] {
  const out: { name: string; rows: T[] }[] = [];
  for (const r of rows) {
    const g = out.find((x) => x.name === r.c.section) ?? (out.push({ name: r.c.section, rows: [] }), out[out.length - 1]);
    g.rows.push(r);
  }
  return out;
}

/** One clean line per confirmed answer, ready to paste. */
export function cdsLine(r: CdsRow): string {
  const label = r.c.label.replace(/\s+/g, ' ').trim();
  return `${r.c.code ? `${r.c.code} ` : ''}${label}: ${r.answer}`;
}

export function confirmedCdsText(review: ReviewRecord, section?: string): string {
  const groups = groupBySection(cdsRows(review).filter((r) => r.status === 'Confirmed' && (!section || r.c.section === section)));
  return groups.map((g) => `${g.name}\n${g.rows.map(cdsLine).join('\n')}`).join('\n\n');
}

export function notInJournalCount(review: ReviewRecord): number {
  return review.analysis.cds.filter((c) => !c.mapped && !review.decisions[`cds:${c.fieldId}`]).length;
}
