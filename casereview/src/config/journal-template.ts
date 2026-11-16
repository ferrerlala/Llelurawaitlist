// Organization journal format for the annual assessment ("Label: value" lines under
// group headings). Labels, prefixes and order reproduce the agency template; the 24
// workflow sections group the fields for review. Configurable per organization.

export const JOURNAL_SECTIONS = [
  'Assessment Information', 'Home Environment and Observations', 'Basic Information', 'Medical Conditions', 'Medications',
  'PCP and Specialist Information', 'Hospitalizations', 'Falls and Fall Risk', 'Cognitive and Memory Screening', 'ADLs and IADLs',
  'Formal Supports', 'Informal Supports', 'Current Programs and Services', 'Service Satisfaction', 'Changes in Needs', 'Eligibility',
  'Financial Information', 'Annual Packet and Documents Reviewed', 'Person-Centered Goals', 'Emergency Contacts', 'Risk Level and FIL',
  'Planned Actions and Referrals', 'Next Assessment', 'Interdisciplinary Conference',
] as const;
export type JournalSection = (typeof JOURNAL_SECTIONS)[number];

/** What to do when the case manager confirms a field is unchanged from the previous assessment. */
export type UnchangedPolicy = 'carry' | 'carry-flag' | 'clarify' | 'never';

export interface JournalFieldDef {
  id: string;
  /** Label exactly as printed in the journal (without prefix). */
  label: string;
  /** Printed before the label, e.g. "— " or "a. ". */
  prefix: string;
  /** Group heading printed before the first field of the group. */
  group: string;
  section: JournalSection;
  /** Fact keys used to recover the previous value from non-template notes and to detect changes. */
  factKeys: string[];
  required: boolean;
  unchanged: UnchangedPolicy;
  /** Extra label spellings found in older notes. */
  aliases?: string[];
  hint?: string;
}

const G_INFO = 'Assessment Information';
const G_BG = 'Background: Basic Information/Medical & Fall Risk';
const G_NEEDS = 'Needs/Supports/Services';
const G_CONC = '4) Conclusion: Eligibility Verification/Risk/Financial & Documents Reviewed/Follow-Up Plan';
const G_FIN = 'b. Financial';
const G_PACKET = 'Annual Packet:';

const f = (id: string, label: string, group: string, section: JournalSection, factKeys: string[], extra: Partial<JournalFieldDef> = {}): JournalFieldDef => ({
  id, label, group, section, factKeys, prefix: '', required: true, unchanged: 'carry', ...extra,
});

export interface JournalTemplate {
  id: string;
  name: string;
  version: string;
  fields: JournalFieldDef[];
}

export const DEFAULT_JOURNAL_TEMPLATE: JournalTemplate = {
  id: 'annual-journal-standard',
  name: 'Annual assessment journal (agency format)',
  version: '1.0',
  fields: [
    f('assessment_date', 'Assessment Date', G_INFO, 'Assessment Information', ['basic.assessment_date'], { unchanged: 'never', hint: 'Filled from the assessment date.' }),
    f('location', 'Location of Assessment', G_INFO, 'Assessment Information', ['basic.location'], { aliases: ['Location'] }),
    f('home_environment', 'Home Environment Condition', G_INFO, 'Home Environment and Observations', ['basic.home_environment'], { unchanged: 'carry-flag', aliases: ['Home Environment'] }),
    f('people_present', 'People Present at Home Visit', G_INFO, 'Assessment Information', ['basic.people_present'], { unchanged: 'clarify', aliases: ['People Present'], hint: 'Who attended this visit.' }),
    f('observations', 'Observations of Consumer', G_INFO, 'Home Environment and Observations', ['basic.observations'], { unchanged: 'clarify', aliases: ['Observation', 'Observations'], hint: 'Observations from this visit.' }),
    f('self_reported_health', 'Self-reported assessment of health', G_INFO, 'Home Environment and Observations', [], { unchanged: 'carry-flag' }),
    f('living_arrangements', 'Living Arrangements', G_BG, 'Basic Information', ['basic.age', 'basic.marital_status', 'basic.living_arrangement'], { unchanged: 'carry-flag', hint: 'Age changes every year; state who the consumer lives with.' }),
    f('mood_cognitive', 'Mood/Cognitive Status', G_BG, 'Cognitive and Memory Screening', ['medical.cognitive_status']),
    f('memory_screening', 'Memory Loss Screening', G_BG, 'Cognitive and Memory Screening', ['medical.memory_screening'], { unchanged: 'clarify', hint: 'Result of this year\'s screen (completed with score, or declined/not completed and why).' }),
    f('medical_conditions', 'Medical Conditions', G_BG, 'Medical Conditions', ['medical.conditions']),
    f('medications', 'Medications', G_BG, 'Medications', ['medical.medication_review'], { unchanged: 'carry-flag' }),
    f('pcp', 'PCP/Specialist Last/Next Appointment', G_BG, 'PCP and Specialist Information', ['medical.pcp_last_visit', 'medical.pcp_info', 'medical.pcp_change_request'], { unchanged: 'clarify' }),
    f('hospitalizations', 'Recent Hospitalizations', G_BG, 'Hospitalizations', ['medical.hospitalizations'], { unchanged: 'carry-flag' }),
    f('falls', 'Recent Falls', G_BG, 'Falls and Fall Risk', ['medical.falls'], { unchanged: 'carry-flag', hint: 'Falls in the past six months (CDS K.5) and fall risk.' }),
    f('program', 'Current Program and Service Plan', G_NEEDS, 'Current Programs and Services', ['program.type', 'services.current', 'services.meals'], { aliases: ['Current services'] }),
    f('satisfaction', 'Service Satisfaction/Additional Needs', G_NEEDS, 'Service Satisfaction', ['services.satisfaction', 'services.additional_needs'], { unchanged: 'carry-flag' }),
    f('adls', 'Consumer’s ADLs and IADLs', G_NEEDS, 'ADLs and IADLs', [], { unchanged: 'carry-flag', aliases: ["Consumer's ADLs and IADLs", 'ADLs and IADLs'], hint: 'State the level for each ADL and IADL. Each activity should appear once.' }),
    f('informal_supports', 'Informal Supports', G_NEEDS, 'Informal Supports', ['services.informal_supports']),
    f('formal_supports', 'Formal Supports', G_NEEDS, 'Formal Supports', ['services.personal_care', 'services.hha_hours', 'services.pers', 'services.rn', 'services.pt_ot', 'services.transportation']),
    f('changes_in_needs', 'Changes in Needs Since Last Assessment', G_NEEDS, 'Changes in Needs', ['services.changes', 'medical.health_status_change'], { unchanged: 'clarify' }),
    f('eligibility', 'Eligibility', G_CONC, 'Eligibility', ['eligibility.age', 'eligibility.need', 'eligibility.fil'], { prefix: 'a. ' }),
    f('application', 'Application', G_FIN, 'Financial Information', ['financial.application'], { prefix: '— ', unchanged: 'clarify' }),
    f('income', 'Income Information', G_FIN, 'Financial Information', ['financial.annual_income'], { prefix: '— ', aliases: ['Annual income'] }),
    f('copay', 'Copay', G_FIN, 'Financial Information', ['financial.copay'], { prefix: '— ' }),
    f('overdue_balance', 'Overdue Balance', G_FIN, 'Financial Information', ['financial.overdue_balance'], { prefix: '— ' }),
    f('masshealth', 'MassHealth', G_FIN, 'Financial Information', ['financial.masshealth'], { prefix: '— ' }),
    f('financial_worksheet', 'Financial Worksheet', G_FIN, 'Financial Information', ['financial.worksheet'], { prefix: '— ', required: false, unchanged: 'clarify', hint: 'Optional line (QA 4): Financial Worksheet completion at Annual Redetermination.' }),
    f('public_benefits', 'Public Benefits', G_PACKET, 'Annual Packet and Documents Reviewed', ['consent.public_benefits'], { prefix: '— ', unchanged: 'clarify' }),
    f('hipaa', 'Privacy Practices/HIPAA', G_PACKET, 'Annual Packet and Documents Reviewed', ['consent.hipaa'], { prefix: '— ', unchanged: 'clarify' }),
    f('acd', 'Applicant Consent & Disclosure', G_PACKET, 'Annual Packet and Documents Reviewed', ['consent.applicant_consent'], { prefix: '— ', unchanged: 'clarify', hint: 'Signed again at each annual redetermination.' }),
    f('ems_permission', 'Permission to Contact Emergency Services', G_PACKET, 'Annual Packet and Documents Reviewed', ['consent.emergency_services_permission'], { prefix: '— ', unchanged: 'clarify', hint: 'Signed again at each annual redetermination.' }),
    f('mls', 'MLS', G_PACKET, 'Annual Packet and Documents Reviewed', ['mls.status'], { prefix: '— ', required: false, unchanged: 'clarify', hint: 'Optional line (QA 7): MLS completion date and status.' }),
    f('goals', 'Person-Centered Goal(s)', G_PACKET, 'Person-Centered Goals', ['goals.new', 'goals.existing', 'goals.identified_needs'], { unchanged: 'clarify', aliases: ['Person-centered goals', 'Goals'] }),
    f('emergency_contacts', 'Emergency Contacts', G_PACKET, 'Emergency Contacts', ['contacts.emergency_contacts', 'contacts.primary_emergency_contact', 'contacts.alternate_emergency_contact'], { prefix: 'c. ' }),
    f('risk', 'Risk Level/Explanation if Changes', G_PACKET, 'Risk Level and FIL', ['risk.level', 'risk.fil_code', 'risk.factors_change'], { prefix: 'd. ', aliases: ['Risk level'] }),
    f('planned_action', 'Planned Action/Follow-Up & Appropriate Referrals', G_PACKET, 'Planned Actions and Referrals', ['followup.action', 'followup.referrals'], { prefix: 'e. ', unchanged: 'clarify' }),
    f('next_assessment', 'Next Scheduled Assessment', G_PACKET, 'Next Assessment', ['followup.next_assessment'], { prefix: 'f. ', unchanged: 'never', aliases: ['Next assessment'] }),
    f('idc', 'IDC with HC RN', G_PACKET, 'Interdisciplinary Conference', ['followup.idc'], { prefix: 'g. ', unchanged: 'clarify', hint: 'Full names of all participants.' }),
  ],
};

// ---------------------------------------------------------------------------
// Six-month reassessment journal (agency format). Shorter than the annual: no eligibility,
// financial or annual-packet sections. Used automatically when the assessment type is
// "Six-Month Reassessment".
const S1 = '1) Assessment Information';
const S2 = '2) Background: Basic Information/Medical & Fall Risk';
const S3 = '3) Needs/Supports/Services';
const S4 = '4) Conclusion: Risk/Follow-Up Plan';

export const SIX_MONTH_JOURNAL_TEMPLATE: JournalTemplate = {
  id: 'six-month-journal-standard',
  name: 'Six-month reassessment journal (agency format)',
  version: '1.0',
  fields: [
    f('assessment_date', 'Assessment Date', S1, 'Assessment Information', ['basic.assessment_date'], { prefix: 'a. ', unchanged: 'never', hint: 'Filled from the assessment date.' }),
    f('location', 'Location of HV', S1, 'Assessment Information', ['basic.location'], { prefix: 'b. ', aliases: ['Location of Assessment', 'Location', 'Location of Home Visit'] }),
    f('home_environment', 'Home Environment', S1, 'Home Environment and Observations', ['basic.home_environment'], { prefix: 'c. ', unchanged: 'carry-flag', aliases: ['Home Environment Condition'] }),
    f('people_present', 'People present at HV', S1, 'Assessment Information', ['basic.people_present'], { prefix: 'd. ', unchanged: 'clarify', aliases: ['People Present at Home Visit', 'People Present'], hint: 'Who attended this visit.' }),
    f('observations', 'Observations of Consumer', S1, 'Home Environment and Observations', ['basic.observations'], { prefix: 'e. ', unchanged: 'clarify', aliases: ['Observations', 'Observation'], hint: 'Observations from this visit.' }),
    f('self_reported_health', 'Health Assessment', S1, 'Home Environment and Observations', [], { prefix: 'f. ', unchanged: 'carry-flag', aliases: ['Self-reported assessment of health'], hint: 'Vision, hearing, appetite and how the consumer rates their health.' }),
    f('info_additional', 'Additional Information', S1, 'Home Environment and Observations', [], { prefix: 'g. ', unchanged: 'carry-flag', hint: 'Anything else from the visit, or "None".' }),
    f('age_marital', 'Age & Marital Status', S2, 'Basic Information', ['basic.age', 'basic.marital_status'], { prefix: 'a. ', unchanged: 'carry-flag', hint: 'Age changes every year.' }),
    f('living_arrangements', 'Living Arrangements', S2, 'Basic Information', ['basic.living_arrangement'], { prefix: 'b. ', unchanged: 'carry-flag' }),
    f('mood_cognitive', 'Mood/Cognitive Status', S2, 'Cognitive and Memory Screening', ['medical.cognitive_status'], { prefix: 'c. ' }),
    f('memory_screening', 'MLS Results', S2, 'Cognitive and Memory Screening', ['medical.memory_screening', 'mls.status'], { prefix: 'd. ', aliases: ['Memory Loss Screening', 'MLS'], hint: 'Result if done at this visit, or "N/A" (the MLS is done annually).' }),
    f('medical_conditions', 'Diagnoses', S2, 'Medical Conditions', ['medical.conditions'], { prefix: 'e. ', aliases: ['Medical Conditions'] }),
    f('medications', 'Medications', S2, 'Medications', ['medical.medication_review'], { prefix: 'f. ', unchanged: 'carry-flag' }),
    f('pcp', 'PCP/Specialist last/next appointment', S2, 'PCP and Specialist Information', ['medical.pcp_last_visit', 'medical.pcp_info'], { prefix: 'g. ', unchanged: 'clarify', aliases: ['PCP/Specialist Last/Next Appointment'] }),
    f('hospitalizations', 'Recent Hospitalizations', S2, 'Hospitalizations', ['medical.hospitalizations'], { prefix: 'h. ', unchanged: 'carry-flag' }),
    f('falls', 'Recent Falls', S2, 'Falls and Fall Risk', ['medical.falls'], { prefix: 'i. ', unchanged: 'carry-flag', hint: 'Falls since the last assessment and any injuries.' }),
    f('bg_additional', 'Additional Information', S2, 'Medical Conditions', [], { prefix: 'j. ', unchanged: 'carry-flag', hint: 'Anything else, or "None".' }),
    f('consumer_needs', 'What consumers feel they need for service', S3, 'Service Satisfaction', ['services.additional_needs', 'services.satisfaction'], { prefix: 'a. ', aliases: ['What consumer feels they need for service'] }),
    f('adls', 'ADLs and IADLs consumer assistance is needed for', S3, 'ADLs and IADLs', [], { prefix: 'b. ', unchanged: 'carry-flag', aliases: ['Consumer’s ADLs and IADLs', "Consumer's ADLs and IADLs", 'ADLs and IADLs'], hint: 'State the level for each ADL and IADL. Each activity should appear once.' }),
    f('informal_supports', 'Informal Supports', S3, 'Informal Supports', ['services.informal_supports'], { prefix: 'c. ' }),
    f('formal_supports', 'Formal Supports', S3, 'Formal Supports', ['services.personal_care', 'services.hha_hours', 'services.pers', 'services.rn', 'services.pt_ot', 'services.transportation'], { prefix: 'd. ' }),
    f('other_programs', 'Other internal agency program enrollments', S3, 'Current Programs and Services', [], { prefix: 'e. ', unchanged: 'carry-flag' }),
    f('unmet_needs', 'Unmet ADL and IADL', S3, 'ADLs and IADLs', [], { prefix: 'f. ', unchanged: 'carry-flag', hint: 'Needs not met by any support, or "None".' }),
    f('fil', 'Calculated FIL', S3, 'Risk Level and FIL', ['risk.fil_code'], { prefix: 'g. ', unchanged: 'carry-flag' }),
    f('program', 'Proposed program and initial service plan', S3, 'Current Programs and Services', ['program.type', 'services.current', 'services.meals'], { prefix: 'h. ', aliases: ['Current Program and Service Plan'] }),
    f('needs_additional', 'Additional Information', S3, 'Changes in Needs', ['services.changes', 'medical.health_status_change'], { prefix: 'i. ', unchanged: 'clarify', hint: 'Changes since the last assessment, or "None".' }),
    f('emergency_contacts', 'Statement that Emergency Contacts were reviewed and updated on', S4, 'Emergency Contacts', ['contacts.emergency_contacts', 'contacts.primary_emergency_contact', 'contacts.alternate_emergency_contact'], { prefix: 'a. ', unchanged: 'never', aliases: ['Emergency Contacts'] }),
    f('risk', 'Risk Level', S4, 'Risk Level and FIL', ['risk.level', 'risk.factors_change'], { prefix: 'b. ', aliases: ['Risk Level/Explanation if Changes'] }),
    f('planned_action', 'Planned Action/Follow-Up & Appropriate Referrals', S4, 'Planned Actions and Referrals', ['followup.action', 'followup.referrals'], { prefix: 'c. ', unchanged: 'clarify' }),
    f('next_assessment', 'Next Scheduled Assessment', S4, 'Next Assessment', ['followup.next_assessment'], { prefix: 'd. ', unchanged: 'never', aliases: ['Next assessment'] }),
  ],
};

/** The journal format to use for an assessment type: six-month reassessments use the shorter format. */
export function journalTemplateFor(settings: { journalTemplate: JournalTemplate; sixMonthJournalTemplate?: JournalTemplate }, assessmentType: string): JournalTemplate {
  return assessmentType === 'Six-Month Reassessment' ? settings.sixMonthJournalTemplate ?? SIX_MONTH_JOURNAL_TEMPLATE : settings.journalTemplate;
}
