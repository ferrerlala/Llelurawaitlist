// FICTIONAL test data only. Do not replace with real consumer information.

export const SAMPLE_NARRATIVE = `ASSESSMENT INFORMATION
Assessment Date: 10/1/25
Location: Elder's home in North Andover.
Home Environment: Clean with clear pathways.
People Present: Case Manager and consumer.
Observation: Elder was friendly and engaged during the assessment.

BACKGROUND AND MEDICAL INFORMATION
* Consumer is a 75-year-old single female.
* Alert and oriented.
* Mini-Cog not completed because elder declined.
* Medical conditions: HTN, arthritis, history of fractured foot, legs, and hips, history of polio and post-polio syndrome.
* Medications reviewed. No changes reported.
* Last PCP appointment was August 2025.
* Consumer wants a new PCP who offers telehealth because transportation to in-person appointments is difficult.
* CM will mail a list of PCP providers.
* No recent hospitalizations reported.
* No recent falls reported.

NEEDS, SUPPORTS AND SERVICES
* Current services: 6 hours HHA and PERS.
* Consumer satisfied with current services.
* No additional service needs identified.
* Independent with financial management, medication management, ambulation in the home, bed mobility, eating, telephone use, toileting, and incontinence management.
* Family provides emotional support.
* Pathways provides PT and OT and may provide HHA in the future.
* RN services provided.
* Stop and Shop used for groceries.
* MRVTA provides transportation outside the home.
* Restaurants assist with meal preparation, including frozen meals.
* No reported changes in medical condition, functional status, informal supports, or formal services.
* Main identified need: assistance locating a new PCP offering telehealth.

ELIGIBILITY, FINANCIAL AND DOCUMENTATION
* Consumer continues to meet Age, Need, and FIL eligibility.
* Annual income: $12,827.18.
* Copay: $0.
* Overdue balance: $0.
* MassHealth: None.
* Application completed.
* Public Benefits reviewed and left with consumer.
* Privacy Practices/HIPAA reviewed and left with consumer.
* Applicant Consent and Disclosure signed 10/1/25.
* Permission to Contact Emergency Services signed 10/1/25.
* No new person-centered goals reported.
* Emergency contacts reviewed. No changes.
* Risk level: Risk 3, FIL 1C.
* No changes in risk factors reported.
* CM will mail PCP provider list.
* Next assessment: April 2026.
* IDC with HC RN: Linda L. (full name not supplied).`;

/** Fictional CDS excerpt for the narrative-vs-CDS comparison test. */
export const SAMPLE_CDS_RECORD = `FICTIONAL CDS EXCERPT (TEST DATA)
Financial management: Independent
Medication management: Independent
Eating: Independent
Toileting: Limited assistance
Bathing: Assistance required
Bed mobility: Independent
Indoor locomotion: Independent
Incontinence management: Independent
Meal preparation: Independent
Housekeeping: Needs assistance
Dressing: Independent
Risk level: Risk 3
Consumer goals: Locate a PCP who offers telehealth`;

/** Fictional financial worksheet with a deliberately different copay (discrepancy test). */
export const SAMPLE_FINANCIAL_WORKSHEET = `FINANCIAL WORKSHEET (FICTIONAL TEST DATA)
Annual income: $12,827.18
Copay: $15.00
Overdue balance: $0.00`;

/** Short example from the specification for the ADL comparison test. */
export const SPEC_EXAMPLE_NARRATIVE = 'Consumer remains independent with financial management, medication management, eating, and toileting.';
export const SPEC_EXAMPLE_CDS = `Financial management: Independent
Medication management: Independent
Eating: Independent
Toileting: Independent
Bathing: Assistance required`;

/**
 * FICTIONAL annual assessment written in an agency note template
 * ("Label: value" fields, lettered conclusion items, em-dash sub-items).
 * Deliberately contains documentation problems for testing: a blank template
 * field, an ADL documented as both independent and assisted, and a recent
 * surgery alongside "no changes" statements.
 */
export const SAMPLE_TEMPLATE_NARRATIVE = `Assessment Information
Assessment Date: 11/12/26

Location of Assessment: Elder’s home in Riverton

Home Environment Condition: Home was observed to be clean but cluttered.

People Present at Home Visit: Elder, elder’s son, PCA, and CM.

Observations of Consumer: Elder was pleasant and cooperative throughout the assessment. Elder ambulated using a rolling walker. Elder reported having recently undergone cataract surgery.
Self-reported assessment of health:
Background: Basic Information/Medical & Fall Risk
Living Arrangements: Consumer is a 72-year-old widowed female.
Mood/Cognitive Status: Consumer appeared alert and oriented during the assessment.
Memory Loss Screening: Mini-Cog screening was not completed, as elder declined to participate.
Medical Conditions: CHF, HTN, osteoarthritis, anxiety, non-insulin-dependent diabetes, history of pneumonia, COPD, and essential tremor.
Medications: Medications were reviewed with the elder. No medication changes were reported.
PCP/Specialist Last/Next Appointment: Elder reported her last PCP appointment was in September 2026.
Recent Hospitalizations: Elder reported no recent hospitalizations.
Recent Falls: Elder reported no recent falls.
Needs/Supports/Services
Current Program and Service Plan: Consumer is enrolled in HCB-NW and receives Home Delivered Meals (HDMs) and Personal Care (PC) services to assist with personal care needs.
Service Satisfaction/Additional Needs: Consumer reported satisfaction with current services and did not identify any additional service needs at this time.
Consumer’s ADLs and IADLs: Consumer reported independence with transferring, ambulation within the home, mobility in bed, eating, and telephone use. Assistance is provided with meal preparation, housekeeping, laundry, money management, medication management, food shopping, transportation, transfers, indoor/outdoor mobility, dressing, bathing, toileting, and incontinence management.
Informal Supports: Elder’s son provides informal support and also serves as one of her PCAs.
Formal Supports: Consumer receives PCA services totaling 40 hours per week through two workers.
Changes in Needs Since Last Assessment: Consumer reported no changes in her needs since the previous assessment.
4) Conclusion: Eligibility Verification/Risk/Financial & Documents Reviewed/Follow-Up Plan
a. Eligibility: Consumer continues to meet Age, Need, and FIL eligibility requirements for services.
b. Financial
— Application: Completed.

— Income Information: Annual combined income is $24,300.

— Copay: $0.

— Overdue Balance: $0.

— MassHealth: Pending MassHealth Standard.
Annual Packet:
— Public Benefits: Reviewed with consumer and left in the home. No referrals were made at this time.

— Privacy Practices/HIPAA: Reviewed with consumer and left in the home.

— Applicant Consent & Disclosure: Forms signed on 11/12/26.

— Permission to Contact Emergency Services: Form signed on 11/12/26.
Person-Centered Goal(s): Consumer did not identify any person-centered goals at the time of the assessment.
c. Emergency Contacts: Emergency contacts were reviewed with the consumer. No changes were reported.
d. Risk Level/Explanation if Changes: Risk Level 3; FIL 1C.
e. Planned Action/Follow-Up & Appropriate Referrals: No additional follow-up actions or referrals identified at this time.
f. Next Scheduled Assessment: May 2027.
g. IDC with HC RN: None indicated at this time.`;

/** FICTIONAL previous annual journal (November 2025) for the "Start Annual Assessment" workflow. */
export const SAMPLE_PREVIOUS_JOURNAL = `Assessment Information
Assessment Date: 11/6/2025
Location of Assessment: Elder’s home in Riverton
Home Environment Condition: Home was observed to be clean and organized.
People Present at Home Visit: Elder, elder’s son, and CM.
Observations of Consumer: Elder was pleasant and cooperative throughout the assessment.
Self-reported assessment of health: Elder described her health as fair.
Background: Basic Information/Medical & Fall Risk
Living Arrangements: Consumer is a 71-year-old widowed female who lives alone.
Mood/Cognitive Status: Consumer appeared alert and oriented during the assessment.
Memory Loss Screening: Mini-Cog screening was completed with a score of 4.
Medical Conditions: CHF, HTN, osteoarthritis, anxiety, non-insulin-dependent diabetes, and COPD.
Medications: Medications were reviewed with the elder. No medication changes were reported.
PCP/Specialist Last/Next Appointment: Elder reported her last PCP appointment was in August 2025.
Recent Hospitalizations: Elder reported a hospitalization for pneumonia in March 2025.
Recent Falls: Elder reported no recent falls.
Needs/Supports/Services
Current Program and Service Plan: Consumer is enrolled in HCB-NW and receives Home Delivered Meals (HDMs) and Personal Care (PC) services to assist with personal care needs.
Service Satisfaction/Additional Needs: Consumer reported satisfaction with current services and did not identify any additional service needs at this time.
Consumer’s ADLs and IADLs: Consumer reported independence with transferring, ambulation within the home, mobility in bed, eating, and telephone use. Assistance is provided with meal preparation, housekeeping, laundry, money management, medication management, food shopping, transportation, dressing, bathing, toileting, and incontinence management.
Informal Supports: Elder’s son provides informal support.
Formal Supports: Consumer receives PCA services totaling 30 hours per week through one worker.
Changes in Needs Since Last Assessment: Consumer reported increased difficulty with bathing.
4) Conclusion: Eligibility Verification/Risk/Financial & Documents Reviewed/Follow-Up Plan
a. Eligibility: Consumer continues to meet Age, Need, and FIL eligibility requirements for services.
b. Financial
— Application: Completed.
— Income Information: Annual combined income is $23,900.
— Copay: $0.
— Overdue Balance: $0.
— MassHealth: None.
Annual Packet:
— Public Benefits: Reviewed with consumer and left in the home.
— Privacy Practices/HIPAA: Reviewed with consumer and left in the home.
— Applicant Consent & Disclosure: Forms signed on 11/6/2025.
— Permission to Contact Emergency Services: Form signed on 11/6/2025.
Person-Centered Goal(s): Consumer would like to remain safely in her home.
c. Emergency Contacts: Emergency contacts were reviewed with the consumer. No changes were reported.
d. Risk Level/Explanation if Changes: Risk Level 3; FIL 1C.
e. Planned Action/Follow-Up & Appropriate Referrals: CM will refer consumer to the PCA program for increased hours.
f. Next Scheduled Assessment: May 2026.
g. IDC with HC RN: None indicated at this time.`;

/**
 * FICTIONAL case manager input for the November 12, 2026 annual assessment
 * (field id → [status, new text]). Produces the agency-template sample, including its
 * documentation problems (transfer contradiction, mobility inconsistency, son as PCA).
 */
export const SAMPLE_ANNUAL_CHANGES: Record<string, ['unchanged' | 'changed' | 'clarify', string]> = {
  location: ['unchanged', ''],
  home_environment: ['changed', 'Home was observed to be clean but cluttered.'],
  people_present: ['changed', 'Elder, elder’s son, PCA, and CM.'],
  observations: ['changed', 'Elder was pleasant and cooperative throughout the assessment. Elder ambulated using a rolling walker. Elder reported having recently undergone cataract surgery.'],
  living_arrangements: ['changed', 'Consumer is a 72-year-old widowed female.'],
  mood_cognitive: ['unchanged', ''],
  memory_screening: ['changed', 'Mini-Cog screening was not completed, as elder declined to participate.'],
  medical_conditions: ['changed', 'CHF, HTN, osteoarthritis, anxiety, non-insulin-dependent diabetes, history of pneumonia, COPD, and essential tremor.'],
  medications: ['unchanged', ''],
  pcp: ['changed', 'Elder reported her last PCP appointment was in September 2026.'],
  hospitalizations: ['changed', 'Elder reported no recent hospitalizations.'],
  falls: ['unchanged', ''],
  program: ['unchanged', ''],
  satisfaction: ['unchanged', ''],
  adls: ['changed', 'Consumer reported independence with transferring, ambulation within the home, mobility in bed, eating, and telephone use. Assistance is provided with meal preparation, housekeeping, laundry, money management, medication management, food shopping, transportation, transfers, indoor/outdoor mobility, dressing, bathing, toileting, and incontinence management.'],
  informal_supports: ['changed', 'Elder’s son provides informal support and also serves as one of her PCAs.'],
  formal_supports: ['changed', 'Consumer receives PCA services totaling 40 hours per week through two workers.'],
  changes_in_needs: ['changed', 'Consumer reported no changes in her needs since the previous assessment.'],
  eligibility: ['unchanged', ''],
  application: ['changed', 'Completed.'],
  income: ['changed', 'Annual combined income is $24,300.'],
  copay: ['unchanged', ''],
  overdue_balance: ['unchanged', ''],
  masshealth: ['changed', 'Pending MassHealth Standard.'],
  public_benefits: ['changed', 'Reviewed with consumer and left in the home. No referrals were made at this time.'],
  hipaa: ['changed', 'Reviewed with consumer and left in the home.'],
  acd: ['changed', 'Forms signed on 11/12/2026.'],
  ems_permission: ['changed', 'Form signed on 11/12/2026.'],
  goals: ['changed', 'Consumer did not identify any person-centered goals at the time of the assessment.'],
  emergency_contacts: ['unchanged', ''],
  risk: ['unchanged', ''],
  planned_action: ['changed', 'No additional follow-up actions or referrals identified at this time.'],
  next_assessment: ['changed', 'May 2027.'],
  idc: ['changed', 'None indicated at this time.'],
};
