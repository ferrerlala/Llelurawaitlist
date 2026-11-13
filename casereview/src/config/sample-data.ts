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
