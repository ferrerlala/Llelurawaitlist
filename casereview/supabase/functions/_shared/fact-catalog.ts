// Canonical fact vocabulary shared by the browser engine, the mock extractor,
// the local dev AI endpoint and the Supabase Edge Function.
//
// Pure TypeScript with no runtime imports so it runs in Node, Deno and the browser.
// Organizational rules (CDS fields, QA checklist) are NOT defined here: they are
// configuration (see src/config). This file only defines *what kinds of facts*
// the extraction stage is allowed to report.

export type FactCategory =
  | 'basic'
  | 'medical'
  | 'functional'
  | 'services'
  | 'financial'
  | 'eligibility'
  | 'risk'
  | 'goals'
  | 'followup'
  | 'contacts'
  | 'consent'
  | 'mls'
  | 'visits'
  | 'suspension'
  | 'program'
  | 'documentation';

export interface FactKeyDef {
  key: string;
  category: FactCategory;
  label: string;
  description: string;
  multiple?: boolean;
}

export type FunctionalType = 'ADL' | 'IADL' | 'Support';

export interface FunctionalAreaDef {
  id: string;
  label: string;
  type: FunctionalType;
  /** Phrases that identify the area in narrative or CDS text (lower case). */
  synonyms: string[];
}

/** Default functional areas. Organizations can override these in Settings. */
export const DEFAULT_FUNCTIONAL_AREAS: FunctionalAreaDef[] = [
  { id: 'meal_preparation', label: 'Meal preparation', type: 'IADL', synonyms: ['meal preparation', 'meal prep', 'preparing meals', 'prepare meals', 'cooking'] },
  { id: 'housekeeping', label: 'Housekeeping', type: 'IADL', synonyms: ['housekeeping', 'housework', 'light housework', 'heavy housework', 'cleaning', 'homemaking tasks'] },
  { id: 'laundry', label: 'Laundry', type: 'IADL', synonyms: ['laundry'] },
  { id: 'money_management', label: 'Money management', type: 'IADL', synonyms: ['money management', 'financial management', 'managing finances', 'finances', 'bill paying', 'paying bills', 'managing money'] },
  { id: 'medication_management', label: 'Medication management', type: 'IADL', synonyms: ['medication management', 'managing medications', 'medication administration', 'managing meds', 'med management'] },
  { id: 'telephone', label: 'Telephone', type: 'IADL', synonyms: ['telephone use', 'telephone', 'phone use', 'using the phone', 'using the telephone'] },
  { id: 'shopping', label: 'Shopping', type: 'IADL', synonyms: ['shopping', 'grocery shopping', 'groceries'] },
  { id: 'transportation', label: 'Transportation', type: 'IADL', synonyms: ['transportation', 'driving'] },
  { id: 'bed_mobility', label: 'Bed mobility', type: 'ADL', synonyms: ['bed mobility', 'mobility in bed', 'turning in bed', 'repositioning in bed'] },
  { id: 'transfers', label: 'Transfers', type: 'ADL', synonyms: ['transfers', 'transferring', 'transfer'] },
  { id: 'indoor_locomotion', label: 'Indoor locomotion', type: 'ADL', synonyms: ['ambulation in the home', 'ambulation within the home', 'ambulating within the home', 'mobility within the home', 'indoor locomotion', 'locomotion in the home', 'indoor mobility', 'ambulating in the home', 'walking in the home', 'ambulation indoors', 'mobility in the home'] },
  { id: 'outdoor_mobility', label: 'Outdoor mobility', type: 'ADL', synonyms: ['outdoor mobility', 'locomotion outside', 'ambulation outside', 'mobility outside the home', 'walking outside', 'outdoor locomotion'] },
  { id: 'dressing', label: 'Dressing', type: 'ADL', synonyms: ['dressing', 'getting dressed'] },
  { id: 'eating', label: 'Eating', type: 'ADL', synonyms: ['eating', 'feeding'] },
  { id: 'toileting', label: 'Toileting', type: 'ADL', synonyms: ['toileting', 'toilet use', 'using the toilet'] },
  { id: 'bathing', label: 'Bathing', type: 'ADL', synonyms: ['bathing', 'showering', 'bathe', 'shower'] },
  { id: 'incontinence_management', label: 'Incontinence management', type: 'ADL', synonyms: ['incontinence management', 'managing incontinence', 'continence care', 'incontinence care', 'continence'] },
  { id: 'respite', label: 'Respite / caregiver support', type: 'Support', synonyms: ['respite', 'caregiver relief'] },
];

/** Allowed values for functional.* facts. */
export const FUNCTIONAL_STATUS_VALUES = [
  'Independent',
  'Needs Assistance',
  'Dependent',
  'Assistance Provided',
  'Mentioned - Level Not Stated',
] as const;
export type FunctionalStatusValue = (typeof FUNCTIONAL_STATUS_VALUES)[number];

const f = (key: string, category: FactCategory, label: string, description: string, multiple = false): FactKeyDef => ({
  key, category, label, description, multiple,
});

const BASE_FACT_KEYS: FactKeyDef[] = [
  f('basic.assessment_date', 'basic', 'Assessment date', 'Date the assessment or visit occurred, as written.'),
  f('basic.location', 'basic', 'Assessment location', 'Where the assessment took place.'),
  f('basic.home_environment', 'basic', 'Home environment', 'Description of the home environment.'),
  f('basic.people_present', 'basic', 'People present', 'Who was present at the assessment.'),
  f('basic.observations', 'basic', 'General observations', 'General observations of the consumer during the visit.', true),
  f('basic.age', 'basic', 'Consumer age', 'Age in years, only if stated.'),
  f('basic.gender', 'basic', 'Gender', 'Gender, only if stated.'),
  f('basic.marital_status', 'basic', 'Marital status', 'Marital status, only if stated (e.g. single, widowed).'),
  f('basic.living_arrangement', 'basic', 'Living arrangement', 'Who the consumer lives with. Do NOT infer from marital status.'),

  f('medical.conditions', 'medical', 'Medical conditions', 'Diagnoses or medical history, one fact per condition.', true),
  f('medical.cognitive_status', 'medical', 'Cognitive status', 'Stated orientation or cognitive status.'),
  f('medical.memory_screening', 'medical', 'Memory screening', 'Memory/cognitive screening (Mini-Cog, MoCA, etc.): completed with score, declined, or not completed.'),
  f('medical.medication_review', 'medical', 'Medication review', 'Whether medications were reviewed and any changes.'),
  f('medical.pcp_info', 'medical', 'PCP information', 'PCP name, phone or address.'),
  f('medical.pcp_last_visit', 'medical', 'Last PCP visit', 'Date of last PCP appointment.'),
  f('medical.pcp_change_request', 'medical', 'PCP change request', 'Consumer request to change PCP or a type of PCP.'),
  f('medical.specialists', 'medical', 'Specialists', 'Specialist providers.', true),
  f('medical.hospitalizations', 'medical', 'Hospitalizations', 'Hospitalizations; use assertion reported_absent if the note says none.'),
  f('medical.falls', 'medical', 'Falls', 'Falls; use assertion reported_absent if the note says no falls.'),
  f('medical.health_status_change', 'medical', 'Change in health status', 'Changes in medical condition or health status, including recent surgery or illness; reported_absent if the note says no changes.', true),

  f('services.current', 'services', 'Current services', 'Summary of current services as written.'),
  f('services.hha_hours', 'services', 'Home health aide hours', 'HHA hours (value should include the number and unit).'),
  f('services.personal_care', 'services', 'Personal care services', 'Personal care services.'),
  f('services.pers', 'services', 'PERS', 'Personal Emergency Response System.'),
  f('services.rn', 'services', 'RN services', 'Nursing services.'),
  f('services.pt_ot', 'services', 'PT / OT', 'Physical or occupational therapy and the provider.'),
  f('services.homemaking', 'services', 'Homemaking', 'Homemaking services.'),
  f('services.transportation', 'services', 'Transportation services', 'Transportation services/provider.'),
  f('services.meals', 'services', 'Meal services', 'Meal services or meal supports.'),
  f('services.vendors', 'services', 'Vendor information', 'Named vendors/agencies.', true),
  f('services.future_services', 'services', 'Possible future services', 'Services that may start in the future.'),
  f('services.satisfaction', 'services', 'Service satisfaction', 'Consumer satisfaction with services.'),
  f('services.additional_needs', 'services', 'Additional service needs', 'Additional service needs; reported_absent if none identified.'),
  f('services.informal_supports', 'services', 'Informal supports', 'Family/friend/informal supports.', true),
  f('services.changes', 'services', 'Changes in needs, services or supports', 'Changes in needs, formal services or informal supports since the last assessment; reported_absent if none.'),

  f('financial.annual_income', 'financial', 'Annual income', 'Annual income amount as written.'),
  f('financial.copay', 'financial', 'Copay', 'Copay amount as written.'),
  f('financial.overdue_balance', 'financial', 'Overdue balance', 'Overdue balance amount as written.'),
  f('financial.masshealth', 'financial', 'MassHealth status', 'MassHealth status as written.'),
  f('financial.worksheet', 'financial', 'Financial Worksheet', 'Statement that the Financial Worksheet was completed (or not).'),
  f('financial.application', 'financial', 'Application', 'Program application status.'),

  f('consent.applicant_consent', 'consent', 'Applicant Consent and Disclosure', 'Applicant Consent and Disclosure signature/status and date.'),
  f('consent.emergency_services_permission', 'consent', 'Permission to contact emergency services', 'Permission to Contact Emergency Services status and date.'),
  f('consent.hipaa', 'consent', 'Privacy Practices / HIPAA', 'Notice of Privacy Practices / HIPAA review.'),
  f('consent.public_benefits', 'consent', 'Public benefits review', 'Public benefits review.'),

  f('eligibility.age', 'eligibility', 'Age eligibility (as stated)', 'Narrative statement about age eligibility. Never infer.'),
  f('eligibility.need', 'eligibility', 'Need eligibility (as stated)', 'Narrative statement about need eligibility. Never infer.'),
  f('eligibility.fil', 'eligibility', 'FIL eligibility (as stated)', 'Narrative statement about FIL eligibility. Never calculate.'),

  f('risk.level', 'risk', 'Risk level', 'Risk level as written (e.g. "Risk 3").'),
  f('risk.fil_code', 'risk', 'FIL code', 'Functional Impairment Level code as written (e.g. "1C").'),
  f('risk.factors', 'risk', 'Risk factors', 'Specific risk factors.', true),
  f('risk.factors_change', 'risk', 'Change in risk factors', 'Changes in risk factors; reported_absent if none.'),
  f('risk.worksheet', 'risk', 'Risk Worksheet', 'Risk Worksheet completion/review date.'),
  f('risk.safety_concerns', 'risk', 'Safety concerns', 'Safety concerns.', true),

  f('goals.existing', 'goals', 'Existing goals', 'Existing person-centered goals.', true),
  f('goals.new', 'goals', 'New goals', 'New person-centered goals; reported_absent if the note says none.', true),
  f('goals.preferences', 'goals', 'Consumer preferences', 'Stated consumer preferences.', true),
  f('goals.identified_needs', 'goals', 'Identified needs', 'Needs identified at the visit.', true),

  f('followup.action', 'followup', 'Follow-up action', 'A planned action. value = the action, detail = responsible party and any due date exactly as written.', true),
  f('followup.next_assessment', 'followup', 'Next assessment', 'Next assessment date as written.'),
  f('followup.idc', 'followup', 'Interdisciplinary conference', 'Interdisciplinary conference: value = participants exactly as written, detail = event type.', true),
  f('followup.referrals', 'followup', 'Referrals', 'Referrals made.', true),

  f('contacts.emergency_contacts', 'contacts', 'Emergency contacts (review)', 'Statement that emergency contacts were reviewed/changed.'),
  f('contacts.primary_emergency_contact', 'contacts', 'Primary emergency contact', 'Primary emergency contact name/phone/address as written.'),
  f('contacts.alternate_emergency_contact', 'contacts', 'Alternate emergency contact', 'Alternate emergency contact or "None Available".'),
  f('contacts.health_care_proxy', 'contacts', 'Health Care Proxy', 'Health Care Proxy or "None Available".'),

  f('mls.status', 'mls', 'MLS', 'MLS completion status/date as written.'),
  f('visits.rd_ra', 'visits', 'RD/RA visit', 'Statement about the RD/RA visit occurring or being due.'),
  f('visits.attempts', 'visits', 'Visit attempts', 'Documented visit attempts.', true),
  f('suspension.info', 'suspension', 'Service suspension', 'Service suspension information.', true),
  f('program.type', 'program', 'Program', 'Program as written in the note.'),
  f('program.waiver', 'program', 'Waiver status', 'Waiver status as written.'),
  f('documentation.blank_field', 'documentation', 'Blank template field', 'A labeled field in the note template that was left empty (value = the label).', true),
];

export function functionalFactKey(areaId: string): string {
  return `functional.${areaId}`;
}

export function buildFactCatalog(areas: FunctionalAreaDef[] = DEFAULT_FUNCTIONAL_AREAS): FactKeyDef[] {
  const functional = areas.map((a) =>
    f(
      functionalFactKey(a.id),
      'functional',
      a.label,
      `Functional status for ${a.label} (${a.type}). value MUST be one of: ${FUNCTIONAL_STATUS_VALUES.join(' | ')}. Only report if the text explicitly addresses this activity.`,
    ),
  );
  return [...BASE_FACT_KEYS, ...functional];
}
