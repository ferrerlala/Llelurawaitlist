// Builds the CDS-3-CM v3.3.2 template: every instrument question with its official answer
// choices, overlaid with narrative mappings, plus a separate section for WellSky records that
// are not part of the CDS-3-CM instrument (financial, MLS, risk worksheet, consents, ...).

import { DEFAULT_FUNCTIONAL_AREAS, type FunctionalAreaDef } from '@shared/fact-catalog.ts';
import type { CdsFieldDef, CdsQuestionType, CdsTemplate } from '../../engine/types.ts';
import { buildDefaultCdsTemplate } from '../cds-template.ts';
import instrument from './cds-3-cm-v3.3.2.json';
import { CDS_3_CM_MAPPINGS } from './mapping.ts';

export interface InstrumentField {
  id: string;
  code: string;
  section: string;
  group: string;
  label: string;
  type: CdsQuestionType;
  choices: string[];
}

export const CDS_3_CM_INSTRUMENT = instrument as { id: string; name: string; formCode: string; version: string; fields: InstrumentField[] };

/** Sections that are system indicators / obsolete items rather than case manager questions. */
const EXCLUDED_SECTIONS = /^(Obsolete|Indicator Validation)$/;

const OTHER_SECTION = 'Other WellSky records (not on CDS-3-CM)';
const OTHER_FIELD_IDS = [
  'assess_location', 'assess_present', 'assess_env', 'demo_living', 'cog_status', 'health_dx', 'health_meds', 'health_pcp_visit',
  'health_hosp', 'health_change', 'needs_change', 'svc_current', 'svc_program', 'svc_hha', 'svc_pc', 'svc_rn', 'svc_transport', 'svc_meals',
  'svc_satisfaction', 'svc_additional', 'inf_supports', 'fin_income', 'fin_copay', 'fin_overdue', 'fin_masshealth', 'fin_worksheet',
  'elig_age', 'elig_need', 'elig_fil', 'risk_level', 'risk_change', 'goals_needs', 'mls', 'consent_acd', 'consent_ems', 'consent_hipaa',
  'contacts_review', 'fu_next', 'fu_idc',
];

export function resolveMappings(fields: InstrumentField[] = CDS_3_CM_INSTRUMENT.fields) {
  const resolved = new Map<string, (typeof CDS_3_CM_MAPPINGS)[number]>();
  const unresolved: string[] = [];
  for (const m of CDS_3_CM_MAPPINGS) {
    const re = new RegExp(m.find.label, 'i');
    const f = fields.find((x) => (!m.find.group || `${x.group} ${x.section}`.includes(m.find.group)) && re.test(x.label.replace(/^\([A-Z]\)\s*/, '')));
    if (f && !resolved.has(f.id)) resolved.set(f.id, m);
    else unresolved.push(m.id);
  }
  return { resolved, unresolved };
}

export function buildCds3CmTemplate(areas: FunctionalAreaDef[] = DEFAULT_FUNCTIONAL_AREAS): CdsTemplate {
  const { resolved } = resolveMappings();
  const instrumentFields: CdsFieldDef[] = CDS_3_CM_INSTRUMENT.fields
    .filter((f) => !EXCLUDED_SECTIONS.test(f.section))
    .map((f) => {
      const m = resolved.get(f.id);
      return {
        id: m?.id ?? f.id,
        section: f.section,
        group: f.group,
        code: f.code,
        label: f.label,
        type: f.type,
        choices: f.choices,
        factKeys: m?.factKeys ?? [],
        answerRules: m?.answerRules,
        requiresRecord: m?.requiresRecord,
        guidance: m?.guidance,
        required: !!m,
      };
    });
  const provisional = buildDefaultCdsTemplate(areas);
  const other = OTHER_FIELD_IDS.map((id) => provisional.fields.find((f) => f.id === id))
    .filter((f): f is CdsFieldDef => !!f)
    .map((f) => ({ ...f, section: OTHER_SECTION, group: f.section, code: '', type: 'text' as const }));

  return {
    id: 'cds-3-cm',
    name: `${CDS_3_CM_INSTRUMENT.name} – narrative preparation mapping`,
    version: `${CDS_3_CM_INSTRUMENT.version}+map.1`,
    provisional: false,
    notice:
      `Questions and answer choices from ${CDS_3_CM_INSTRUMENT.formCode} v${CDS_3_CM_INSTRUMENT.version} (form export). Which narrative statements support which answers is this tool's suggestion: ` +
      'verify every response against the assessment before entering it in WellSky. Items in "Other WellSky records" are not CDS-3-CM questions and use a provisional mapping.',
    fields: [...instrumentFields, ...other],
  };
}
