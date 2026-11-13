// cds-mapper: organizes extracted facts into the configured CDS template.
// Missing information is reported as "Not Documented" — never converted to "No".

import { comparable, evidenceOf, type FactIndex } from './facts.ts';
import { findAreas } from './clinical-data-extractor.ts';
import type { CdsFieldDef, CdsRecordEntry, CdsResponse, CdsStatus, CdsTemplate, Confidence, Fact } from './types.ts';
import type { FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { incompleteNames } from './names.ts';
import { COMPARABLE_KEYS } from './discrepancy-detector.ts';

const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function lowestConfidence(facts: Fact[]): Confidence {
  return facts.reduce<Confidence>((acc, f) => (CONF_RANK[f.confidence] < CONF_RANK[acc] ? f.confidence : acc), 'high');
}

function matchChoice(value: string, choices: string[]): string | null {
  const v = value.toLowerCase().trim();
  return choices.find((c) => c.toLowerCase() === v) ?? null;
}

function cdsRecordValueFor(field: CdsFieldDef, entries: CdsRecordEntry[] | null, areas: FunctionalAreaDef[]): string | null {
  if (!entries) return null;
  const label = field.label.toLowerCase();
  const fnArea = field.id.startsWith('fn_') ? areas.find((a) => `fn_${a.id}` === field.id) : undefined;
  const e = fnArea
    ? entries.find((x) => findAreas(x.label, [fnArea]).length > 0)
    : entries.find((x) => x.label.toLowerCase() === label || x.label.toLowerCase().includes(label) || label.includes(x.label.toLowerCase()));
  return e ? e.value : null;
}

export function describeAssertion(f: Fact): string {
  if (f.key.startsWith('functional.')) {
    return f.detail ? `${f.value} (${f.detail})` : f.value;
  }
  const base = f.detail ? `${f.value} — ${f.detail}` : f.value;
  return base;
}

export function mapToCds(template: CdsTemplate, facts: FactIndex, cdsRecord: CdsRecordEntry[] | null, areas: FunctionalAreaDef[]): CdsResponse[] {
  return template.fields.map((field) => {
    const found = facts.any(field.factKeys);
    const cdsRecordValue = cdsRecordValueFor(field, cdsRecord, areas);
    const base = {
      fieldId: field.id, section: field.section, label: field.label, provisional: template.provisional, cdsRecordValue,
    };
    if (!found.length) {
      return {
        ...base,
        suggestedResponse: 'Not documented',
        evidence: [],
        confidence: 'n/a' as const,
        status: 'Not Documented' as CdsStatus,
        rationale: `No supporting statement in the submitted documentation. Do not enter "No" or a default value; obtain and document the information${field.requiresRecord ? ` (${field.requiresRecord})` : ''}.`,
      };
    }

    // Conflicting values for a single-valued field.
    const multiple = found.some((f) => f.key === 'medical.conditions' || f.key.startsWith('services.informal') || f.key === 'followup.idc' || f.key === 'goals.identified_needs' || f.key === 'goals.new');
    const distinct = new Set(found.map(comparable));
    const isFunctional = field.factKeys.some((k) => k.startsWith('functional.'));
    if (isFunctional) {
      const values = new Set(found.map((f) => f.value));
      const indep = values.has('Independent');
      const help = values.has('Needs Assistance') || values.has('Dependent') || values.has('Assistance Provided');
      if (indep && help) {
        return {
          ...base, suggestedResponse: 'Unable to determine – conflicting statements', evidence: found.map(evidenceOf), confidence: 'low' as const,
          status: 'Unable to Determine' as CdsStatus, rationale: 'The documentation contains conflicting statements for this activity. Both are shown; the system does not choose.',
        };
      }
    } else if (!multiple && distinct.size > 1 && new Set(found.map((f) => f.key)).size === 1 && COMPARABLE_KEYS.some((k) => k.key === found[0].key)) {
      return {
        ...base, suggestedResponse: `Unable to determine – conflicting values: ${[...new Set(found.map((f) => f.value))].join(' vs. ')}`,
        evidence: found.map(evidenceOf), confidence: 'low' as const, status: 'Unable to Determine' as CdsStatus,
        rationale: 'Documents disagree. Verify against the source record; the system does not choose a value.',
      };
    }

    const primary = found.filter((f) => f.key === field.factKeys[0]);
    let used = primary.length ? primary : found;
    if (isFunctional) {
      // Use the most specific statement; all statements remain as evidence.
      const rank: Record<string, number> = { Dependent: 5, 'Needs Assistance': 4, Independent: 3, 'Assistance Provided': 2, 'Mentioned - Level Not Stated': 1 };
      const top = Math.max(...used.map((f) => rank[f.value] ?? 0));
      used = used.filter((f) => (rank[f.value] ?? 0) === top);
    }
    let suggested = [...new Set(used.map(describeAssertion))].join('; ');
    const conf = lowestConfidence(used);
    let status: CdsStatus = 'Ready for Review';
    const reasons: string[] = [];

    if (isFunctional) {
      const v = used[0].value;
      if (v === 'Assistance Provided' || v === 'Mentioned - Level Not Stated') {
        status = 'Needs Verification';
        reasons.push('The narrative references this activity but does not state the consumer\'s level of independence.');
      } else if (used.some((f) => /level not specified/i.test(f.detail))) {
        status = 'Needs Verification';
        reasons.push('The narrative documents that assistance is needed but not the level (e.g. supervision, limited, extensive). Verify the level before entering the CDS response.');
      }
    }
    if (used.some((f) => f.assertion === 'uncertain')) {
      status = 'Needs Verification';
      reasons.push('Statement is uncertain or conditional.');
    }
    if (used.some((f) => f.assertion === 'declined' || f.assertion === 'not_completed')) {
      reasons.push('Documented as declined / not completed — do not record as completed.');
    }
    if (used.some((f) => f.assertion === 'reported_absent')) {
      reasons.push('Documented as reported absent ("none reported"), which is different from not documented.');
    }
    if (conf !== 'high') {
      status = 'Needs Verification';
      reasons.push(`Extraction confidence is ${conf}.`);
    }
    if (field.requiresRecord) {
      status = 'Needs Verification';
      reasons.push(`Narrative statement only. Requires verification against: ${field.requiresRecord}.`);
    }
    if (field.choices.length) {
      const choice = matchChoice(used[0].value, field.choices);
      if (choice) suggested = choice;
      else {
        status = 'Needs Verification';
        reasons.push('Value does not map to a configured answer choice.');
      }
    }
    if (cdsRecordValue !== null && isFunctional) {
      reasons.push(`Supplied CDS record value: "${cdsRecordValue}" (see ADL/IADL comparison).`);
    }
    if (field.factKeys.includes('followup.idc')) {
      const partial = used.flatMap((f) => incompleteNames(f.value));
      if (partial.length) {
        status = 'Needs Verification';
        reasons.push(`Participant full name missing: ${partial.join(', ')}.`);
      }
    }
    if (template.provisional) reasons.push('Provisional field mapping.');

    return {
      ...base,
      suggestedResponse: suggested,
      evidence: found.map(evidenceOf),
      confidence: conf,
      status,
      rationale: reasons.join(' '),
    };
  });
}
