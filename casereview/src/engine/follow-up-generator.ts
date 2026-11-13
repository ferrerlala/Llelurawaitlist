// follow-up-generator: turns documented planned actions into tasks.
// Due dates are only set when the documentation states one.

import { evidenceOf, type FactIndex } from './facts.ts';
import type { Fact, FollowUpTask } from './types.ts';

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'list', 'will', 'and', 'with', 'elder', 'elders', 'consumer', 'consumers', 'home', 's']);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t)).map((t) => t.replace(/s$/, '')),
  );
}

export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

function parseDetail(detail: string): { responsible: string; due: string | null } {
  const responsible = detail.match(/Responsible:\s*([^;]+)/i)?.[1]?.trim() ?? '';
  const due = detail.match(/Due:\s*([^;]+)/i)?.[1]?.trim() ?? null;
  return { responsible: responsible || 'Not documented', due };
}

function followUpText(description: string): string {
  if (/\bmail|send|deliver/i.test(description)) return 'Confirm the item was sent and document completion in the journal.';
  if (/\bcall|contact|phone/i.test(description)) return 'Document the outcome of the contact.';
  if (/\brefer/i.test(description)) return 'Confirm the referral was received and document the outcome.';
  return 'Document completion with the date completed.';
}

export function generateFollowUpTasks(facts: FactIndex): FollowUpTask[] {
  // Statements such as "No additional follow-up actions" never become tasks.
  const actions = facts.get('followup.action').filter((f) => f.assertion !== 'reported_absent');
  const groups: Fact[][] = [];
  for (const a of actions) {
    const g = groups.find((grp) => similarity(grp[0].value, a.value) >= 0.6);
    if (g) g.push(a);
    else groups.push([a]);
  }
  const telehealth = facts.get('medical.pcp_change_request').some((f) => /telehealth/i.test(f.value));
  const tasks: FollowUpTask[] = groups.map((grp, i) => {
    const primary = grp.reduce((best, f) => (f.value.length > best.value.length ? f : best), grp[0]);
    const { responsible, due } = parseDetail(grp.map((f) => f.detail).find((d) => /Due:/i.test(d)) ?? primary.detail);
    let description = primary.value.replace(/\.$/, '');
    if (telehealth && /\bpcp\b/i.test(description) && !/telehealth/i.test(description)) description += ' (consumer requested a PCP offering telehealth)';
    return {
      id: `t${i + 1}`,
      description,
      responsible,
      dueDate: due,
      dueDateSource: due ? 'documented' : 'not documented',
      status: 'Pending',
      followUp: followUpText(description),
      completionNotes: '',
      evidence: grp.map(evidenceOf),
    };
  });
  for (const f of facts.get('followup.next_assessment')) {
    tasks.push({
      id: `t${tasks.length + 1}`,
      description: 'Complete next assessment',
      responsible: 'Not documented',
      dueDate: f.value,
      dueDateSource: 'documented',
      status: 'Pending',
      followUp: 'Schedule the visit within the month due and document attempts if not completed.',
      completionNotes: '',
      evidence: [evidenceOf(f)],
    });
  }
  return tasks;
}
