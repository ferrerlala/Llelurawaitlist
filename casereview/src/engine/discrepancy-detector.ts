// discrepancy-detector: finds facts that disagree within or across documents.
// Conflicts are never resolved automatically: every value is shown with its source.

import { comparable, evidenceOf, type FactIndex } from './facts.ts';
import type { Discrepancy } from './types.ts';

/** Single-valued keys where differing values indicate a documentation conflict. */
export const COMPARABLE_KEYS: { key: string; topic: string }[] = [
  { key: 'financial.copay', topic: 'Copay' },
  { key: 'financial.annual_income', topic: 'Annual income' },
  { key: 'financial.overdue_balance', topic: 'Overdue balance' },
  { key: 'financial.masshealth', topic: 'MassHealth status' },
  { key: 'risk.level', topic: 'Risk level' },
  { key: 'risk.fil_code', topic: 'FIL code' },
  { key: 'basic.assessment_date', topic: 'Assessment date' },
  { key: 'basic.age', topic: 'Consumer age' },
  { key: 'followup.next_assessment', topic: 'Next assessment date' },
];

export function detectDiscrepancies(facts: FactIndex): Discrepancy[] {
  const out: Discrepancy[] = [];
  for (const { key, topic } of COMPARABLE_KEYS) {
    const list = facts.get(key);
    const distinct = new Map<string, typeof list>();
    for (const f of list) {
      const c = key === 'basic.assessment_date' && f.normalized.date ? f.normalized.date : comparable(f);
      distinct.set(c, [...(distinct.get(c) ?? []), f]);
    }
    if (distinct.size > 1) {
      const docs = new Set(list.map((f) => f.location.docName));
      out.push({
        id: `d${out.length + 1}`,
        topic,
        key,
        values: [...distinct.values()].map((group) => ({ value: group[0].value, evidence: evidenceOf(group[0]) })),
        explanation: `${topic} differs ${docs.size > 1 ? `across ${docs.size} documents` : 'within the same document'}. The system has not chosen a value; verify the correct ${topic.toLowerCase()} against the source record and correct the other document(s).`,
      });
    }
  }
  return out;
}
