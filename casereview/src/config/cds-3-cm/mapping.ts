// Narrative-to-CDS answer mapping for CDS-3-CM v3.3.2.
//
// The questions and answer choices come from the instrument file (parsed from the form export).
// This file only says which extracted narrative facts can SUPPORT an answer, and which answer
// choices are candidates. Rules never invent answers: when the narrative does not state the
// level (e.g. "assistance is provided" without supervision/limited/extensive), several candidate
// choices are listed and the case manager selects after verification. A question with no matching
// narrative statement is "Not Documented" — never "0 - No" / "Not present".

import type { AnswerRule } from '../../engine/types.ts';

export interface CdsMappingEntry {
  /** Stable id used by the app (tests, approvals). */
  id: string;
  /** Locate the instrument question: group/section substring and a label regex (case-insensitive). */
  find: { group?: string; label: string };
  factKeys: string[];
  answerRules?: AnswerRule[];
  requiresRecord?: string;
  guidance?: string;
}

const fk = (area: string) => `functional.${area}`;
const VERIFY_LEVEL = 'The narrative documents that help is needed but not the level. Select the code that matches the assessment.';

const iadlPerf = (area: string): AnswerRule[] => [
  { factKey: fk(area), valueMatches: '^Independent$', choices: ['0'], note: 'Narrative documents independence.' },
  { factKey: fk(area), valueMatches: '^Needs Assistance$', choices: ['1', '2'], verify: true, note: VERIFY_LEVEL },
  { factKey: fk(area), valueMatches: '^Dependent$', choices: ['2', '3'], verify: true, note: VERIFY_LEVEL },
  { factKey: fk(area), valueMatches: '^Assistance Provided$', choices: ['1', '2', '3'], verify: true, note: 'Someone else helps with or performs this activity; the level is not stated.' },
  { factKey: fk(area), valueMatches: '^Mentioned', choices: [], verify: true, note: 'Activity mentioned without a level of independence.' },
];
const adlPerf = (area: string): AnswerRule[] => [
  { factKey: fk(area), valueMatches: '^Independent$', choices: ['0'], note: 'Narrative documents independence. If the consumer experiences difficulty, "INDEPENDENT - but experiences difficulty" may apply.' },
  { factKey: fk(area), valueMatches: '^Needs Assistance$', choices: ['1', '2', '3', '4', '5'], verify: true, note: VERIFY_LEVEL },
  { factKey: fk(area), valueMatches: '^Dependent$', choices: ['5', '6'], verify: true, note: VERIFY_LEVEL },
  { factKey: fk(area), valueMatches: '^Assistance Provided$', choices: ['1', '2', '3', '4', '5', '6'], verify: true, note: 'Someone else helps with or performs this activity; the level is not stated.' },
  { factKey: fk(area), valueMatches: '^Mentioned', choices: [], verify: true, note: 'Activity mentioned without a level of independence.' },
];
const whoHelps = (...areas: string[]): AnswerRule[] =>
  areas.map((a) => ({ factKey: fk(a), valueMatches: '^Independent$', choices: ['4'], verify: true, note: 'Independence documented; confirm no help is needed.' }));
const disease = (pattern: string, extraNote = ''): AnswerRule[] => [
  {
    factKey: 'medical.conditions', valueMatches: pattern, choices: ['1', '2', '3'], verify: true,
    note: `Diagnosis listed in the narrative. Select whether it is monitored/treated by a home care professional, or reported but not confirmed.${extraNote}`,
  },
];

const IADL_AREAS: Record<string, string> = {
  meal_preparation: '1', housekeeping: '2', laundry: '3', money_management: '4', medication_management: '5',
  telephone: '6', shopping: '7', transportation: '8', outdoor_mobility: '12',
};
const ADL_AREAS: Record<string, string> = {
  bed_mobility: '9', transfers: '10', indoor_locomotion: '11', dressing: '13', eating: '14', toileting: '15', bathing: '16', incontinence_management: '17',
};

/**
 * FIL definitions from CDS-3-CM v3.3.2 ("FIL Calculation" › c.). Used only for a consistency
 * check of the documented FIL against the narrative — never to calculate or certify eligibility.
 * Locomotion outside of home is counted as an IADL deficit by the instrument.
 */
export const FIL_DEFINITIONS = {
  source: 'CDS-3-CM v3.3.2, FIL Calculation c.',
  adlAreas: Object.keys(ADL_AREAS),
  iadlAreas: Object.keys(IADL_AREAS),
  tiers: [
    { tier: '1', minAdl: 4, maxAdl: Infinity, minIadl: 0, text: '4 or more ADLs (regardless of IADLs)' },
    { tier: '2', minAdl: 2, maxAdl: 3, minIadl: 0, text: '2-3 ADLs (regardless of IADLs)' },
    { tier: '3', minAdl: 1, maxAdl: 1, minIadl: 0, text: '1 ADL, or 6 or more IADLs', altMinIadl: 6 },
    { tier: '4', minAdl: 0, maxAdl: 0, minIadl: 4, maxIadl: 5, text: '4-5 IADLs and no ADLs' },
  ],
} as const;

const FIL_CODES = ['1C', '1NC', '2C', '2NC', '3C', '3NC', '4C', '4NC'];

export const CDS_3_CM_MAPPINGS: CdsMappingEntry[] = [
  // ---------------- AA / BB ----------------
  { id: 'AA_age', find: { group: 'AA Age', label: 'age in years' }, factKeys: ['basic.age'] },
  { id: 'AA_primary_md_name', find: { group: 'AA Primary Care', label: '^Primary MD name' }, factKeys: ['medical.pcp_info'] },
  {
    id: 'BB_gender', find: { group: 'BB Gender', label: 'current gender' }, factKeys: ['basic.gender'],
    answerRules: [{ valueMatches: '^female$', choices: ['Female'] }, { valueMatches: '^male$', choices: ['Male'] }],
    guidance: 'Gender identity should be asked, not inferred from the narrative.',
  },
  {
    id: 'BB_marital_status', find: { group: 'BB Marital', label: 'Marital status' }, factKeys: ['basic.marital_status'],
    answerRules: [
      { valueMatches: '^single$', choices: ['Single'] }, { valueMatches: '^married$', choices: ['Married'] },
      { valueMatches: '^widowed$', choices: ['Widowed'] }, { valueMatches: '^divorced$', choices: ['Divorced'] },
      { valueMatches: '^separated$', choices: ['Legally Separated'], verify: true, note: 'Confirm the separation is legal.' },
    ],
  },
  {
    id: 'BB_directives', find: { group: 'BB Responsibilities', label: 'Directives in place' }, factKeys: ['contacts.health_care_proxy'],
    answerRules: [{ valueMatches: '^(?!none)', choices: ['HCP'], verify: true, note: 'A Health Care Proxy is documented; confirm other directives.' }],
  },
  { id: 'BB_hcp_name', find: { group: 'BB Responsibilities', label: "Health Care Proxy's Name" }, factKeys: ['contacts.health_care_proxy'] },
  { id: 'BB_contact_a_name', find: { group: 'BB Emergency Contact (A)', label: '^a\\. Name' }, factKeys: ['contacts.primary_emergency_contact'] },
  { id: 'BB_contact_b_name', find: { group: 'BB Emergency Contact (B)', label: '^a\\. Name' }, factKeys: ['contacts.alternate_emergency_contact'] },
  {
    id: 'BB_caregiver', find: { group: 'BB Caregiver', label: 'identified Caregiver' }, factKeys: ['services.informal_supports'],
    answerRules: [{ assertion: 'affirmed', valueMatches: '\\b(assist\\w*|help\\w*|care\\w*|pca\\w*|serves|caregiver)\\b', choices: ['1'], verify: true, note: 'Hands-on informal support is documented; confirm it meets the definition of an identified caregiver.' }],
  },

  // ---------------- A / B ----------------
  { id: 'A_date', find: { group: 'A Reference Date', label: 'Date of assessment' }, factKeys: ['basic.assessment_date'] },
  {
    id: 'A_method', find: { group: 'A Method', label: 'What method' }, factKeys: ['basic.location'],
    answerRules: [{ valueMatches: '\\bhome\\b', choices: ['In-person'], verify: true, note: 'Visit documented at the consumer\'s home.' }],
  },
  {
    id: 'A_goals_identified', find: { group: 'A Goals', label: 'goal\\(s\\) identified' }, factKeys: ['goals.new', 'goals.existing'],
    answerRules: [
      { assertion: 'affirmed', choices: ['1'], note: 'Goals are documented.' },
      { assertion: 'reported_absent', choices: ['0'], note: 'The narrative states that no goals were identified (documented absence, not missing information).' },
    ],
  },
  { id: 'A_goals_text', find: { group: 'A Goals', label: "Identif\\w* the consumer's person-centered" }, factKeys: ['goals.new', 'goals.existing'], answerRules: [{ assertion: 'affirmed' }] },
  {
    id: 'B_mls_score', find: { group: 'B Memory Loss Screen', label: 'score of the Memory Loss Screen' }, factKeys: ['medical.memory_screening'],
    answerRules: [
      { assertion: 'declined', choices: ['Not completed'], note: 'Screen declined — not completed.' },
      { assertion: 'not_completed', choices: ['Not completed'] },
      { valueMatches: 'score (\\d)', captureChoice: 1, verify: true },
    ],
  },
  {
    id: 'B_mls_reason', find: { group: 'B Memory Loss Screen', label: 'NOT COMPLETED, indicate the reason' }, factKeys: ['medical.memory_screening'],
    answerRules: [
      { assertion: 'declined', choices: ['Refused (dementia is suspected)', 'Refused (dementia not suspected)'], verify: true, note: 'The consumer declined. Whether dementia is suspected must be determined by the case manager.' },
      { assertion: 'not_completed', choices: ['Current diagnosis ADRD', 'Non-cognitive disability', 'Defer to later date'], verify: true },
    ],
  },

  // ---------------- H.1 IADLs ----------------
  { id: 'H1_meal_preparation', find: { group: 'H.1', label: 'PERFORMANCE CODE - MEAL PREPARATION' }, factKeys: [fk('meal_preparation')], answerRules: iadlPerf('meal_preparation') },
  { id: 'H1_meal_preparation_who', find: { group: 'H.1', label: 'Who helps with Meal Preparation' }, factKeys: [fk('meal_preparation')], answerRules: whoHelps('meal_preparation') },
  {
    id: 'H1_ordinary_housework', find: { group: 'H.1', label: 'PERFORMANCE CODE - ORDINARY HOUSEWORK' }, factKeys: [fk('housekeeping'), fk('laundry')],
    answerRules: [...iadlPerf('housekeeping'), ...iadlPerf('laundry')], guidance: 'Ordinary housework includes laundry on this instrument.',
  },
  { id: 'H1_housekeeping_who', find: { group: 'H.1', label: 'Who helps with Housekeeping' }, factKeys: [fk('housekeeping')], answerRules: whoHelps('housekeeping') },
  { id: 'H1_laundry_who', find: { group: 'H.1', label: 'Who helps with Laundry' }, factKeys: [fk('laundry')], answerRules: whoHelps('laundry') },
  { id: 'H1_managing_finance', find: { group: 'H.1', label: 'PERFORMANCE CODE - MANAGING FINANCE' }, factKeys: [fk('money_management')], answerRules: iadlPerf('money_management') },
  { id: 'H1_managing_finance_who', find: { group: 'H.1', label: 'Who helps with managing finances' }, factKeys: [fk('money_management')], answerRules: whoHelps('money_management') },
  { id: 'H1_managing_medications', find: { group: 'H.1', label: 'PERFORMANCE CODE - MANAGING MEDICATIONS' }, factKeys: [fk('medication_management')], answerRules: iadlPerf('medication_management') },
  { id: 'H1_managing_medications_who', find: { group: 'H.1', label: 'Who helps with Medication Management' }, factKeys: [fk('medication_management')], answerRules: whoHelps('medication_management') },
  { id: 'H1_phone_use', find: { group: 'H.1', label: 'PERFORMANCE CODE - PHONE USE' }, factKeys: [fk('telephone')], answerRules: iadlPerf('telephone') },
  { id: 'H1_phone_use_who', find: { group: 'H.1', label: 'Who helps with Telephone' }, factKeys: [fk('telephone')], answerRules: whoHelps('telephone') },
  { id: 'H1_shopping', find: { group: 'H.1', label: 'PERFORMANCE CODE - SHOPPING' }, factKeys: [fk('shopping')], answerRules: iadlPerf('shopping') },
  { id: 'H1_shopping_who', find: { group: 'H.1', label: 'Who helps with Shopping' }, factKeys: [fk('shopping')], answerRules: whoHelps('shopping') },
  { id: 'H1_transportation', find: { group: 'H.1', label: 'PERFORMANCE CODE - TRANSPORTATION' }, factKeys: [fk('transportation')], answerRules: iadlPerf('transportation') },
  { id: 'H1_transportation_who', find: { group: 'H.1', label: 'Who helps with Transportation' }, factKeys: [fk('transportation')], answerRules: whoHelps('transportation') },

  // ---------------- H.2 ADLs ----------------
  { id: 'H2_bed_mobility', find: { group: 'H.2', label: 'MOBILITY IN BED' }, factKeys: [fk('bed_mobility')], answerRules: adlPerf('bed_mobility') },
  { id: 'H2_bed_mobility_who', find: { group: 'H.2', label: 'Who helps with Mobility in Bed' }, factKeys: [fk('bed_mobility')], answerRules: whoHelps('bed_mobility') },
  { id: 'H2_transfer', find: { group: 'H.2', label: '^b\\. TRANSFER' }, factKeys: [fk('transfers')], answerRules: adlPerf('transfers') },
  { id: 'H2_transfer_who', find: { group: 'H.2', label: 'Who helps with Transfer' }, factKeys: [fk('transfers')], answerRules: whoHelps('transfers') },
  { id: 'H2_locomotion_in_home', find: { group: 'H.2', label: 'LOCOMOTION IN HOME' }, factKeys: [fk('indoor_locomotion')], answerRules: adlPerf('indoor_locomotion') },
  { id: 'H2_locomotion_in_home_who', find: { group: 'H.2', label: 'Who helps with Indoor Mobility' }, factKeys: [fk('indoor_locomotion')], answerRules: whoHelps('indoor_locomotion') },
  { id: 'H2_locomotion_outside', find: { group: 'H.2', label: 'LOCOMOTION OUTSIDE OF HOME' }, factKeys: [fk('outdoor_mobility')], answerRules: adlPerf('outdoor_mobility') },
  { id: 'H2_locomotion_outside_who', find: { group: 'H.2', label: 'Who helps with Outdoor Mobility' }, factKeys: [fk('outdoor_mobility')], answerRules: whoHelps('outdoor_mobility') },
  { id: 'H2_dressing_upper', find: { group: 'H.2', label: 'DRESSING UPPER BODY' }, factKeys: [fk('dressing')], answerRules: adlPerf('dressing'), guidance: 'The narrative usually does not distinguish upper and lower body dressing.' },
  { id: 'H2_dressing_lower', find: { group: 'H.2', label: 'DRESSING LOWER BODY' }, factKeys: [fk('dressing')], answerRules: adlPerf('dressing'), guidance: 'The narrative usually does not distinguish upper and lower body dressing.' },
  { id: 'H2_dressing_who', find: { group: 'H.2', label: 'Who helps with Dressing' }, factKeys: [fk('dressing')], answerRules: whoHelps('dressing') },
  { id: 'H2_eating', find: { group: 'H.2', label: '^g\\. EATING' }, factKeys: [fk('eating')], answerRules: adlPerf('eating') },
  { id: 'H2_eating_who', find: { group: 'H.2', label: 'Who helps with Eating' }, factKeys: [fk('eating')], answerRules: whoHelps('eating') },
  { id: 'H2_toilet_use', find: { group: 'H.2', label: 'TOILET USE' }, factKeys: [fk('toileting')], answerRules: adlPerf('toileting') },
  { id: 'H2_toilet_use_who', find: { group: 'H.2', label: 'Who helps with Toilet Use' }, factKeys: [fk('toileting')], answerRules: whoHelps('toileting') },
  { id: 'H2_bathing', find: { group: 'H.2', label: '^j\\. BATHING' }, factKeys: [fk('bathing')], answerRules: adlPerf('bathing') },
  { id: 'H2_bathing_who', find: { group: 'H.2', label: 'Who helps with Bathing' }, factKeys: [fk('bathing')], answerRules: whoHelps('bathing') },
  { id: 'I_incontinence_who', find: { group: 'I Incontinence management', label: 'Who helps with Incontinence' }, factKeys: [fk('incontinence_management')], answerRules: whoHelps('incontinence_management') },

  // ---------------- FIL Calculation (documented values only) ----------------
  {
    id: 'FIL_deficits', find: { group: 'Functional Impairment', label: 'Indicate the ADLs / IADLs for which the client requires' },
    factKeys: [...Object.keys({ ...IADL_AREAS, ...ADL_AREAS }).map(fk)],
    answerRules: Object.entries({ ...IADL_AREAS, ...ADL_AREAS }).map(([area, code]) => ({
      factKey: fk(area), valueMatches: '^(Needs Assistance|Dependent|Assistance Provided)$', choices: [code], verify: true,
    })),
    guidance: 'Suggested from activities the narrative documents as needing help. Activities not documented are not listed and must be assessed.',
  },
  {
    id: 'FIL_level', find: { group: 'Functional Impairment', label: "Functional Impairment Level \\(FIL\\)\\.$" }, factKeys: ['risk.fil_code'],
    answerRules: FIL_CODES.map((c) => ({ valueMatches: `^${c}$`, choices: [`${c[0]}-${c.slice(1)}`], verify: true, note: 'FIL as documented in the narrative. The tool does not calculate FIL; see QA 9 for the consistency check.' })),
    requiresRecord: 'CDS FIL calculation',
  },

  // ---------------- J Disease diagnoses ----------------
  { id: 'J_stroke', find: { group: 'J Heart', label: 'Cerebrovascular accident' }, factKeys: ['medical.conditions'], answerRules: disease('\\b(stroke|cva|cerebrovascular)\\b') },
  { id: 'J_chf', find: { group: 'J Heart', label: 'Congestive heart failure' }, factKeys: ['medical.conditions'], answerRules: disease('\\bchf\\b|heart failure') },
  { id: 'J_cad', find: { group: 'J Heart', label: 'Coronary artery disease' }, factKeys: ['medical.conditions'], answerRules: disease('\\bcad\\b|coronary artery') },
  { id: 'J_hypertension', find: { group: 'J Heart', label: 'Hypertension' }, factKeys: ['medical.conditions'], answerRules: disease('\\bhtn\\b|hypertension|high blood pressure') },
  { id: 'J_irregular_pulse', find: { group: 'J Heart', label: 'Irregularly irregular pulse' }, factKeys: ['medical.conditions'], answerRules: disease('atrial fibrillation|\\ba-?fib\\b|irregular') },
  { id: 'J_pvd', find: { group: 'J Heart', label: 'Peripheral vascular disease' }, factKeys: ['medical.conditions'], answerRules: disease('\\bpvd\\b|peripheral vascular') },
  { id: 'J_alzheimers', find: { group: 'J Neurological', label: "Alzheimer's$" }, factKeys: ['medical.conditions'], answerRules: disease('alzheimer') },
  { id: 'J_dementia_other', find: { group: 'J Neurological', label: 'Dementia other than' }, factKeys: ['medical.conditions'], answerRules: disease('^(?!.*alzheimer).*dementia') },
  { id: 'J_head_trauma', find: { group: 'J Neurological', label: 'Head trauma' }, factKeys: ['medical.conditions'], answerRules: disease('head trauma|\\btbi\\b|traumatic brain') },
  { id: 'J_hemiplegia', find: { group: 'J Neurological', label: 'Hemiplegia' }, factKeys: ['medical.conditions'], answerRules: disease('hemipleg|hemipares') },
  { id: 'J_ms', find: { group: 'J Neurological', label: 'Multiple sclerosis' }, factKeys: ['medical.conditions'], answerRules: disease('multiple sclerosis') },
  { id: 'J_parkinsonism', find: { group: 'J Neurological', label: 'Parkinsonism' }, factKeys: ['medical.conditions'], answerRules: disease('parkinson') },
  { id: 'J_arthritis', find: { group: 'J Musculo', label: 'Arthritis' }, factKeys: ['medical.conditions'], answerRules: disease('arthritis') },
  { id: 'J_hip_fracture', find: { group: 'J Musculo', label: 'Hip fracture' }, factKeys: ['medical.conditions'], answerRules: disease('hip fracture|fractur.*\\bhips?\\b', ' A history of fracture may not be a current diagnosis.') },
  { id: 'J_other_fractures', find: { group: 'J Musculo', label: 'Other fractures' }, factKeys: ['medical.conditions'], answerRules: disease('fractur', ' A history of fracture may not be a current diagnosis.') },
  { id: 'J_osteoporosis', find: { group: 'J Musculo', label: 'Osteoporosis' }, factKeys: ['medical.conditions'], answerRules: disease('osteoporosis') },
  { id: 'J_cataract', find: { group: 'J Senses', label: 'Cataract' }, factKeys: ['medical.conditions'], answerRules: disease('cataract') },
  { id: 'J_glaucoma', find: { group: 'J Senses', label: 'Glaucoma' }, factKeys: ['medical.conditions'], answerRules: disease('glaucoma') },
  { id: 'J_psychiatric', find: { group: 'J Psychiatric', label: 'Any psychiatric diagnosis' }, factKeys: ['medical.conditions'], answerRules: disease('anxiety|depress|bipolar|schizo|psychiatric|ptsd|psychosis') },
  { id: 'J_pneumonia', find: { group: 'J Infections', label: 'Pneumonia' }, factKeys: ['medical.conditions'], answerRules: disease('pneumonia', ' "History of" may mean the condition is not current.') },
  { id: 'J_tb', find: { group: 'J Infections', label: 'Tuberculosis' }, factKeys: ['medical.conditions'], answerRules: disease('tuberculosis|\\btb\\b') },
  { id: 'J_uti', find: { group: 'J Infections', label: 'Urinary tract infection' }, factKeys: ['medical.conditions'], answerRules: disease('\\buti\\b|urinary tract infection', ' This item covers the LAST 30 DAYS only.') },
  { id: 'J_cancer', find: { group: 'J Other', label: 'Cancer' }, factKeys: ['medical.conditions'], answerRules: disease('cancer|carcinoma|lymphoma|leukemia|melanoma', ' Excludes skin cancer; past 5 years only.') },
  { id: 'J_diabetes', find: { group: 'J Other', label: 'Diabetes' }, factKeys: ['medical.conditions'], answerRules: disease('diabet|\\bniddm\\b|\\biddm\\b|\\bdm\\b') },
  { id: 'J_copd', find: { group: 'J Other', label: 'Emphysema/COPD/asthma' }, factKeys: ['medical.conditions'], answerRules: disease('copd|emphysema|asthma') },
  { id: 'J_renal_failure', find: { group: 'J Other', label: 'Renal Failure' }, factKeys: ['medical.conditions'], answerRules: disease('renal failure|kidney failure|\\bckd\\b|chronic kidney') },
  { id: 'J_thyroid', find: { group: 'J Other', label: 'Thyroid disease' }, factKeys: ['medical.conditions'], answerRules: disease('thyroid') },
  {
    id: 'J3_unconfirmed', find: { group: 'J.3', label: 'Other diagnoses reported, not confirmed' }, factKeys: ['medical.conditions'],
    answerRules: [
      { valueMatches: 'anxiety', choices: ['PSYCH / Anxiety'], verify: true },
      { valueMatches: 'depress', choices: ['PSYCH / Depression'], verify: true },
      { valueMatches: 'bipolar', choices: ['PSYCH / Bipolar disorder'], verify: true },
      { valueMatches: 'non-?insulin', choices: ['METAB / Non-Insulin Dependent Diabetes'], verify: true },
      { valueMatches: '(?<!non-)(?<!non )insulin[- ]dependent', choices: ['METAB / Insulin Dependent Diabetes'], verify: true },
      { valueMatches: 'hyperlipid|cholesterol', choices: ['METAB / Hyperlipedema (high cholesterol)'], verify: true },
      { valueMatches: 'hypothyroid', choices: ['METAB / Hypothyroid'], verify: true },
      { valueMatches: 'rheumatoid', choices: ['MUSC/SKEL / Rheumatoid Arthritis'], verify: true },
      { valueMatches: 'osteoarthritis|degenerative joint', choices: ['MUSC/SKEL / Degenerative Joint Disease'], verify: true },
      { valueMatches: 'gout', choices: ['MUSC/SKEL / Gout'], verify: true },
      { valueMatches: 'seizure|epilep', choices: ['NEURO / Seizure Disorder/Epilepsy'], verify: true },
      { valueMatches: 'edema', choices: ['HEART / Edema'], verify: true },
      { valueMatches: 'bronchitis', choices: ['RESP / Bronchitis'], verify: true },
      { valueMatches: 'macular', choices: ['SENSES / Macular Degeneration'], verify: true },
    ],
    guidance: 'Only for diagnoses reported but not confirmed. Diagnoses confirmed by a provider belong in J.1.',
  },

  // ---------------- K / O / P ----------------
  {
    id: 'K5_falls_6mo', find: { group: 'K.5', label: 'fall in the past six' }, factKeys: ['medical.falls'],
    answerRules: [
      { assertion: 'reported_absent', choices: ['0'], verify: true, note: '"No recent falls" may not cover the full six months. Confirm with the consumer.' },
      { assertion: 'affirmed', choices: ['1', '2'], verify: true, note: 'A fall is documented; confirm the number of falls and complete the Falls Procedure.' },
    ],
  },
  {
    id: 'O_emergency_device', find: { group: 'O Emergency', label: 'Has Emergency Assistance Device' }, factKeys: ['services.pers'],
    answerRules: [{ assertion: 'affirmed', choices: ['1'] }, { assertion: 'reported_absent', choices: ['0'] }],
  },
  {
    id: 'P_occupational_therapy', find: { group: 'P Therapies', label: 'Occupational therapy' }, factKeys: ['services.pt_ot'],
    answerRules: [{ valueMatches: '\\bOT\\b|occupational', choices: ['1', '2', '3'], verify: true, note: 'OT is documented; adherence is not stated.' }],
  },
  {
    id: 'P_physical_therapy', find: { group: 'P Therapies', label: 'Physical therapy' }, factKeys: ['services.pt_ot'],
    answerRules: [{ valueMatches: '\\bPT\\b|physical therapy', choices: ['1', '2', '3'], verify: true, note: 'PT is documented; adherence is not stated.' }],
  },
  {
    id: 'P_ostomy_care', find: { group: 'P Other Treatments', label: 'Ostomy care' }, factKeys: ['medical.conditions'],
    answerRules: [{ valueMatches: 'ostomy', choices: ['1', '2', '3'], verify: true, note: 'An ostomy is documented; whether ostomy care is a scheduled treatment is not stated.' }],
  },
  {
    id: 'P_ostomy_equipment', find: { group: 'P Management of Equipment', label: '^d\\. Ostomy' }, factKeys: ['medical.conditions'],
    answerRules: [{ valueMatches: 'ostomy', choices: ['1', '2', '3', '4'], verify: true, note: 'An ostomy is documented; how it is managed is not stated.' }],
  },
  {
    id: 'P_seen_by_physician', find: { group: 'P Seen by Physician', label: 'seen by a physician in the past 12 months' }, factKeys: ['medical.pcp_last_visit'],
    answerRules: [{ assertion: 'affirmed', choices: ['1'], verify: true, note: 'A PCP appointment is documented; confirm it was within the past 12 months.' }],
  },
  {
    id: 'P_hospital_admissions', find: { group: 'P Visits', label: 'ADMITTED TO HOSPITAL' }, factKeys: ['medical.hospitalizations'],
    answerRules: [{ assertion: 'reported_absent', text: '0', verify: true, note: '"No recent hospitalizations" — confirm none since the last assessment.' }],
  },
];
