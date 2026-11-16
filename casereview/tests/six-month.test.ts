// Six-month reassessment: the shorter journal format is chosen from the assessment type,
// a pasted previous assessment pre-fills every item, and annual-only QA items are Not Applicable.
import { describe, expect, it } from 'vitest';
import { journalTemplateFor, SIX_MONTH_JOURNAL_TEMPLATE as T6 } from '../src/config/journal-template.ts';
import { defaultSettings } from '../src/data/default-settings.ts';
import type { AppUser } from '../src/data/types.ts';
import { runValidation } from '../src/engine/analyze.ts';
import { extractWithRules } from '../src/engine/clinical-data-extractor.ts';
import type { ReviewInput } from '../src/engine/types.ts';
import { approveJournal, type Analyzer } from '../src/workflow/engine.ts';
import { runIndependentQa } from '../src/workflow/independent-qa.ts';
import { composeJournal, previousValues, readJournalField, setJournalField, type JournalFieldInput } from '../src/workflow/journal-builder.ts';

// Fictional six-month note in the agency format (spacing and missing colons as typed in real notes).
const PREVIOUS = `1)         Assessment Information
a.         Assessment Date: 5/6/26
b.         Location of HV: Elder home in Riverton
c.         Home Environment Clean and clear safety pathway to ambulate.
d.         People present at HV: Elder and CM.
e.         Observations of Consumer:  Elder was alert, and oriented.
f.          Health Assessment: wears glasses. No hearing aid and appetite is good.
g.         Additional Information: None
2)        Background: Basic Information/Medical & Fall Risk
a.         Age & Marital Status The consumer is a 77-year-old single female.
b.         Living Arrangements: Consumer lives alone
c.         Mood/Cognitive Status: positive attitude
d.         MLS Results: N/A
e.         Diagnoses: COPD, GERD, Arthritis, and Anxiety.
f.          Medications: No changes in medications.
g.         PCP/Specialist last/next appointment: Last appointment was April 2026, next appt not scheduled yet.
h.         Recent Hospitalizations: None
i.          Recent Falls: 1 no injuries
j.          Additional Information: no change.
3)        Needs/Supports/Services
a.         What consumers feel they need for service. Homemaking, Laundry and meal prep.
b.         ADLs and IADLs consumer assistance is needed for Homemaking services.
c.         Informal Supports:  neighbors assist with grocery shopping, transportation, ambulation outside of the home.
Consumer remains independent finance management, medication management, dressing, bathing, transferring, ambulation in the home, mobility in bed, eating, telephone use, toileting, and incontinence management.
d.         Formal Supports: None
e.         Other internal agency program enrollments: None
f.          Unmet ADL and IADL:
g.         Calculated FIL: 3C
h.         Proposed program and initial service plan: HCB/NW with 4hrs of Supportive Home health.
i.          Additional Information: none
4)        Conclusion: Risk/Follow-Up Plan
a.         Statement that Emergency Contacts were reviewed and updated on 5/6/26
b.         Risk Level: 3
c.         Planned Action/Follow-Up & Appropriate Referrals None
d.         Next Scheduled Assessment:  November 2026.`;

const settings = defaultSettings();
const user: AppUser = { id: 'cm1', email: 'cm@example.org', name: 'Demo Case Manager', role: 'case_manager', organizationId: 'org', organizationName: 'Demo' };
const analyze: Analyzer = async (input: ReviewInput) =>
  runValidation(input, extractWithRules(input.documents, settings.functionalAreas), { mode: 'mock', label: 'mock' },
    { cdsTemplate: settings.cdsTemplate, qaChecklist: settings.qaChecklist, functionalAreas: settings.functionalAreas });

describe('Six-month reassessment format', () => {
  it('is chosen from the assessment type', () => {
    expect(journalTemplateFor(settings, 'Six-Month Reassessment').id).toBe('six-month-journal-standard');
    expect(journalTemplateFor(settings, 'Annual Redetermination').id).toBe(settings.journalTemplate.id);
    expect(T6.fields.some((f) => /financial|copay|income|masshealth|eligibility/i.test(f.label))).toBe(false);
  });

  it('reads a pasted previous six-month note, including repeated labels, missing colons and wrapped lines', () => {
    const prev = previousValues(T6, PREVIOUS);
    expect(prev.home_environment.text).toBe('Clean and clear safety pathway to ambulate.');
    expect(prev.age_marital.text).toBe('The consumer is a 77-year-old single female.');
    expect(prev.consumer_needs.text).toBe('Homemaking, Laundry and meal prep.');
    expect(prev.info_additional.text).toBe('None');
    expect(prev.bg_additional.text).toBe('no change.');
    expect(prev.needs_additional.text).toBe('none');
    expect(prev.informal_supports.text).toContain('Consumer remains independent finance management');
    expect(prev.planned_action.text).toBe('None');
    expect(prev.fil.text).toBe('3C');
    const found = T6.fields.filter((f) => prev[f.id].text);
    expect(found.length).toBeGreaterThanOrEqual(T6.fields.length - 2);
  });

  it('builds the journal in the six-month format and keeps annual-only QA items Not Applicable', async () => {
    const prev = previousValues(T6, PREVIOUS);
    const inputs: Record<string, JournalFieldInput> = Object.fromEntries(T6.fields.filter((f) => prev[f.id].text).map((f) => [f.id, { fieldId: f.id, status: 'unchanged', newText: '', note: '' }]));
    inputs.people_present = { fieldId: 'people_present', status: 'changed', newText: 'Elder and CM.', note: '' };
    inputs.observations = { fieldId: 'observations', status: 'changed', newText: 'Elder was alert and oriented.', note: '' };
    inputs.pcp = { fieldId: 'pcp', status: 'changed', newText: 'Last appointment was October 2026, next appointment not scheduled yet.', note: '' };
    inputs.emergency_contacts = { fieldId: 'emergency_contacts', status: 'changed', newText: '11/5/26', note: '' };
    inputs.next_assessment = { fieldId: 'next_assessment', status: 'changed', newText: 'May 2027.', note: '' };
    const draft = composeJournal({ template: T6, assessmentDate: '2026-11-05', previous: prev, inputs });
    expect(draft.text.split('\n').slice(0, 2)).toEqual(['1) Assessment Information', 'a. Assessment Date: 11/5/2026']);
    expect(draft.text).toContain('4) Conclusion: Risk/Follow-Up Plan');
    expect(draft.text).not.toMatch(/Financial|Copay|Annual Packet|Eligibility/);
    // Editing one "Additional Information" line changes only that section.
    const edited = setJournalField(draft.text, T6, 'bg_additional', 'Consumer reports sleeping poorly.');
    expect(readJournalField(edited, T6.fields.find((f) => f.id === 'bg_additional')!)).toBe('Consumer reports sleeping poorly.');
    expect(readJournalField(edited, T6.fields.find((f) => f.id === 'info_additional')!)).toBe('None');

    const text = draft.text.replace(/\[\[CLARIFY:[^\]]*\]\]/g, 'None');
    const { review } = await approveJournal({
      user, analyze, caseIdentifier: 'DEMO-6M', assessmentType: 'Six-Month Reassessment', assessmentDate: '2026-11-05', program: 'HCB-NW',
      journalText: text, inputs, draftFields: draft.fields, template: T6, previousReviewId: null, previousAssessmentDate: '2026-05-06',
    });
    const qa = runIndependentQa(review, settings);
    for (const id of ['financial_consent', 'copay', 'mls', 'emergency_permission']) {
      expect(qa.qa.find((q) => q.categoryId === id)!.status).toBe('Not Applicable');
    }
    expect(qa.openFindings.some((f) => /financial|copay/i.test(f.id))).toBe(false);
  });
});
