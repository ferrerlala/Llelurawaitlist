import { describe, expect, it } from 'vitest';
import { buildCds3CmTemplate, CDS_3_CM_INSTRUMENT, resolveMappings } from '../src/config/cds-3-cm/index.ts';
import { resolveChoice } from '../src/engine/cds-mapper.ts';
import { SAMPLE_TEMPLATE_NARRATIVE } from '../src/config/sample-data.ts';
import { analyze, doc } from './helpers.ts';

describe('CDS-3-CM v3.3.2 instrument', () => {
  it('contains the parsed questions and answer choices', () => {
    expect(CDS_3_CM_INSTRUMENT.formCode).toBe('CDS-3-CM');
    expect(CDS_3_CM_INSTRUMENT.version).toBe('3.3.2');
    expect(CDS_3_CM_INSTRUMENT.fields.length).toBeGreaterThan(500);
    const bathing = CDS_3_CM_INSTRUMENT.fields.find((f) => /^j\. BATHING/.test(f.label))!;
    expect(bathing.choices).toContain('6 - TOTAL DEPENDENCE-Full performance of activity by another');
    const fil = CDS_3_CM_INSTRUMENT.fields.find((f) => /Functional Impairment Level \(FIL\)\.$/.test(f.label))!;
    expect(fil.choices).toHaveLength(9);
  });

  it('contains no consumer identifiers from the form printout', () => {
    const json = JSON.stringify(CDS_3_CM_INSTRUMENT);
    expect(json).not.toMatch(/\(\d{6,}\)/); // "Name (ID)" page headers
    expect(json).not.toMatch(/\.afm|Page \d+ of \d+/);
  });

  it('resolves every narrative mapping to an instrument question', () => {
    expect(resolveMappings().unresolved).toEqual([]);
    const t = buildCds3CmTemplate();
    expect(t.provisional).toBe(false);
    expect(t.fields.filter((f) => f.factKeys.length).length).toBeGreaterThan(100);
  });

  it('resolves answer codes and text prefixes to choices exactly', () => {
    const choices = ['0 - INDEPENDENT-did on own', '1 - SOME HELP', '10 - ADL DEFICITS / Transfer', '1-C : Critical Unmet Need', '1-NC: No critical', 'Not completed'];
    expect(resolveChoice('1', choices)).toBe('1 - SOME HELP');
    expect(resolveChoice('10', choices)).toBe('10 - ADL DEFICITS / Transfer');
    expect(resolveChoice('1-C', choices)).toBe('1-C : Critical Unmet Need');
    expect(resolveChoice('1-NC', choices)).toBe('1-NC: No critical');
    expect(resolveChoice('Not completed', choices)).toBe('Not completed');
    expect(resolveChoice('7', choices)).toBeNull();
  });

  it('checks the documented FIL against the narrative without certifying it', () => {
    const r = analyze([doc('t', SAMPLE_TEMPLATE_NARRATIVE)]);
    const q = r.qa.find((x) => x.categoryId === 'fil')!;
    expect(q.status).toBe('Unable to Verify');
    expect(q.recommendedCorrection).toMatch(/is possible given the narrative \(4–6 ADL/);
    expect(r.cds.find((c) => c.fieldId === 'FIL_level')!.suggestedResponse).toMatch(/^1-C :/);
    expect(r.cds.find((c) => c.fieldId === 'FIL_level')!.status).toBe('Needs Verification');
  });

  it('compares CDS answer codes pasted from WellSky', () => {
    const r = analyze([doc('n', 'Consumer reported independence with eating and bathing.'), doc('c', 'g. EATING: 0 - INDEPENDENT-No help, setup or oversight\nj. BATHING: 4 - EXTENSIVE ASSISTANCE-Client performed part of activity on own', 'CDS Record')]);
    expect(r.adl.find((a) => a.areaId === 'eating')!.result).toBe('Match');
    expect(r.adl.find((a) => a.areaId === 'bathing')!.result).toBe('Mismatch');
  });
});
