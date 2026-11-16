// Journal ↔ CDS consistency validation.
//
// Produces findings that compare the approved journal with the CDS preparation worksheet
// (suggested answers and the case manager's decisions). Findings never change the journal or
// the CDS: they offer options the case manager must explicitly accept.

import { DEFAULT_FUNCTIONAL_AREAS, functionalFactKey, type FunctionalAreaDef } from '@shared/fact-catalog.ts';
import { FIL_DEFINITIONS } from '../config/cds-3-cm/mapping.ts';
import type { JournalTemplate } from '../config/journal-template.ts';
import { stripMarker, splitLabel } from '../engine/assessment-parser.ts';
import { findAreas } from '../engine/clinical-data-extractor.ts';
import { evidenceOf, FactIndex } from '../engine/facts.ts';
import { filConsistency } from '../engine/qa-checklist-engine.ts';
import type { AdlComparisonRow, AnalysisResult, CdsResponse, QaChecklist } from '../engine/types.ts';
import type { ReviewDecision } from '../data/types.ts';
import { fieldForLine, readJournalField } from './journal-builder.ts';
import type { ConsistencyFinding, FindingOption, FindingSeverity } from './types.ts';

const HELP = ['Needs Assistance', 'Dependent', 'Assistance Provided'];

// ---------------------------------------------------------------------------
// List editing used to build contradiction-resolution options
// ---------------------------------------------------------------------------
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Remove an activity from the list in a sentence such as "independence with A, B, and C." */
export function removeActivity(sentence: string, area: FunctionalAreaDef): string | null {
  const m = sentence.match(/^(.*?\b(?:with|for)\s+)(.+?)([.;]?)$/i);
  if (!m) return null;
  const [, head, list, tail] = m;
  const items = list.split(/,\s*(?:and\s+)?|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  let changed = false;
  for (const item of items) {
    const pair = item.match(/^([a-z]+)\/([a-z]+)\s+(mobility|locomotion|ambulation)$/i);
    if (pair) {
      const first = `${pair[1]} ${pair[3]}`;
      const second = `${pair[2]} ${pair[3]}`;
      const hitFirst = findAreas(first, [area]).length > 0;
      const hitSecond = findAreas(second, [area]).length > 0;
      if (hitFirst && !hitSecond) { out.push(second); changed = true; continue; }
      if (hitSecond && !hitFirst) { out.push(first); changed = true; continue; }
      if (hitFirst && hitSecond) { changed = true; continue; }
      out.push(item);
      continue;
    }
    if (findAreas(item, [area]).length) { changed = true; continue; }
    out.push(item);
  }
  if (!changed) return null;
  if (!out.length) return '';
  return `${head}${joinList(out)}${tail || '.'}`;
}

function adlLineOptions(journal: string, template: JournalTemplate, row: AdlComparisonRow, area: FunctionalAreaDef, facts: FactIndex): FindingOption[] {
  const field = template.fields.find((f) => f.id === 'adls');
  if (!field) return [];
  const line = readJournalField(journal, field);
  if (!line) return [];
  const list = facts.get(functionalFactKey(area.id));
  const indep = list.find((f) => f.value === 'Independent')?.sourceText;
  const help = list.find((f) => HELP.includes(f.value))?.sourceText;
  if (!indep || !help) return [];
  const bodyOf = (s: string) => (s.includes(':') && line.includes(s.slice(s.indexOf(':') + 1).trim()) ? s.slice(s.indexOf(':') + 1).trim() : s);
  const make = (keep: 'independent' | 'assistance'): FindingOption | null => {
    const target = bodyOf(keep === 'independent' ? help : indep);
    const edited = removeActivity(target, area);
    if (edited === null || !line.includes(target)) return null;
    const content = line.replace(target, edited).replace(/\s{2,}/g, ' ').trim();
    return {
      id: `keep_${keep}`,
      label: keep === 'independent'
        ? `${row.label}: consumer is independent — remove it from the assistance statement`
        : `${row.label}: consumer needs assistance — remove it from the independence statement`,
      journalPatch: { fieldId: 'adls', content },
    };
  };
  return [make('assistance'), make('independent')].filter((x): x is FindingOption => !!x);
}

// ---------------------------------------------------------------------------
const QA_FIELD: Record<string, string> = {
  financial_consent: 'financial_worksheet', mls: 'mls', idc: 'idc', emergency_permission: 'ems_permission', goals: 'goals',
  fall_risk: 'falls', risk_worksheet: 'risk', contact_info: 'emergency_contacts', timely_followup: 'planned_action', copay: 'copay',
  program_care_plan: 'program', fil: 'risk',
};

const finalAnswer = (_c: CdsResponse, d: ReviewDecision | undefined) =>
  d && d.status !== 'rejected' ? d.value : null;

export interface FindingInputs {
  analysis: AnalysisResult;
  decisions: Record<string, ReviewDecision>;
  journalText: string;
  template: JournalTemplate;
  checklist: QaChecklist;
  areas?: FunctionalAreaDef[];
}

export function buildFindings(inp: FindingInputs): ConsistencyFinding[] {
  const { analysis: a, decisions, journalText, template } = inp;
  const areas = inp.areas ?? DEFAULT_FUNCTIONAL_AREAS;
  const facts = new FactIndex(a.facts.filter((f) => f.location.docType !== 'CDS Record'));
  const out: ConsistencyFinding[] = [];
  const add = (x: Omit<ConsistencyFinding, 'evidence' | 'options' | 'cdsFieldIds' | 'qaCategoryIds'> & Partial<Pick<ConsistencyFinding, 'evidence' | 'options' | 'cdsFieldIds' | 'qaCategoryIds'>>) =>
    out.push({ evidence: [], options: [], cdsFieldIds: [], qaCategoryIds: [], ...x });
  const sectionOf = (fieldId: string) => template.fields.find((f) => f.id === fieldId)?.section ?? null;
  const cdsForArea = (areaId: string) => a.cds.filter((c) => c.mapped && c.functional && !/who helps/i.test(c.label) && c.fieldId !== 'FIL_deficits' && c.evidence.length >= 0)
    .filter((c) => c.fieldId.startsWith('H') && cdsAreaOf(c) === areaId);
  const cdsAreaOf = (c: CdsResponse) => {
    const e = c.evidence.find((x) => x.factId);
    const fact = e ? a.facts.find((f) => f.id === e.factId) : undefined;
    return fact?.key.replace('functional.', '') ?? null;
  };

  // 1. ADL/IADL contradictions inside the journal (transfers, mobility, ...).
  for (const row of a.adl.filter((r) => r.narrativeStatus === 'Conflicting')) {
    const area = areas.find((x) => x.id === row.areaId)!;
    const title = row.areaId === 'transfers' ? 'Transfer contradiction'
      : ['indoor_locomotion', 'outdoor_mobility'].includes(row.areaId) ? `Mobility inconsistency: ${row.label.toLowerCase()}`
        : `Contradictory ${row.label.toLowerCase()} documentation`;
    add({
      id: `journal_conflict:${row.areaId}`, kind: 'journal_conflict', category: 'Incorrect or contradictory answers', severity: 'Critical', title,
      journalSection: 'ADLs and IADLs', journalFieldId: 'adls',
      journalInfo: row.evidence.filter((e) => e.factId).map((e) => `“${e.text}”`).join(' / '),
      cdsAnswer: 'Unable to determine – conflicting statements',
      mismatch: `${row.label} is documented as both independent and assisted.`,
      whyItMatters: 'The CDS performance code, FIL and care plan depend on this activity; the CDS cannot be completed while the journal contradicts itself.',
      suggestedCorrection: `Confirm the consumer's actual level for ${row.label.toLowerCase()} and list it once in the ADL/IADL statement.`,
      requiresClarification: true,
      cdsFieldIds: a.cds.filter((c) => c.status === 'Unable to Determine' && c.functional).filter((c) => (c.evidence.some((e) => e.factId && a.facts.find((f) => f.id === e.factId)?.key === functionalFactKey(row.areaId)))).map((c) => c.fieldId),
      qaCategoryIds: ['narrative_cds', 'fil'],
      options: adlLineOptions(journalText, template, row, area, facts),
      evidence: row.evidence,
    });
  }

  // 2. Mobility device observed while independence is documented.
  const deviceObs = facts.get('basic.observations').filter((f) => /\b(scooter|walker|rollator|wheelchair|cane|crutch)/i.test(f.value));
  const mobility = a.adl.filter((r) => ['indoor_locomotion', 'outdoor_mobility'].includes(r.areaId) && (r.narrativeStatus === 'Independent' || r.narrativeStatus === 'Conflicting'));
  if (deviceObs.length && mobility.length) {
    const device = deviceObs[0].value.match(/\b(scooter|rolling walker|walker|rollator|wheelchair|cane|crutches)/i)?.[1] ?? 'a mobility device';
    add({
      id: 'classification:mobility_device', kind: 'classification', category: 'Different levels of assistance', severity: 'High',
      title: `Mobility inconsistency: ${device} observed`, journalSection: 'Home Environment and Observations', journalFieldId: 'adls',
      journalInfo: `“${deviceObs[0].sourceText}” and ADLs: ${mobility.map((r) => `${r.label} – ${r.narrativeStatus}`).join('; ')}`,
      cdsAnswer: a.cds.filter((c) => /Indoor Mobility Device Needed|Outdoor Mobility Device Needed/i.test(c.label)).map((c) => `${c.label} ${c.suggestedResponse}`).join('; ') || 'Not documented',
      mismatch: `The consumer was observed using a ${device}, but the ADL statement documents independent ambulation/mobility and does not mention the device.`,
      whyItMatters: 'Device use affects the locomotion performance code (independence "once in chair" for wheelchairs/scooters), the "Mobility Device Needed?" items, fall risk and service planning.',
      suggestedCorrection: `Document whether the ${device} is used indoors and/or outdoors, whether help is needed, and complete the CDS mobility device items.`,
      requiresClarification: true, cdsFieldIds: a.cds.filter((c) => /LOCOMOTION|Mobility Device/i.test(c.label)).map((c) => c.fieldId),
      qaCategoryIds: ['narrative_cds', 'fall_risk'], evidence: [evidenceOf(deviceObs[0]), ...mobility.flatMap((r) => r.evidence.slice(0, 1))],
    });
  }

  // 3. ADLs/IADLs not documented in the journal.
  const notDocumented = a.adl.filter((r) => r.narrativeStatus === 'Not Documented' && r.type !== 'Support');
  if (notDocumented.length) {
    add({
      id: 'journal_missing:adl_iadl', kind: 'journal_missing', category: 'Missing ADLs and IADLs', severity: 'High',
      title: `ADL/IADL not documented: ${notDocumented.map((r) => r.label).join(', ')}`, journalSection: 'ADLs and IADLs', journalFieldId: 'adls',
      journalInfo: readJournalField(journalText, template.fields.find((f) => f.id === 'adls')!) ?? 'No ADL/IADL statement',
      cdsAnswer: 'Not documented', mismatch: 'These activities have CDS performance codes but no journal statement.',
      whyItMatters: 'Undocumented activities cannot be assumed independent; FIL and the CDS require every ADL/IADL.',
      suggestedCorrection: 'Add the assessed level for each listed activity to the ADL/IADL statement.', requiresClarification: true,
      cdsFieldIds: notDocumented.flatMap((r) => cdsForArea(r.areaId).map((c) => c.fieldId)), qaCategoryIds: ['narrative_cds', 'fil'],
    });
  }

  // 4. CDS questions supported by the journal but not yet answered / with an unstated level.
  for (const c of a.cds.filter((x) => x.mapped && x.status !== 'Not Documented' && x.status !== 'Unable to Determine')) {
    const d = decisions[`cds:${c.fieldId}`];
    const answer = finalAnswer(c, d);
    const supported = c.candidates.length ? c.candidates : c.choices.length && c.type === 'single' && c.choices.includes(c.suggestedResponse) ? [c.suggestedResponse] : [];
    const isAdl = c.functional && /PERFORMANCE CODE|^[a-j]\.\s+[A-Z]/.test(c.label);
    if (!answer && c.candidates.length > 1) {
      add({
        id: `cds_unresolved:${c.fieldId}`, kind: 'cds_unresolved', category: isAdl ? 'Different levels of assistance' : 'Unanswered CDS fields',
        severity: isAdl ? 'Medium' : 'Low', title: `Select verified answer: ${c.code ? `${c.code} ` : ''}${shortLabel(c.label)}`,
        journalSection: sectionFromEvidence(c, journalText, template), journalInfo: c.evidence.map((e) => `“${e.text}”`).join(' / '),
        cdsAnswer: `Candidates: ${c.candidates.join(' | ')}`, mismatch: c.type === 'multi' ? 'Journal-supported items have not been confirmed; other items must be assessed, not assumed absent.' : 'The journal supports more than one answer code (the level is not stated).',
        whyItMatters: 'The CDS needs one verified answer; the tool will not guess the level.',
        suggestedCorrection: 'Select the verified answer, or add the level to the journal.', requiresClarification: true,
        cdsFieldIds: [c.fieldId], qaCategoryIds: ['narrative_cds'],
        // Multi-select questions: the candidates are the items supported by the journal, accepted together.
        options: c.type === 'multi'
          ? [{ id: 'answer_0', label: `Accept the journal-supported items: ${c.candidates.join('; ')}`, cdsAnswer: { fieldId: c.fieldId, value: c.candidates.join('; '), original: c.suggestedResponse } }]
          : c.candidates.map((x, i) => ({ id: `answer_${i}`, label: x, cdsAnswer: { fieldId: c.fieldId, value: x, original: c.suggestedResponse } })),
        evidence: c.evidence,
      });
      continue;
    }
    if (answer && d?.status === 'edited' && supported.length && !supported.includes(answer)) {
      add({
        id: `cds_contradiction:${c.fieldId}`, kind: 'cds_contradiction', category: c.functional ? 'Different levels of assistance' : 'Incorrect or contradictory answers',
        severity: c.functional ? 'Critical' : 'High', title: `CDS answer contradicts the journal: ${c.code ? `${c.code} ` : ''}${shortLabel(c.label)}`,
        journalSection: sectionFromEvidence(c, journalText, template), journalInfo: c.evidence.map((e) => `“${e.text}”`).join(' / '),
        cdsAnswer: answer, mismatch: `CDS answer "${answer}" is not supported by the journal (supported: ${supported.join(' | ')}).`,
        whyItMatters: 'The journal and CDS must support each other (QA 8).',
        suggestedCorrection: 'Use a journal-supported answer, or correct the journal if the CDS answer reflects the verified assessment.',
        requiresClarification: true, cdsFieldIds: [c.fieldId], qaCategoryIds: ['narrative_cds'], evidence: c.evidence,
        options: supported.map((x, i) => ({ id: `answer_${i}`, label: `Use journal-supported answer: ${x}`, cdsAnswer: { fieldId: c.fieldId, value: x, original: c.suggestedResponse } })),
      });
    }
  }
  // CDS answers entered without journal support.
  for (const c of a.cds.filter((x) => x.mapped && x.status === 'Not Documented')) {
    const d = decisions[`cds:${c.fieldId}`];
    const answer = finalAnswer(c, d);
    if (answer && answer !== 'Not documented') {
      add({
        id: `cds_contradiction:${c.fieldId}`, kind: 'cds_contradiction', category: 'Incorrect or contradictory answers', severity: 'Medium',
        title: `CDS answer has no journal support: ${c.code ? `${c.code} ` : ''}${shortLabel(c.label)}`, journalSection: null, journalInfo: 'Not documented in the journal',
        cdsAnswer: answer, mismatch: 'A CDS answer was entered but the journal does not document it.',
        whyItMatters: 'Every CDS answer should be supported by the journal narrative.', suggestedCorrection: 'Add the supporting information to the journal.',
        requiresClarification: true, cdsFieldIds: [c.fieldId], qaCategoryIds: ['narrative_cds'],
      });
    }
  }

  // 5. Formal vs informal support classification.
  const informal = facts.get('services.informal_supports');
  const dual = informal.filter((f) => /\b(pca|personal care attendant|paid|caregiver agency|serves as)\b/i.test(f.value));
  if (dual.length) {
    const who = a.cds.filter((c) => c.mapped && /who helps/i.test(c.label));
    add({
      id: 'classification:formal_informal', kind: 'classification', category: 'Incorrect formal versus informal support classifications', severity: 'High',
      title: 'Formal vs. informal support needs clarification', journalSection: 'Informal Supports', journalFieldId: 'informal_supports',
      journalInfo: dual.map((f) => `“${f.sourceText}”`).join(' / '), cdsAnswer: `${who.length} "Who helps" item(s); identified caregiver: ${a.cds.find((c) => c.fieldId === 'BB_caregiver')?.suggestedResponse ?? 'n/a'}`,
      mismatch: 'A family member is documented as an informal support and as a (paid) PCA. The journal does not say which help is provided informally and which through the PCA program.',
      whyItMatters: '"Who helps" answers (Informal vs. Other Formal vs. Met by ASAP) and the identified-caregiver item depend on this distinction, as do service hours.',
      suggestedCorrection: 'State which tasks the family member performs as a paid PCA (formal) and which as unpaid informal support, and answer the "Who helps" items accordingly.',
      requiresClarification: true, cdsFieldIds: [...who.map((c) => c.fieldId), 'BB_caregiver'], qaCategoryIds: ['narrative_cds', 'program_care_plan'], evidence: dual.map(evidenceOf),
    });
  }

  // 6. Inconsistent service hours.
  const hours = [...facts.get('services.personal_care'), ...facts.get('services.hha_hours')].filter((f) => /\d/.test(f.value));
  const byService = new Map<string, Set<string>>();
  for (const h of hours) {
    const svc = /hha|home health/i.test(h.value) ? 'HHA' : 'PCA';
    byService.set(svc, new Set([...(byService.get(svc) ?? []), h.value.match(/\d+(\.\d+)?/)![0]]));
  }
  for (const [svc, vals] of byService) {
    if (vals.size > 1) {
      add({
        id: `discrepancy:hours_${svc}`, kind: 'discrepancy', category: 'Inconsistent service hours', severity: 'High',
        title: `Inconsistent ${svc} hours`, journalSection: 'Formal Supports', journalFieldId: 'formal_supports',
        journalInfo: hours.map((h) => `“${h.sourceText}”`).join(' / '), cdsAnswer: '—', mismatch: `${svc} hours documented as ${[...vals].join(' and ')}.`,
        whyItMatters: 'Service hours must match the service plan and authorizations.', suggestedCorrection: `Document the authorized ${svc} hours once.`,
        requiresClarification: true, qaCategoryIds: ['program_care_plan'], evidence: hours.map(evidenceOf),
      });
    }
  }

  // 7. Cross-document conflicts (copay, income, risk level, ...).
  for (const d of a.discrepancies) {
    const financial = /copay|income|balance|masshealth/i.test(d.topic);
    const field = { 'financial.copay': 'copay', 'financial.annual_income': 'income', 'financial.overdue_balance': 'overdue_balance', 'financial.masshealth': 'masshealth', 'risk.level': 'risk', 'risk.fil_code': 'risk' }[d.key];
    add({
      id: `discrepancy:${d.key}`, kind: 'discrepancy', category: /copay/i.test(d.topic) ? 'Copay inconsistencies' : financial ? 'Incorrect financial information' : 'Inconsistent risk levels',
      severity: 'Critical', title: `Conflicting ${d.topic.toLowerCase()}`, journalSection: field ? sectionOf(field) : null, journalFieldId: field,
      journalInfo: d.values.map((v) => `“${v.value}” (${v.evidence.location?.docName})`).join(' vs. '), cdsAnswer: '—',
      mismatch: d.explanation, whyItMatters: financial ? 'Copay and financial values must agree across the Financial Worksheet, Consent and Disclosure and the journal.' : 'Risk level must agree across records.',
      suggestedCorrection: 'Verify the correct value from the source record and correct the journal or the other document.', requiresClarification: true,
      qaCategoryIds: financial ? ['copay', 'financial_consent'] : ['risk_worksheet'], evidence: d.values.map((v) => v.evidence),
    });
  }

  // 8. Hospitalization / fall / health-change consistency.
  const events = facts.get('medical.health_status_change').filter((f) => f.assertion === 'affirmed');
  const noChange = [...facts.get('services.changes'), ...facts.get('medical.hospitalizations')].filter((f) => f.assertion === 'reported_absent');
  if (events.length && noChange.length) {
    add({
      id: 'classification:health_event', kind: 'classification', category: 'Conflicting hospitalization and fall information', severity: 'Medium',
      title: 'Recent health event vs. "no changes" / "no hospitalizations"', journalSection: 'Changes in Needs', journalFieldId: 'changes_in_needs',
      journalInfo: [...events, ...noChange].map((f) => `“${f.sourceText}”`).join(' / '),
      cdsAnswer: a.cds.find((c) => c.fieldId === 'P_hospital_admissions')?.suggestedResponse ?? '—',
      mismatch: 'A recent surgery/illness is reported while the journal states no changes in needs and no hospitalizations.',
      whyItMatters: 'Hospital admissions (CDS P), ADL changes (H.3) and fall risk depend on whether the event was inpatient and changed needs.',
      suggestedCorrection: 'Document the date and setting of the event and whether needs changed.', requiresClarification: true,
      cdsFieldIds: ['P_hospital_admissions'], qaCategoryIds: ['narrative_cds', 'timely_followup'], evidence: [...events, ...noChange].map(evidenceOf),
    });
  }
  const falls = facts.get('medical.falls');
  const k5 = a.cds.find((c) => c.fieldId === 'K5_falls_6mo');
  const k5Answer = k5 ? finalAnswer(k5, decisions['cds:K5_falls_6mo']) : null;
  if (k5Answer && falls.some((f) => f.assertion === 'affirmed') && /^0\b/.test(k5Answer)) {
    add({
      id: 'cds_contradiction:K5_falls_fall', kind: 'cds_contradiction', category: 'Conflicting hospitalization and fall information', severity: 'Critical',
      title: 'Fall documented but CDS K.5 answered "No"', journalSection: 'Falls and Fall Risk', journalFieldId: 'falls', journalInfo: falls.map((f) => `“${f.sourceText}”`).join(' / '),
      cdsAnswer: k5Answer, mismatch: 'The journal reports a fall.', whyItMatters: 'Reported falls require K.5 and the Falls Procedure.',
      suggestedCorrection: 'Answer K.5 according to the number of falls in the past six months.', requiresClarification: true, cdsFieldIds: ['K5_falls_6mo'], qaCategoryIds: ['fall_risk'],
    });
  }

  // 9. FIL vs documented ADLs/IADLs.
  const fil = filConsistency({ facts, allFacts: facts, docs: [], cdsRecord: a.cdsRecord, adl: a.adl, discrepancies: a.discrepancies, input: { caseIdentifier: '', assessmentType: 'Other', assessmentDate: '', program: '', documents: [] } });
  if (fil && !fil.consistent) {
    add({
      id: 'fil:consistency', kind: 'fil', category: 'FIL inconsistencies', severity: 'Critical', title: `FIL ${fil.code} is not supported by the documented ADLs`,
      journalSection: 'Risk Level and FIL', journalFieldId: 'risk', journalInfo: fil.detail, cdsAnswer: a.cds.find((c) => c.fieldId === 'FIL_level')?.suggestedResponse ?? fil.code,
      mismatch: `FIL ${fil.code} requires ${fil.requirement}; the journal documents ${fil.adlMin} ADL deficit(s) (at most ${fil.adlMax}).`,
      whyItMatters: 'FIL supports Home Care eligibility (QA 9).', suggestedCorrection: `Verify the FIL calculation and the ADLs. (${FIL_DEFINITIONS.source})`,
      requiresClarification: true, cdsFieldIds: ['FIL_level', 'FIL_deficits'], qaCategoryIds: ['fil'], evidence: fil.evidence,
    });
  }

  // 10. Clarification markers and blank journal fields.
  const lines = journalText.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = stripMarker(raw);
    const { label, body } = splitLabel(line);
    const def = fieldForLine(journalText, template, i + 1);
    if (/\[\[CLARIFY:/.test(line) || (label && !body && def)) {
      add({
        id: `journal_missing:field_${def?.id ?? i}`, kind: 'journal_missing', category: 'Missing information', severity: 'Medium',
        title: `Journal field needs information: ${label ?? line.slice(0, 40)}`, journalSection: def?.section ?? null, journalFieldId: def?.id,
        journalInfo: line, cdsAnswer: '—', mismatch: 'The journal field is blank or still marked for clarification.',
        whyItMatters: 'Approved documentation should not contain unanswered template fields.', suggestedCorrection: 'Enter the verified information or state "None".',
        requiresClarification: true, qaCategoryIds: [],
      });
    }
  });

  // 11. QA requirements that need journal documentation or a separate record.
  const sev = (cat: string): FindingSeverity => (inp.checklist.categories.find((c) => c.id === cat)?.priority === 'High' ? 'High' : 'Medium');
  for (const q of a.qa) {
    if (q.categoryId === 'narrative_cds' || q.status === 'Complete' || q.status === 'Not Applicable') continue;
    if (q.categoryId === 'fil' && out.some((x) => x.kind === 'fil')) continue;
    const fieldId = QA_FIELD[q.categoryId];
    const isJournalGap = q.status === 'Missing' || q.status === 'Mismatch';
    add({
      id: `${isJournalGap ? 'journal_missing' : 'record_verification'}:qa_${q.categoryId}`,
      kind: isJournalGap ? 'journal_missing' : 'record_verification',
      category: q.categoryId === 'mls' ? 'Inconsistent MLS information' : q.categoryId === 'goals' ? 'Missing goals' : q.categoryId === 'timely_followup' ? 'Missing follow-up actions' : 'Records requiring verification',
      severity: q.status === 'Mismatch' ? 'Critical' : sev(q.categoryId),
      title: `QA ${q.number}. ${q.title}: ${q.status}`, journalSection: fieldId ? sectionOf(fieldId) : null, journalFieldId: fieldId,
      journalInfo: q.evidenceFound.slice(0, 3).map((e) => `“${e.text}”`).join(' / ') || 'Not documented in the journal',
      cdsAnswer: '—', mismatch: q.evidenceMissing.join('; ') || q.recommendedCorrection, whyItMatters: q.requirements.join('; '),
      suggestedCorrection: q.recommendedCorrection, requiresClarification: true, qaCategoryIds: [q.categoryId], evidence: q.evidenceFound,
    });
  }

  const order: Record<FindingSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const unique = new Map(out.map((x) => [x.id, x]));
  return [...unique.values()].sort((x, y) => order[x.severity] - order[y.severity]);
}

function shortLabel(label: string) {
  const s = label.replace(/^(\([A-Z]\)\s*)?[a-z]{1,2}\.\s*/, '').replace(/^PERFORMANCE CODE - /, '');
  return s.length > 70 ? `${s.slice(0, 70)}…` : s;
}

function sectionFromEvidence(c: CdsResponse, journal: string, template: JournalTemplate): string | null {
  const loc = c.evidence.find((e) => e.location)?.location;
  return fieldForLine(journal, template, loc?.line ?? null)?.section ?? loc?.section ?? null;
}
