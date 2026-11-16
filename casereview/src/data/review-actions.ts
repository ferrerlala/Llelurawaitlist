// Human review actions. Every change returns the updated review plus the audit
// entries that record it; callers persist both together.

import type { AnalysisResult, FollowUpTask, ReviewInput } from '../engine/types.ts';
import { newId } from './repository.ts';
import type { AppUser, AuditEntry, DecisionStatus, ReviewDecision, ReviewRecord } from './types.ts';

export type DecisionKind = 'cds' | 'adl' | 'qa' | 'issue' | 'fact';
export const decisionKey = (kind: DecisionKind, id: string) => `${kind}:${id}`;

export function audit(user: AppUser, reviewId: string | null, action: string, entityType: string, entityId: string, before: string | null, after: string | null, note = ''): AuditEntry {
  return {
    id: newId(), organizationId: user.organizationId, reviewId, at: new Date().toISOString(),
    userId: user.id, userName: user.name, action, entityType, entityId, before, after, note,
  };
}

export function createReview(user: AppUser, input: ReviewInput, analysis: AnalysisResult): { review: ReviewRecord; audit: AuditEntry[] } {
  const now = new Date().toISOString();
  const review: ReviewRecord = {
    id: newId(), organizationId: user.organizationId, createdBy: user.id, createdByName: user.name, createdAt: now, updatedAt: now,
    input, analysis, decisions: {}, tasks: analysis.tasks.map((t) => ({ ...t })), reviewerNotes: '', workflowStatus: 'In Review',
  };
  return {
    review,
    audit: [audit(user, review.id, 'review.created', 'review', review.id, null, `provider=${analysis.provider.mode}; documents=${input.documents.length}; status=${analysis.finalStatus}`)],
  };
}

export function applyDecision(
  user: AppUser, review: ReviewRecord, kind: DecisionKind, itemId: string,
  args: { status: DecisionStatus; value: string; originalValue: string; note?: string },
): { review: ReviewRecord; audit: AuditEntry[] } {
  const key = decisionKey(kind, itemId);
  const prev = review.decisions[key];
  const decision: ReviewDecision = {
    status: args.status, value: args.value, originalValue: args.originalValue, note: args.note ?? '',
    by: user.id, byName: user.name, at: new Date().toISOString(),
  };
  const next: ReviewRecord = { ...review, decisions: { ...review.decisions, [key]: decision } };
  const before = prev ? `${prev.status}: ${prev.value}` : `suggested: ${args.originalValue}`;
  return { review: next, audit: [audit(user, review.id, `decision.${args.status}`, kind, itemId, before, `${args.status}: ${args.value}`, args.note ?? '')] };
}

export function clearDecision(user: AppUser, review: ReviewRecord, kind: DecisionKind, itemId: string) {
  const key = decisionKey(kind, itemId);
  const prev = review.decisions[key];
  const decisions = { ...review.decisions };
  delete decisions[key];
  return {
    review: { ...review, decisions },
    audit: [audit(user, review.id, 'decision.reset', kind, itemId, prev ? `${prev.status}: ${prev.value}` : null, 'pending')],
  };
}

export function updateTask(user: AppUser, review: ReviewRecord, taskId: string, patch: Partial<FollowUpTask>) {
  const before = review.tasks.find((t) => t.id === taskId);
  if (!before) throw new Error('Task not found');
  const after = { ...before, ...patch };
  const changed = (Object.keys(patch) as (keyof FollowUpTask)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return {
    review: { ...review, tasks: review.tasks.map((t) => (t.id === taskId ? after : t)) },
    audit: changed.map((k) => audit(user, review.id, 'task.updated', 'task', `${taskId}.${String(k)}`, String(before[k] ?? ''), String(after[k] ?? ''))),
  };
}

export function addTask(user: AppUser, review: ReviewRecord, description: string, responsible: string) {
  const task: FollowUpTask = {
    id: newId('t'), description, responsible: responsible || 'Not documented', dueDate: null, dueDateSource: 'not documented',
    status: 'Pending', followUp: 'Document completion with the date completed.', completionNotes: '', evidence: [],
  };
  return { review: { ...review, tasks: [...review.tasks, task] }, audit: [audit(user, review.id, 'task.created', 'task', task.id, null, description, 'Added manually by reviewer')] };
}

export function setReviewerNotes(user: AppUser, review: ReviewRecord, notes: string) {
  return { review: { ...review, reviewerNotes: notes }, audit: [audit(user, review.id, 'review.notes_updated', 'review', review.id, review.reviewerNotes || null, notes)] };
}

export function setWorkflowStatus(user: AppUser, review: ReviewRecord, status: ReviewRecord['workflowStatus']) {
  return { review: { ...review, workflowStatus: status }, audit: [audit(user, review.id, 'review.status_changed', 'review', review.id, review.workflowStatus, status)] };
}

/** Reviewed-item progress for display. */
export function reviewProgress(review: ReviewRecord) {
  const totals = {
    cds: review.analysis.cds.filter((c) => c.mapped !== false).length,
    adl: review.analysis.adl.length,
    qa: review.analysis.qa.length,
    issue: review.analysis.issues.length,
  };
  const done = { cds: 0, adl: 0, qa: 0, issue: 0 };
  for (const k of Object.keys(review.decisions)) {
    const kind = k.split(':')[0] as keyof typeof done;
    if (kind === 'cds') {
      const c = review.analysis.cds.find((x) => `cds:${x.fieldId}` === k);
      if (c && c.mapped === false) continue;
    }
    if (kind in done) done[kind]++;
  }
  const total = totals.cds + totals.adl + totals.qa + totals.issue;
  const reviewed = done.cds + done.adl + done.qa + done.issue;
  return { totals, done, total, reviewed, pct: total ? Math.round((reviewed / total) * 100) : 0 };
}
