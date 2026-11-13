// cds-mapper: prepares suggested responses for every question in the configured CDS template.
//
// * Questions with answer rules map narrative facts to the instrument's answer choices. When the
//   narrative supports more than one code, all candidates are listed for the case manager.
// * Questions without a narrative mapping are "Not Documented" and must be completed from the
//   assessment.
// * Missing information is never converted to "No" / "0 - Not present".

import type { FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { findAreas } from './clinical-data-extractor.ts';
import { COMPARABLE_KEYS } from './discrepancy-detector.ts';
import { comparable, evidenceOf, type FactIndex } from './facts.ts';
import { incompleteNames } from './names.ts';
import type { AnswerRule, CdsFieldDef, CdsRecordEntry, CdsResponse, CdsStatus, CdsTemplate, Confidence, Fact } from './types.ts';

const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const lowestConfidence = (facts: Fact[]): Confidence =>
  facts.reduce<Confidence>((acc, f) => (CONF_RANK[f.confidence] < CONF_RANK[acc] ? f.confidence : acc), 'high');

const MULTI_VALUE_KEYS = new Set(['medical.conditions', 'services.informal_supports', 'followup.idc', 'goals.identified_needs', 'goals.new', 'basic.observations', 'medical.health_status_change']);

/** Resolve an answer code ("0", "1-C") or text prefix ("Not completed") to the instrument's choice text. */
export function resolveChoice(code: string, choices: string[]): string | null {
  const c = code.trim().toLowerCase();
  const hasLetters = /[a-z]/.test(c);
  return (
    choices.find((x) => x.toLowerCase() === c) ??
    choices.find((x) => {
      const l = x.toLowerCase();
      if (!l.startsWith(c)) return false;
      const next = l.charAt(c.length);
      return hasLetters ? next === '' || /[\s:(-]/.test(next) : next === ' ' || next === ':' || next === '';
    }) ??
    null
  );
}

function ruleMatches(rule: AnswerRule, f: Fact): boolean {
  if (rule.factKey && rule.factKey !== f.key) return false;
  if (rule.assertion && rule.assertion !== f.assertion) return false;
  if (rule.valueMatches && !new RegExp(rule.valueMatches, 'i').test(f.value)) return false;
  return true;
}

function cdsRecordValueFor(field: CdsFieldDef, entries: CdsRecordEntry[] | null, areas: FunctionalAreaDef[]): string | null {
  if (!entries) return null;
  const fnKeys = field.factKeys.filter((k) => k.startsWith('functional.'));
  if (fnKeys.length === 1 && !/who helps/i.test(field.label)) {
    const area = areas.find((a) => `functional.${a.id}` === fnKeys[0]);
    const e = area ? entries.find((x) => findAreas(x.label, [area]).length > 0) : undefined;
    return e ? e.value : null;
  }
  const label = field.label.toLowerCase();
  const e = entries.find((x) => x.label.toLowerCase() === label);
  return e ? e.value : null;
}

export function describeAssertion(f: Fact): string {
  if (f.key.startsWith('functional.')) return f.detail ? `${f.value} (${f.detail})` : f.value;
  return f.detail ? `${f.value} — ${f.detail}` : f.value;
}

const notDocumented = (field: CdsFieldDef, mapped: boolean) => ({
  suggestedResponse: 'Not documented',
  evidence: [],
  candidates: [],
  confidence: 'n/a' as const,
  status: 'Not Documented' as CdsStatus,
  rationale: mapped
    ? `No supporting statement in the submitted documentation. Do not enter "No" or a default value; obtain and document the information${field.requiresRecord ? ` (${field.requiresRecord})` : ''}.`
    : 'This question is not prepared from the narrative. Complete it from the assessment.',
});

export function mapToCds(template: CdsTemplate, facts: FactIndex, cdsRecord: CdsRecordEntry[] | null, areas: FunctionalAreaDef[]): CdsResponse[] {
  return template.fields.map((field) => {
    const type = field.type ?? (field.choices.length ? 'single' : 'text');
    const mapped = field.factKeys.length > 0;
    const functional = field.factKeys.some((k) => k.startsWith('functional.'));
    const base = {
      fieldId: field.id, section: field.section, label: field.label, code: field.code ?? '', group: field.group ?? '', type,
      choices: field.choices, mapped, functional, provisional: template.provisional, cdsRecordValue: cdsRecordValueFor(field, cdsRecord, areas),
    };
    const all = facts.any(field.factKeys);
    if (!all.length) return { ...base, ...notDocumented(field, mapped) };

    // Narrative contradicts itself about a functional activity: never choose.
    if (functional && field.factKeys.length === 1) {
      const values = new Set(all.map((f) => f.value));
      if (values.has('Independent') && (values.has('Needs Assistance') || values.has('Dependent') || values.has('Assistance Provided'))) {
        return {
          ...base, suggestedResponse: 'Unable to determine – conflicting statements', candidates: [], evidence: all.map(evidenceOf), confidence: 'low' as const,
          status: 'Unable to Determine' as CdsStatus, rationale: 'The narrative documents this activity as both independent and assisted. Both statements are shown; the system does not choose.',
        };
      }
    }

    const reasons: string[] = [];
    let status: CdsStatus = 'Ready for Review';
    let suggested: string;
    let candidates: string[] = [];
    let used: Fact[] = all;

    if (field.answerRules?.length) {
      // ---------- Rule-based answers ----------
      const hits: { fact: Fact; rule: AnswerRule; resolved: string[]; text?: string }[] = [];
      // Functional activities the narrative documents as both independent and assisted are never counted.
      const conflicted = new Set(
        field.factKeys.filter((k) => k.startsWith('functional.')).filter((k) => {
          const v = new Set(facts.get(k).map((f) => f.value));
          return v.has('Independent') && (v.has('Needs Assistance') || v.has('Dependent') || v.has('Assistance Provided'));
        }),
      );
      if (conflicted.size) reasons.push(`Not listed because the narrative contradicts itself: ${[...conflicted].map((k) => k.replace('functional.', '').replace(/_/g, ' ')).join(', ')}.`);
      for (const f of all.filter((x) => !conflicted.has(x.key))) {
        const rule = field.answerRules.find((r) => ruleMatches(r, f));
        if (!rule) continue;
        let codes = rule.choices ?? [];
        if (rule.captureChoice) {
          const m = f.value.match(new RegExp(rule.valueMatches ?? '', 'i'));
          codes = m?.[rule.captureChoice] ? [m[rule.captureChoice]] : [];
        }
        const resolved = codes.map((c) => resolveChoice(c, field.choices)).filter((x): x is string => !!x);
        hits.push({ fact: f, rule, resolved, text: rule.text });
      }
      if (!hits.length) return { ...base, ...notDocumented(field, mapped) };
      used = hits.map((h) => h.fact);
      for (const n of new Set(hits.map((h) => h.rule.note).filter(Boolean))) reasons.push(n as string);
      if (hits.some((h) => h.rule.verify)) status = 'Needs Verification';

      if (type === 'text' || type === 'date') {
        suggested = [...new Set(hits.map((h) => h.text ?? h.fact.value))].join('; ');
      } else if (type === 'multi') {
        candidates = [...new Set(hits.flatMap((h) => h.resolved))];
        suggested = candidates.length ? candidates.join('; ') : 'Documented, but no answer choice can be suggested';
        if (!candidates.length) status = 'Needs Verification';
        if (candidates.length) reasons.push('Only items supported by the narrative are suggested; other items must be assessed, not assumed absent.');
      } else {
        const sets = hits.map((h) => h.resolved);
        const union = [...new Set(sets.flat())];
        const agree = sets.every((s) => s.length === sets[0].length && s.every((x) => sets[0].includes(x)));
        if (union.length === 1 && agree) {
          suggested = union[0];
        } else if (union.length) {
          candidates = union;
          status = 'Needs Verification';
          suggested = `Select after verification: ${union.join(' | ')}`;
          if (!agree) reasons.push('Statements supporting this question point to different answers.');
        } else {
          status = 'Needs Verification';
          suggested = 'Documented, but the level is not stated — select after verification';
        }
      }
    } else {
      // ---------- Free-text / provisional fields ----------
      const multiple = all.some((f) => MULTI_VALUE_KEYS.has(f.key));
      const distinct = new Set(all.map(comparable));
      if (!multiple && distinct.size > 1 && new Set(all.map((f) => f.key)).size === 1 && COMPARABLE_KEYS.some((k) => k.key === all[0].key)) {
        return {
          ...base, suggestedResponse: `Unable to determine – conflicting values: ${[...new Set(all.map((f) => f.value))].join(' vs. ')}`, candidates: [],
          evidence: all.map(evidenceOf), confidence: 'low' as const, status: 'Unable to Determine' as CdsStatus,
          rationale: 'Documents disagree. Verify against the source record; the system does not choose a value.',
        };
      }
      const primary = all.filter((f) => f.key === field.factKeys[0]);
      used = primary.length ? primary : all;
      suggested = [...new Set(used.map(describeAssertion))].join('; ');
      if (field.choices.length) {
        const choice = resolveChoice(used[0].value, field.choices);
        if (choice) suggested = choice;
        else { status = 'Needs Verification'; reasons.push('Value does not map to a configured answer choice.'); }
      }
    }

    const conf = lowestConfidence(used);
    if (used.some((f) => f.assertion === 'uncertain')) { status = 'Needs Verification'; reasons.push('Statement is uncertain or conditional.'); }
    if (used.some((f) => f.assertion === 'declined' || f.assertion === 'not_completed')) reasons.push('Documented as declined / not completed — do not record as completed.');
    if (used.some((f) => f.assertion === 'reported_absent')) reasons.push('Documented absence ("none reported"), which is different from not documented.');
    if (functional && used.some((f) => /level not specified/i.test(f.detail))) {
      status = 'Needs Verification';
      reasons.push('The narrative documents that assistance is needed but not the level.');
    }
    if (conf !== 'high') { status = 'Needs Verification'; reasons.push(`Extraction confidence is ${conf}.`); }
    if (field.requiresRecord) { status = 'Needs Verification'; reasons.push(`Narrative statement only. Requires verification against: ${field.requiresRecord}.`); }
    if (field.factKeys.includes('followup.idc')) {
      const partial = used.flatMap((f) => incompleteNames(f.value));
      if (partial.length) { status = 'Needs Verification'; reasons.push(`Participant full name missing: ${partial.join(', ')}.`); }
    }
    if (base.cdsRecordValue !== null && functional) reasons.push(`Supplied CDS record value: "${base.cdsRecordValue}" (see ADL/IADL comparison).`);
    if (field.guidance) reasons.push(field.guidance);
    if (template.provisional) reasons.push('Provisional field mapping.');

    return {
      ...base, suggestedResponse: suggested, candidates, evidence: (field.answerRules?.length ? used : all).map(evidenceOf), confidence: conf, status, rationale: [...new Set(reasons)].join(' '),
    };
  });
}
