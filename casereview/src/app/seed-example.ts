// Seeds the fictional November 12, 2026 annual assessment for first-time hosted users.
import { DEFAULT_JOURNAL_TEMPLATE as T } from '../config/journal-template.ts';
import { SAMPLE_ANNUAL_CHANGES, SAMPLE_PREVIOUS_JOURNAL } from '../config/sample-data.ts';
import type { AppUser, AuditEntry, OrgSettings, ReviewRecord } from '../data/types.ts';
import { composeJournal, previousValues, type JournalFieldInput } from '../workflow/journal-builder.ts';
import { approveJournal } from '../workflow/engine.ts';
import { runAnalysis } from './run-analysis.ts';

export async function buildExampleReview(user: AppUser, settings: OrgSettings): Promise<{ review: ReviewRecord; audit: AuditEntry[] }> {
  const inputs: Record<string, JournalFieldInput> = Object.fromEntries(
    Object.entries(SAMPLE_ANNUAL_CHANGES).map(([id, [status, text]]) => [id, { fieldId: id, status, newText: text, note: '' }]),
  );
  const draft = composeJournal({ template: T, assessmentDate: '2026-11-12', previous: previousValues(T, SAMPLE_PREVIOUS_JOURNAL), inputs });
  const journalText = draft.text.replace(/Self-reported assessment of health: \[\[CLARIFY:[^\]]*\]\]/, 'Self-reported assessment of health:');
  return approveJournal({
    user, analyze: (input) => runAnalysis(input, { ...settings, aiMode: 'mock' }, { fictionalDataAttestation: true }),
    caseIdentifier: 'DEMO-0002 (fictional)', assessmentType: 'Annual Redetermination', assessmentDate: '2026-11-12', program: 'HCB-NW',
    journalText, inputs, draftFields: draft.fields, template: T, previousReviewId: null, previousAssessmentDate: '2025-11-06',
  });
}
