import { describe, expect, it } from 'vitest';
import { SAMPLE_NARRATIVE } from '../src/config/sample-data.ts';
import { LocalRepository, MemoryStore } from '../src/data/local-repository.ts';
import { applyDecision, createReview, decisionKey, updateTask } from '../src/data/review-actions.ts';
import type { AppUser } from '../src/data/types.ts';
import { analyze, doc } from './helpers.ts';

const user: AppUser = { id: 'u1', email: 'cm@example.org', name: 'Demo Case Manager', role: 'case_manager', organizationId: 'org-a', organizationName: 'Demo ASAP' };
const otherOrg: AppUser = { ...user, id: 'u2', organizationId: 'org-b' };

describe('TEST 10 – case manager edits and approves a suggested response', () => {
  it('saves the human-approved response and records the change in the audit history', async () => {
    const repo = new LocalRepository(new MemoryStore());
    const docs = [doc('n1', SAMPLE_NARRATIVE)];
    const input = { caseIdentifier: 'TEST-0001', assessmentType: 'Annual Redetermination' as const, assessmentDate: '2025-10-01', program: 'Home Care', documents: docs };
    const created = createReview(user, input, analyze(docs));
    await repo.saveReview(user, created.review);
    await repo.appendAudit(user, created.audit);

    const field = created.review.analysis.cds.find((c) => c.fieldId === 'fn_bathing')!;
    expect(field.status).toBe('Not Documented');
    const edited = applyDecision(user, created.review, 'cds', field.fieldId, {
      status: 'edited', value: 'Needs Assistance (verified at visit 10/1/2025)', originalValue: field.suggestedResponse, note: 'Verified with consumer by phone',
    });
    await repo.saveReview(user, edited.review);
    await repo.appendAudit(user, edited.audit);

    const approved = applyDecision(user, edited.review, 'cds', 'fn_eating', { status: 'approved', value: 'Independent', originalValue: 'Independent' });
    await repo.saveReview(user, approved.review);
    await repo.appendAudit(user, approved.audit);

    const saved = (await repo.getReview(user, created.review.id))!;
    expect(saved.decisions[decisionKey('cds', 'fn_bathing')]).toMatchObject({ status: 'edited', value: 'Needs Assistance (verified at visit 10/1/2025)', originalValue: 'Not documented', byName: 'Demo Case Manager' });
    expect(saved.decisions[decisionKey('cds', 'fn_eating')].status).toBe('approved');
    // The AI suggestion is preserved unchanged alongside the human decision.
    expect(saved.analysis.cds.find((c) => c.fieldId === 'fn_bathing')!.suggestedResponse).toBe('Not documented');

    const log = await repo.listAudit(user, created.review.id);
    expect(log.map((e) => e.action).sort()).toEqual(['decision.approved', 'decision.edited', 'review.created']);
    const edit = log.find((e) => e.action === 'decision.edited')!;
    expect(edit.before).toBe('suggested: Not documented');
    expect(edit.after).toMatch(/Needs Assistance/);
    expect(edit.userId).toBe('u1');
  });

  it('records task updates in the audit history', () => {
    const docs = [doc('n1', SAMPLE_NARRATIVE)];
    const { review } = createReview(user, { caseIdentifier: 'T', assessmentType: 'Annual Redetermination', assessmentDate: '', program: '', documents: docs }, analyze(docs));
    const t = review.tasks[0];
    const res = updateTask(user, review, t.id, { status: 'Completed', completionNotes: 'Mailed 10/3/2025' });
    expect(res.review.tasks[0].status).toBe('Completed');
    expect(res.audit.map((a) => a.entityId)).toEqual([`${t.id}.status`, `${t.id}.completionNotes`]);
  });

  it('isolates organizations in the demo repository', async () => {
    const repo = new LocalRepository(new MemoryStore());
    const docs = [doc('n1', SAMPLE_NARRATIVE)];
    const { review } = createReview(user, { caseIdentifier: 'T', assessmentType: 'Other', assessmentDate: '', program: '', documents: docs }, analyze(docs));
    await repo.saveReview(user, review);
    expect(await repo.listReviews(otherOrg)).toHaveLength(0);
    await expect(repo.saveReview(otherOrg, review)).rejects.toThrow();
  });
});
