// Journal-to-CDs QA workflow: journal checker, safe AI corrections, journal lock, scores never 100 while open.
import { describe, expect, it } from 'vitest';
import { DEFAULT_JOURNAL_TEMPLATE as T } from '../src/config/journal-template.ts';
import { SAMPLE_ANNUAL_CHANGES, SAMPLE_PREVIOUS_JOURNAL } from '../src/config/sample-data.ts';
import { defaultSettings } from '../src/data/default-settings.ts';
import type { AppUser } from '../src/data/types.ts';
import { runValidation } from '../src/engine/analyze.ts';
import { extractWithRules } from '../src/engine/clinical-data-extractor.ts';
import type { ReviewInput } from '../src/engine/types.ts';
import { approveJournal, journalLocked, lockJournal, recordAiCorrections, reviseJournal, latestJournal, type Analyzer } from '../src/workflow/engine.ts';
import { runIndependentQa } from '../src/workflow/independent-qa.ts';
import { composeJournal, previousValues, setJournalField, type JournalFieldInput } from '../src/workflow/journal-builder.ts';
import { lintJournal } from '../src/workflow/journal-lint.ts';
import { capScore, validationScores } from '../src/workflow/scores.ts';

const settings = defaultSettings();
const user: AppUser = { id: 'cm1', email: 'cm@example.org', name: 'Demo Case Manager', role: 'case_manager', organizationId: 'org', organizationName: 'Demo' };
const analyze: Analyzer = async (input: ReviewInput) =>
  runValidation(input, extractWithRules(input.documents, settings.functionalAreas), { mode: 'mock', label: 'mock' },
    { cdsTemplate: settings.cdsTemplate, qaChecklist: settings.qaChecklist, functionalAreas: settings.functionalAreas });

async function review(text?: (t: string) => string) {
  const inputs: Record<string, JournalFieldInput> = Object.fromEntries(Object.entries(SAMPLE_ANNUAL_CHANGES).map(([id, [status, t]]) => [id, { fieldId: id, status, newText: t, note: '' }]));
  const draft = composeJournal({ template: T, assessmentDate: '2026-11-12', previous: previousValues(T, SAMPLE_PREVIOUS_JOURNAL), inputs });
  const journalText = text ? text(draft.text) : draft.text;
  return (await approveJournal({ user, analyze, caseIdentifier: 'DEMO-0003', assessmentType: 'Annual Redetermination', assessmentDate: '2026-11-12', program: 'HCB-NW',
    journalText, inputs, draftFields: draft.fields, template: T, previousReviewId: 'prev', previousAssessmentDate: '2025-11-06' })).review;
}

describe('Journal-to-CDs QA workflow', () => {
  it('finds spelling errors with a safe correction and missing items without inventing content', async () => {
    const r = await review((t) => setJournalField(t, T, 'pcp', 'Consumer recieved care from her PCP.'));
    const lint = lintJournal(latestJournal(r)!.text, T);
    const spell = lint.find((l) => l.fieldId === 'pcp' && l.kind === 'Spelling');
    expect(spell?.corrected).toMatch(/received/);
    for (const m of lint.filter((l) => l.kind === 'Missing')) expect(m.corrected).toBeUndefined();
  });

  it('locks the approved journal; any later edit unlocks it', async () => {
    let r = await review();
    expect(journalLocked(r)).toBe(false);
    r = lockJournal(r, user).review;
    expect(journalLocked(r)).toBe(true);
    const v = latestJournal(r)!;
    r = (await reviseJournal(r, v.text + '\n', 'edit', user, analyze)).review;
    expect(journalLocked(r)).toBe(false);
  });

  it('records AI corrections with before and after', async () => {
    const r = recordAiCorrections(await review(), user, [{ field: 'PCP', before: 'recieved', after: 'received' }]);
    expect(r.workflow!.aiCorrections!.at(-1)!.items[0]).toEqual({ field: 'PCP', before: 'recieved', after: 'received' });
  });

  it('never reports 100 while anything is open', async () => {
    const r = await review();
    const qa = runIndependentQa(r, settings);
    const s = validationScores(r, T, qa, lintJournal(latestJournal(r)!.text, T));
    if (s.unresolved + s.cmInput > 0) {
      expect(s.journal < 100 || s.cdsReport < 100 || s.matching < 100).toBe(true);
    }
    expect(capScore(100, 1)).toBe(99);
    expect(capScore(100, 0)).toBe(100);
  });
});
