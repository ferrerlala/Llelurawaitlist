// ACCEPTANCE TEST: Start Annual Assessment → journal → approval → CDS → consistency →
// corrections → independent QA → score → re-score. Fictional November 12, 2026 sample.
import { describe, expect, it } from 'vitest';
import { DEFAULT_JOURNAL_TEMPLATE as T } from '../src/config/journal-template.ts';
import { SAMPLE_ANNUAL_CHANGES, SAMPLE_PREVIOUS_JOURNAL } from '../src/config/sample-data.ts';
import { defaultSettings } from '../src/data/default-settings.ts';
import type { AppUser, ReviewRecord } from '../src/data/types.ts';
import { runValidation } from '../src/engine/analyze.ts';
import { extractWithRules } from '../src/engine/clinical-data-extractor.ts';
import type { ReviewInput } from '../src/engine/types.ts';
import { composeJournal, journalProblems, previousValues, type JournalFieldInput } from '../src/workflow/journal-builder.ts';
import { applyFindingAction, approveFinal, approveJournal, cdsJournalGaps, latestJournal, matchCdsToJournal, type Analyzer } from '../src/workflow/engine.ts';
import { runIndependentQa } from '../src/workflow/independent-qa.ts';
import { applyDecision } from '../src/data/review-actions.ts';

const settings = defaultSettings();
const user: AppUser = { id: 'cm1', email: 'cm@example.org', name: 'Demo Case Manager', role: 'case_manager', organizationId: 'org', organizationName: 'Demo' };
const analyze: Analyzer = async (input: ReviewInput) =>
  runValidation(input, extractWithRules(input.documents, settings.functionalAreas), { mode: 'mock', label: 'mock' },
    { cdsTemplate: settings.cdsTemplate, qaChecklist: settings.qaChecklist, functionalAreas: settings.functionalAreas });

function inputsFromSample(): Record<string, JournalFieldInput> {
  return Object.fromEntries(Object.entries(SAMPLE_ANNUAL_CHANGES).map(([id, [status, text]]) => [id, { fieldId: id, status, newText: text, note: '' }]));
}

async function buildApprovedReview() {
  const previous = previousValues(T, SAMPLE_PREVIOUS_JOURNAL);
  const draft = composeJournal({ template: T, assessmentDate: '2026-11-12', previous, inputs: inputsFromSample() });
  // The case manager edits the draft: the unreviewed "Self-reported assessment of health" is left blank.
  const edited = draft.text.replace(/Self-reported assessment of health: \[\[CLARIFY:[^\]]*\]\]/, 'Self-reported assessment of health:');
  const { review } = await approveJournal({
    user, analyze, caseIdentifier: 'DEMO-0002', assessmentType: 'Annual Redetermination', assessmentDate: '2026-11-12', program: 'HCB-NW',
    journalText: edited, inputs: inputsFromSample(), draftFields: draft.fields, template: T, previousReviewId: 'prev', previousAssessmentDate: '2025-11-06',
  });
  return { draft, edited, review };
}

const find = (r: ReturnType<typeof runIndependentQa>, id: string) => r.findings.find((f) => f.id === id);

describe('Annual assessment workflow (fictional November 12, 2026 sample)', () => {
  it('1. prepares the journal from the previous assessment and the new changes', async () => {
    const { draft } = await buildApprovedReview();
    const f = (id: string) => draft.fields.find((x) => x.fieldId === id)!;
    expect(f('assessment_date').content).toBe('11/12/2026');
    expect(f('location')).toMatchObject({ state: 'confirmed', content: 'Elder’s home in Riverton' });
    expect(f('formal_supports').state).toBe('changed');
    expect(f('formal_supports').changes.join(' ')).toMatch(/30 hours per week PCA \(one worker\) → 40 hours per week PCA \(two workers\)/i);
    expect(f('medical_conditions').changes.join(' ')).toMatch(/added: .*essential tremor/);
    expect(f('living_arrangements').changes.join(' ')).toMatch(/living arrangement no longer documented/);
    expect(f('medications').state).toBe('carried-flagged');
    // Not reviewed by the case manager → never carried forward as current.
    expect(f('self_reported_health').state).toBe('clarify');
    expect(f('self_reported_health').content).toMatch(/\[\[CLARIFY: Not yet reviewed\. Previously documented: "Elder described her health as fair\."/);
    expect(f('financial_worksheet').state).toBe('omitted');
    expect(draft.clarifyCount).toBe(1);
    expect(journalProblems(draft.text)[0]).toMatch(/1 item\(s\) still need clarification/);
    // The organization's headings and order are preserved.
    expect(draft.text.split('\n')[0]).toBe('Assessment Information');
    expect(draft.text).toContain('4) Conclusion: Eligibility Verification/Risk/Financial & Documents Reviewed/Follow-Up Plan');
    expect(draft.text).toContain('g. IDC with HC RN: None indicated at this time.');
  });

  it('2-11. generates the CDS, detects issues, scores, corrects and re-scores', async () => {
    let { review } = await buildApprovedReview();
    const ready = (r: ReviewRecord) => runIndependentQa(r, settings);

    // 2. CDS worksheet generated from the approved journal.
    expect(review.workflow!.stage).toBe('Journal Approved');
    const cds = (id: string) => review.analysis.cds.find((c) => c.fieldId === id)!;
    expect(cds('H2_eating').suggestedResponse).toMatch(/^0 - INDEPENDENT/);
    expect(cds('FIL_level').suggestedResponse).toMatch(/^1-C/);
    expect(cds('H2_bathing').candidates).toHaveLength(5);

    let qa = ready(review);
    // 3. Transfer contradiction. 4. Mobility inconsistency.
    expect(find(qa, 'journal_conflict:transfers')).toMatchObject({ title: 'Transfer contradiction', severity: 'Critical' });
    expect(find(qa, 'journal_conflict:indoor_locomotion')?.title).toMatch(/Mobility inconsistency/);
    expect(find(qa, 'classification:mobility_device')?.title).toMatch(/rolling walker observed/);
    // 5. Missing ADL/IADL details (level of assistance not stated).
    expect(qa.findings.filter((f) => f.kind === 'cds_unresolved' && f.category === 'Different levels of assistance').length).toBeGreaterThanOrEqual(8);
    // 6. Formal vs informal support question.
    expect(find(qa, 'classification:formal_informal')?.mismatch).toMatch(/informal support and as a \(paid\) PCA/);
    // 7. Records requiring verification.
    expect(qa.findings.filter((f) => f.kind === 'record_verification').length).toBeGreaterThanOrEqual(8);
    // 8. All 17 QA checks.
    expect(qa.qa).toHaveLength(17);
    // 9. Transparent score.
    const s1 = qa.score;
    // The specified weighting table totals 101 points; the score is normalized to 0–100.
    expect(s1.totalPoints).toBe(101);
    expect(s1.categories.reduce((n, c) => n + c.earned, 0)).toBeCloseTo(s1.earned, 5);
    expect(s1.score).toBeCloseTo((s1.earned / s1.applicablePoints) * 100, 0);
    expect(s1.readiness.ready).toBe(false);
    expect(s1.critical).toContain('Transfer contradiction');
    expect(qa.qa.find((q) => q.categoryId === 'narrative_cds')!.status).toBe('Mismatch');
    // 10. Correction report contents are available as findings with full detail.
    for (const f of qa.findings) expect(f.suggestedCorrection.length).toBeGreaterThan(5);

    // 11. Apply corrections through the Fix Documentation Issues loop.
    const act = async (id: string, action: Parameters<typeof applyFindingAction>[2]) => {
      const f = find(ready(review), id);
      expect(f, id).toBeTruthy();
      review = (await applyFindingAction(review, f!, action, user, analyze, T)).review;
    };
    await act('journal_conflict:transfers', { type: 'accept_option', optionId: 'keep_assistance' });
    expect(latestJournal(review)!.version).toBe(2);
    expect(latestJournal(review)!.text).toContain('independence with ambulation within the home, mobility in bed, eating, and telephone use');
    await act('journal_conflict:indoor_locomotion', { type: 'accept_option', optionId: 'keep_assistance' });
    expect(latestJournal(review)!.text).toContain('independence with mobility in bed, eating, and telephone use');
    expect(review.workflow!.lastRerun!.changedCds.some((c) => c.fieldId === 'H2_locomotion_in_home')).toBe(true);
    qa = ready(review);
    expect(find(qa, 'journal_conflict:transfers')).toBeUndefined();
    expect(find(qa, 'classification:mobility_device')).toBeUndefined();

    await act('classification:formal_informal', { type: 'provide_info', fieldId: 'informal_supports', content: 'Elder’s son provides unpaid emotional support and help with errands, and separately works as one of her paid PCAs through the PCA program.' });
    await act('classification:health_event', { type: 'provide_info', fieldId: 'changes_in_needs', content: 'Consumer reported no changes in her needs since the previous assessment. Cataract surgery in October 2026 was outpatient; no change in needs.' });
    await act('journal_missing:field_self_reported_health', { type: 'provide_info', fieldId: 'self_reported_health', content: 'Elder describes her health as fair.' });
    await act('journal_missing:qa_mls', { type: 'provide_info', fieldId: 'mls', content: 'MLS completed 11/12/2026; no follow-up needed.' });
    await act('journal_missing:qa_financial_consent', { type: 'provide_info', fieldId: 'financial_worksheet', content: 'Completed 11/12/2026.' });

    // Select verified levels for every CDS question the journal leaves open.
    for (const f of ready(review).findings.filter((x) => x.kind === 'cds_unresolved')) {
      review = (await applyFindingAction(review, f, { type: 'accept_option', optionId: 'answer_0' }, user, analyze, T)).review;
    }
    // Attest records verified in WellSky (case manager verification, labeled as attestation).
    for (const f of ready(review).findings.filter((x) => x.kind === 'record_verification')) {
      review = (await applyFindingAction(review, f, { type: 'attest', text: `Verified in WellSky on 11/13/2026 (${f.title})` }, user, analyze, T)).review;
    }
    // Confirm the remaining prepared CDS answers.
    for (const c of review.analysis.cds.filter((x) => x.mapped && x.status !== 'Not Documented' && !review.decisions[`cds:${x.fieldId}`])) {
      review = applyDecision(user, review, 'cds', c.fieldId, { status: 'approved', value: c.suggestedResponse, originalValue: c.suggestedResponse }).review;
    }

    qa = ready(review);
    const open = qa.openFindings.map((f) => `${f.id}: ${f.title}`);
    expect(open, open.join('\n')).toEqual([]);
    const s2 = qa.score;
    expect(s2.score).toBeGreaterThan(s1.score);
    expect(s2.critical).toEqual([]);
    expect(qa.qa.find((q) => q.categoryId === 'narrative_cds')!.status).toBe('Complete');
    // Still not ready until the case manager approves the final documentation.
    expect(s2.readiness.reasons.join(' ')).toMatch(/not approved the final documentation/);
    review = approveFinal(review, user, s2.score, 'Final documentation approved').review;
    const s3 = ready(review).score;
    expect(s3.readiness.ready).toBe(true);
    expect(s3.disclaimer).toMatch(/not an official AgeSpan QA score/);
    // The correction history is preserved.
    expect(latestJournal(review)!.version).toBeGreaterThanOrEqual(7);
    expect(review.workflow!.journal.versions[0].text).toContain('transfers, indoor/outdoor mobility');
    expect(Object.keys(review.workflow!.findingStates).length).toBeGreaterThan(10);
  });

  it('fills the CDS from the final journal so both records match, without guessing open answers', async () => {
    const { review } = await buildApprovedReview();
    const before = cdsJournalGaps(review);
    expect(before.unconfirmed.length).toBeGreaterThan(10);
    // A stale confirmed answer that differs from the journal is updated to the journal's answer.
    const ready = review.analysis.cds.find((c) => c.mapped && c.status === 'Ready for Review' && c.suggestedResponse)!;
    const stale = applyDecision(user, review, 'cds', ready.fieldId, { status: 'edited', value: 'WRONG', originalValue: ready.suggestedResponse, note: 'test' }).review;
    expect(cdsJournalGaps(stale).differs).toContain(ready.fieldId);
    const { review: matched, summary } = matchCdsToJournal(stale, user);
    expect(cdsJournalGaps(matched).total).toBe(0);
    expect(summary.updated).toBe(1);
    expect(matched.decisions[`cds:${ready.fieldId}`].value).toBe(ready.suggestedResponse);
    // Answers with more than one supported code stay unconfirmed for the case manager.
    const open = matched.analysis.cds.filter((c) => c.mapped && c.status === 'Needs Verification');
    expect(open.every((c) => !matched.decisions[`cds:${c.fieldId}`])).toBe(true);
    expect(matched.workflow!.cdsMatch!.journalVersion).toBe(1);
  });
});
