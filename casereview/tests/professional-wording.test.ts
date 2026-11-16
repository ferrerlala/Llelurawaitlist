// Professional wording: rewrites how lines are said, never the facts.
import { describe, expect, it } from 'vitest';
import { SIX_MONTH_JOURNAL_TEMPLATE as T6 } from '../src/config/journal-template.ts';
import { polishJournal, polishValue } from '../src/workflow/professional-wording.ts';

describe('Professional wording', () => {
  it('turns shorthand into full professional sentences', () => {
    expect(polishValue('mood_cognitive', 'positive attitude')).toBe('Consumer presented with a positive attitude.');
    expect(polishValue('falls', '1 no injuries')).toBe('Consumer reported one fall since the last assessment, with no injuries.');
    expect(polishValue('medications', 'No changed-on medications.')).toBe('Medications were reviewed with the consumer; no changes were reported.');
    expect(polishValue('pcp', 'Last appointment was October 2026, next appt not schedule yet.')).toBe('Last appointment was October 2026; the next appointment has not been scheduled yet.');
    expect(polishValue('hospitalizations', 'None')).toBe('Consumer reported no recent hospitalizations.');
    expect(polishValue('consumer_needs', 'Homemaking, Laundry and meal prep.')).toBe('Consumer reports needing assistance with homemaking, laundry and meal preparation.');
    expect(polishValue('memory_screening', 'N/A')).toBe('N/A');
    expect(polishValue('people_present', 'Elder and CM.')).toBe('Elder and case manager.');
  });

  it('marks consumer beliefs as not confirmed diagnoses', () => {
    const out = polishValue('medical_conditions', "COPD, GERD, Arthritis, and Anxiety, Sleep disorder-doesn't sleep well and so stays up late and believes it could be PTSD. May have OCD tendencies due to anxiety.");
    expect(out).toContain('COPD, GERD, Arthritis, and Anxiety. Consumer reports difficulty sleeping');
    expect(out).toContain('PTSD (not a confirmed diagnosis)');
    expect(out).toContain('OCD tendencies (not a confirmed diagnosis)');
  });

  it('keeps every number, date and clarification marker', () => {
    const text = '1) Assessment Information\na. Assessment Date: 11/5/2026\nd. People present at HV: Elder and CM.\n2) Background: Basic Information/Medical & Fall Risk\ni. Recent Falls: 2 no injuries\n3) Needs/Supports/Services\nf. Unmet ADL and IADL: [[CLARIFY: document]]\nh. Proposed program and initial service plan: HCB/NW with 4hrs of home health';
    const { text: out, changes } = polishJournal(text, T6);
    expect(out).toContain('a. Assessment Date: 11/5/2026');
    expect(out).toContain('[[CLARIFY: document]]');
    expect(out).toContain('4 hours');
    expect(out).toContain('two falls');
    for (const c of changes) for (const d of c.before.match(/\d+/g) ?? []) expect(c.after.includes(d) || /one|two|three|four|five/.test(c.after)).toBe(true);
  });
});
