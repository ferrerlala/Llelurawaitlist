import { describe, expect, it } from 'vitest';
import { SAMPLE_TEMPLATE_NARRATIVE } from '../src/config/sample-data.ts';
import { parseDocument } from '../src/engine/assessment-parser.ts';
import { analyze, doc } from './helpers.ts';

const d = doc('t1', SAMPLE_TEMPLATE_NARRATIVE, 'Narrative / Journal Note', 'Template narrative');
const r = analyze([d]);
const vals = (key: string) => r.facts.filter((f) => f.key === key).map((f) => f.value);
const adl = (id: string) => r.adl.find((a) => a.areaId === id)!;
const cds = (id: string) => r.cds.find((c) => c.fieldId === id)!;
const qa = (id: string) => r.qa.find((q) => q.categoryId === id)!;

describe('Agency note template ("Label: value" fields)', () => {
  it('recognizes headings, labels, list markers and blank fields', () => {
    const { sentences, blankFields } = parseDocument(d);
    expect(blankFields.map((b) => b.label)).toEqual(['Self-reported assessment of health']);
    const copay = sentences.find((s) => /Copay/.test(s.text))!;
    expect(copay.label).toBe('Copay');
    expect(copay.text.startsWith('—')).toBe(false); // marker stripped, text still verbatim
    expect(copay.section).toBe('Financial');
    expect(sentences.find((s) => /IDC/.test(s.text))!.label).toBe('IDC with HC RN');
  });

  it('extracts labeled fields without the label text', () => {
    expect(vals('basic.location')).toEqual(['Elder’s home in Riverton']);
    expect(vals('basic.people_present')).toEqual(['Elder, elder’s son, PCA, and CM']);
    expect(vals('medical.cognitive_status')).toEqual(['Consumer appeared alert and oriented during the assessment']);
    expect(vals('financial.annual_income')).toEqual(['$24,300']);
    expect(vals('financial.copay')).toEqual(['$0']);
    expect(vals('financial.overdue_balance')).toEqual(['$0']);
    expect(vals('financial.masshealth')).toEqual(['Pending MassHealth Standard']);
    expect(vals('risk.level')).toEqual(['Risk 3']);
    expect(vals('risk.fil_code')).toEqual(['1C']);
    expect(vals('followup.next_assessment')).toEqual(['May 2027']);
    expect(vals('program.type')).toEqual(['HCB-NW']);
    expect(vals('services.personal_care')).toEqual(['40 hours per week PCA (two workers)']);
    expect(vals('medical.conditions')).toContain('history of pneumonia');
    expect(vals('medical.conditions')).toContain('COPD');
  });

  it('reads "reported independence with" and "Assistance is provided with"', () => {
    for (const id of ['bed_mobility', 'eating', 'telephone']) expect(adl(id).narrativeStatus, id).toBe('Independent');
    for (const id of ['meal_preparation', 'bathing', 'dressing', 'toileting', 'outdoor_mobility', 'shopping']) expect(adl(id).narrativeStatus, id).toBe('Needs Assistance');
    // Level of assistance is not stated, so the CDS response still needs verification.
    expect(cds('H2_bathing').status).toBe('Needs Verification');
    expect(cds('H2_bathing').candidates).toHaveLength(5);
  });

  it('flags activities the narrative documents as both independent and assisted', () => {
    expect(adl('transfers').narrativeStatus).toBe('Conflicting');
    expect(adl('indoor_locomotion').narrativeStatus).toBe('Conflicting');
    expect(cds('H2_transfer').status).toBe('Unable to Determine');
    expect(cds('FIL_deficits').suggestedResponse).not.toMatch(/Transfer|Locomotion in home/);
    const high = r.issues.filter((i) => i.priority === 'High').map((i) => i.title);
    expect(high).toContain('Narrative contradicts itself: Transfers');
    expect(high).toContain('Narrative contradicts itself: Indoor locomotion');
    expect(r.finalStatus).toBe('Corrections Required');
  });

  it('treats "none" statements as documented absences, not tasks or completions', () => {
    expect(r.facts.find((f) => f.key === 'goals.new')!.assertion).toBe('reported_absent');
    expect(r.facts.find((f) => f.key === 'followup.idc')!.assertion).toBe('reported_absent');
    expect(qa('idc').status).toBe('Needs Review');
    expect(r.tasks.map((t) => t.description)).toEqual(['Complete next assessment']);
    expect(r.tasks[0].dueDate).toBe('May 2027');
  });

  it('reports the blank template field and the surgery vs. "no changes" inconsistency', () => {
    expect(r.issues.some((i) => i.title === 'Template field left blank' && /Self-reported assessment of health/.test(i.problem))).toBe(true);
    expect(r.issues.some((i) => /Recent health event/.test(i.title) && /cataract surgery/.test(i.problem))).toBe(true);
  });

  it('keeps every fact tied to verbatim evidence', () => {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
    for (const f of r.facts) expect(norm(SAMPLE_TEMPLATE_NARRATIVE)).toContain(norm(f.sourceText));
    expect(r.rejectedFacts).toHaveLength(0);
  });
});
