// Annual QA checklist configuration modeled on the categories of the
// AgeSpan Home Care Case Review 2026/2027 checklist as described by the product owner.
// Requirement text is editable and versioned (Settings › QA Checklist).
// This application is not affiliated with or endorsed by AgeSpan or WellSky.

import type { QaChecklist } from '../engine/types.ts';

export const DEFAULT_QA_CHECKLIST: QaChecklist = {
  id: 'agespan-home-care-annual-2026-2027',
  name: 'Home Care Annual Case Review (AgeSpan 2026/2027 categories)',
  version: '2026.1',
  basis: 'Categories based on the AgeSpan Home Care Case Review 2026/2027 checklist. Configurable.',
  disclaimer:
    'Automated QA results are review aids only. They never certify that a file passes QA or that a consumer is eligible.',
  categories: [
    {
      id: 'contact_info', number: 1, title: 'Required Contact Information', evaluator: 'contactInfo', priority: 'Medium', enabled: true,
      requirements: [
        'Primary Emergency Contact full name',
        'Primary emergency contact phone number',
        'Full address and ZIP code',
        'Alternate emergency contact full name',
        'Alternate emergency contact phone number or "None Available"',
        'Healthcare Proxy information or "None Available"',
        'PCP phone number',
        'PCP address and town, when available',
      ],
      requiredRecords: ['WellSky contact records'],
    },
    {
      id: 'rd_ra_visits', number: 2, title: 'RD and RA Visits', evaluator: 'visits', priority: 'High', enabled: true,
      requirements: [
        'Required RD and RA visits occurred during the month due under the applicable program schedule',
        'At least two documented attempts during the month due when the visit was not completed, or an appropriate supporting reason',
      ],
      requiredRecords: ['Program visit schedule / due month', 'WellSky visit history'],
      params: { minimumAttempts: 2 },
    },
    {
      id: 'activities_referrals', number: 3, title: 'Care Manager Activities and Referrals', evaluator: 'activities', priority: 'Medium', enabled: true,
      requirements: [
        'Activities and Referrals documentation is accurate',
        'One full year of activities is available',
        'Applicable active Home Care cases open for at least one year are included',
      ],
      requiredRecords: ['WellSky Activities and Referrals'],
    },
    {
      id: 'financial_consent', number: 4, title: 'Financial Worksheet and Consent', evaluator: 'financialConsent', priority: 'High', enabled: true,
      requirements: [
        'Financial Worksheet completed at Annual Redetermination',
        'Applicant Consent and Disclosure completed',
        'Both documents present in the file',
      ],
      requiredRecords: ['Financial Worksheet', 'Applicant Consent and Disclosure'],
    },
    {
      id: 'copay', number: 5, title: 'Copay Consistency', evaluator: 'copay', priority: 'High', enabled: true,
      requirements: [
        'Financial Worksheet copay',
        'Applicant Consent and Disclosure copay',
        'Narrative copay',
        'Flag any discrepancy',
      ],
      requiredRecords: ['Financial Worksheet', 'Applicant Consent and Disclosure'],
    },
    {
      id: 'goals', number: 6, title: 'Consumer Goals', evaluator: 'goals', priority: 'Medium', enabled: true,
      requirements: ['Consumer Goals are complete in CDS', 'CDS goals match goals identified in the narrative'],
      requiredRecords: ['CDS Consumer Goals section'],
    },
    {
      id: 'mls', number: 7, title: 'MLS', evaluator: 'mls', priority: 'Medium', enabled: true,
      requirements: [
        'MLS completed annually',
        'CDS section date and status match the narrative',
        'Appropriate follow-up documented',
        'MLS date field in CDS aligns with the assessment date when required',
      ],
      requiredRecords: ['CDS MLS section'],
    },
    {
      id: 'narrative_cds', number: 8, title: 'Journal Note/Narrative and CDS Consistency', evaluator: 'narrativeCds', priority: 'High', enabled: true,
      requirements: [
        'Narrative and CDS support each other',
        'Identify discrepancies or omissions',
        'Guideline: three or fewer discrepancies/omissions (review threshold, not a pass)',
        'Special attention: housekeeping, laundry, indoor locomotion, meal preparation',
      ],
      requiredRecords: ['CDS record'],
      params: { discrepancyThreshold: 3, focusAreas: 'housekeeping,laundry,indoor_locomotion,meal_preparation' },
    },
    {
      id: 'fil', number: 9, title: 'FIL Calculation', evaluator: 'fil', priority: 'High', enabled: true,
      requirements: ['FIL calculation in CDS is accurate', 'Supporting information demonstrates Home Care eligibility'],
      requiredRecords: ['CDS FIL calculation', 'Approved FIL formula and inputs'],
      params: { approvedFormulaConfigured: false },
    },
    {
      id: 'fall_risk', number: 10, title: 'Fall Risk', evaluator: 'fallRisk', priority: 'High', enabled: true,
      requirements: [
        'Fall risk documented',
        'CDS K5 and corresponding fall questions completed at RA and RD visits, as applicable',
        'Falls Procedure followed when a fall is reported',
      ],
      requiredRecords: ['CDS K5 and fall questions'],
    },
    {
      id: 'risk_worksheet', number: 11, title: 'Risk Worksheet', evaluator: 'riskWorksheet', priority: 'High', enabled: true,
      requirements: [
        'Risk Worksheet completed',
        'Worksheet updated when status changes',
        'Risk level matches the worksheet, AltID2, and RD Narrative',
        'Review date is current',
      ],
      requiredRecords: ['Risk Worksheet', 'AltID2'],
    },
    {
      id: 'ra_rd_timeliness', number: 12, title: 'Six-Month Reassessment and Annual Redetermination', evaluator: 'timeliness', priority: 'High', enabled: true,
      requirements: [
        'A&D documentation completed within the applicable timeframe',
        'Checklist timeframe: five business days',
        'Timing flagged for human verification against policy and dates',
      ],
      requiredRecords: ['WellSky A&D completion date'],
      params: { businessDays: 5 },
    },
    {
      id: 'program_care_plan', number: 13, title: 'Program and Care Plan', evaluator: 'carePlan', priority: 'Medium', enabled: true,
      requirements: ['Program selection is appropriate', 'Care Plan addresses consumer needs', 'Services align with documented functional and support needs'],
      requiredRecords: ['Care Plan', 'Program record'],
    },
    {
      id: 'suspension', number: 14, title: 'Suspension Information', evaluator: 'suspension', priority: 'Medium', enabled: true,
      requirements: [
        'Journal suspension information matches the Service Suspension record',
        'Monthly follow-up documented',
        'Nutrition suspension requirement applied only where applicable',
      ],
      requiredRecords: ['Service Suspension record'],
    },
    {
      id: 'timely_followup', number: 15, title: 'Timely Follow-Up', evaluator: 'timelyFollowUp', priority: 'Medium', enabled: true,
      requirements: [
        'Consumer requests', 'Family requests', 'Vendor requests', 'Help Desk requests', 'Status changes', 'Outstanding copay follow-up, where applicable',
      ],
      requiredRecords: ['Journal follow-up entries'],
    },
    {
      id: 'idc', number: 16, title: 'Interdisciplinary Conferences', evaluator: 'idc', priority: 'Medium', enabled: true,
      requirements: [
        'Interdisciplinary conferences documented',
        'Full names of participants',
        'Applicable events: RA, RD, Waiver, ECOP, PC, EHSP, service increases, status changes, other agency programs',
      ],
      requiredRecords: [],
    },
    {
      id: 'emergency_permission', number: 17, title: 'Permission to Contact Emergency Services', evaluator: 'emergencyPermission', priority: 'High', enabled: true,
      requirements: [
        'Applicant Consent and Disclosure form includes permission to contact emergency services',
        'Corresponding information documented in the Notes section on the A&D Details page',
      ],
      requiredRecords: ['Applicant Consent and Disclosure form', 'A&D Details Notes'],
    },
  ],
};
