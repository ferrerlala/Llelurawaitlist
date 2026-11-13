// PROVISIONAL CDS field mapping.
//
// This is NOT the official Massachusetts Comprehensive Data Set instrument.
// Section and field names below are descriptive placeholders chosen by this
// application so narrative facts can be organized for review. Organizations
// must replace this template (Settings › CDS Template) with the official,
// approved CDS instrument, field names and answer choices before relying on it.

import { DEFAULT_FUNCTIONAL_AREAS, functionalFactKey, type FunctionalAreaDef } from '@shared/fact-catalog.ts';
import type { CdsFieldDef, CdsTemplate } from '../engine/types.ts';

const field = (
  id: string,
  section: string,
  label: string,
  factKeys: string[],
  extra: Partial<CdsFieldDef> = {},
): CdsFieldDef => ({ id, section, label, factKeys, choices: [], required: true, ...extra });

export function buildDefaultCdsTemplate(areas: FunctionalAreaDef[] = DEFAULT_FUNCTIONAL_AREAS): CdsTemplate {
  const functionalFields = areas.map((a) =>
    field(`fn_${a.id}`, a.type === 'ADL' ? 'Functional Status – ADLs' : a.type === 'IADL' ? 'Functional Status – IADLs' : 'Support Needs', a.label, [functionalFactKey(a.id)], {
      guidance: 'Enter the level documented in the narrative only. Undocumented activities must be assessed and documented, never assumed independent.',
      required: a.type !== 'Support',
    }),
  );

  return {
    id: 'provisional-cds-ma-home-care',
    name: 'Provisional CDS preparation mapping (not the official instrument)',
    version: '0.1.0-provisional',
    provisional: true,
    notice:
      'Provisional mapping. Field names are placeholders and are not official Massachusetts CDS questions, field names or answer choices. Replace with the approved instrument in Settings before production use.',
    fields: [
      field('assess_date', 'Assessment Information', 'Assessment date', ['basic.assessment_date']),
      field('assess_location', 'Assessment Information', 'Assessment location', ['basic.location']),
      field('assess_present', 'Assessment Information', 'People present', ['basic.people_present']),
      field('assess_env', 'Assessment Information', 'Home environment', ['basic.home_environment']),
      field('demo_age', 'Consumer Information', 'Age', ['basic.age']),
      field('demo_marital', 'Consumer Information', 'Marital status', ['basic.marital_status']),
      field('demo_living', 'Consumer Information', 'Living arrangement', ['basic.living_arrangement'], {
        guidance: 'Do not infer living arrangement from marital status.',
      }),
      field('cog_status', 'Cognition', 'Cognitive status', ['medical.cognitive_status']),
      field('cog_screen', 'Cognition', 'Memory / cognitive screening', ['medical.memory_screening'], {
        guidance: 'A declined or incomplete screening must not be entered as completed.',
      }),
      field('health_dx', 'Health Conditions', 'Medical conditions / diagnoses', ['medical.conditions']),
      field('health_meds', 'Health Conditions', 'Medication review', ['medical.medication_review']),
      field('health_pcp', 'Health Conditions', 'PCP name / phone / address', ['medical.pcp_info']),
      field('health_pcp_visit', 'Health Conditions', 'Last PCP visit', ['medical.pcp_last_visit']),
      field('health_hosp', 'Health Care Utilization', 'Recent hospitalizations', ['medical.hospitalizations']),
      field('health_falls', 'Falls (K5-related, provisional)', 'Recent falls', ['medical.falls'], {
        guidance: 'Fall questions must be completed in the CDS at RA and RD visits. "No falls reported" does not replace the fall-risk questions.',
        requiresRecord: 'CDS K5 and corresponding fall questions',
      }),
      field('health_change', 'Health Care Utilization', 'Change in health status', ['medical.health_status_change']),
      ...functionalFields,
      field('svc_current', 'Formal Services', 'Current services', ['services.current']),
      field('svc_hha', 'Formal Services', 'Home health aide hours', ['services.hha_hours']),
      field('svc_pers', 'Formal Services', 'PERS', ['services.pers']),
      field('svc_rn', 'Formal Services', 'RN services', ['services.rn']),
      field('svc_ptot', 'Formal Services', 'PT / OT', ['services.pt_ot']),
      field('svc_transport', 'Formal Services', 'Transportation services', ['services.transportation']),
      field('svc_meals', 'Formal Services', 'Meal services / supports', ['services.meals']),
      field('svc_satisfaction', 'Formal Services', 'Service satisfaction', ['services.satisfaction']),
      field('svc_additional', 'Formal Services', 'Additional service needs', ['services.additional_needs']),
      field('inf_supports', 'Informal Supports', 'Informal supports', ['services.informal_supports']),
      field('fin_income', 'Financial', 'Annual income', ['financial.annual_income'], { requiresRecord: 'Financial Worksheet' }),
      field('fin_copay', 'Financial', 'Copay', ['financial.copay'], { requiresRecord: 'Financial Worksheet and Applicant Consent and Disclosure' }),
      field('fin_overdue', 'Financial', 'Overdue balance', ['financial.overdue_balance']),
      field('fin_masshealth', 'Financial', 'MassHealth status', ['financial.masshealth']),
      field('fin_worksheet', 'Financial', 'Financial Worksheet completed', ['financial.worksheet'], { requiresRecord: 'Financial Worksheet' }),
      field('elig_age', 'Eligibility (narrative statements only)', 'Age eligibility', ['eligibility.age'], { requiresRecord: 'WellSky eligibility record' }),
      field('elig_need', 'Eligibility (narrative statements only)', 'Need eligibility', ['eligibility.need'], { requiresRecord: 'WellSky eligibility record' }),
      field('elig_fil', 'Eligibility (narrative statements only)', 'FIL eligibility', ['eligibility.fil', 'risk.fil_code'], {
        requiresRecord: 'Approved FIL calculation in CDS',
        guidance: 'This tool does not calculate FIL. Verify the CDS FIL calculation.',
      }),
      field('risk_level', 'Risk', 'Risk level', ['risk.level'], { requiresRecord: 'Risk Worksheet and AltID2' }),
      field('risk_change', 'Risk', 'Change in risk factors', ['risk.factors_change']),
      field('goals_new', 'Consumer Goals', 'Person-centered goals', ['goals.new', 'goals.existing']),
      field('goals_needs', 'Consumer Goals', 'Identified needs', ['goals.identified_needs']),
      field('mls', 'MLS', 'MLS date / status', ['mls.status'], { requiresRecord: 'CDS MLS section' }),
      field('consent_acd', 'Consent and Disclosure', 'Applicant Consent and Disclosure', ['consent.applicant_consent'], { requiresRecord: 'Signed Applicant Consent and Disclosure form' }),
      field('consent_ems', 'Consent and Disclosure', 'Permission to contact emergency services', ['consent.emergency_services_permission'], {
        requiresRecord: 'Applicant Consent and Disclosure form and A&D Details Notes',
      }),
      field('consent_hipaa', 'Consent and Disclosure', 'Privacy Practices / HIPAA', ['consent.hipaa']),
      field('contacts_review', 'Contacts', 'Emergency contacts reviewed', ['contacts.emergency_contacts']),
      field('contacts_primary', 'Contacts', 'Primary emergency contact (name, phone, address)', ['contacts.primary_emergency_contact']),
      field('contacts_alt', 'Contacts', 'Alternate emergency contact', ['contacts.alternate_emergency_contact']),
      field('contacts_hcp', 'Contacts', 'Health Care Proxy', ['contacts.health_care_proxy']),
      field('fu_next', 'Follow-Up', 'Next assessment', ['followup.next_assessment']),
      field('fu_idc', 'Follow-Up', 'Interdisciplinary conference participants', ['followup.idc']),
    ],
  };
}
