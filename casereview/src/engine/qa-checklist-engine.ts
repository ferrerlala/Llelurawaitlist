// qa-checklist-engine: evaluates the configured annual QA checklist.
// Rules:
//  * A category is never "Complete" just because the narrative mentions it when the
//    checklist requires a separate form/record that was not supplied.
//  * Missing evidence is reported as Missing / Unable to Verify, never as Complete.
//  * The engine never certifies that a case passes QA.

import { evidenceOf, type FactIndex } from './facts.ts';
import { incompleteNames } from './names.ts';
import { FIL_DEFINITIONS } from '../config/cds-3-cm/mapping.ts';

export { incompleteNames };
import type {
  AdlComparisonRow, CdsRecordEntry, Discrepancy, DocumentType, EvidenceRef, Fact, QaCategoryDef, QaChecklist, QaResult, QaStatus,
  ReviewInput, SourceDocument,
} from './types.ts';

export interface QaContext {
  facts: FactIndex; // narrative + supporting docs (excluding CDS Record)
  allFacts: FactIndex;
  docs: SourceDocument[];
  cdsRecord: CdsRecordEntry[] | null;
  adl: AdlComparisonRow[];
  discrepancies: Discrepancy[];
  input: ReviewInput;
}

interface EvalOut {
  status: QaStatus;
  evidenceFound: EvidenceRef[];
  evidenceMissing: string[];
  recommendedCorrection: string;
  notes?: string;
}

type Evaluator = (ctx: QaContext, cat: QaCategoryDef) => EvalOut;

const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const ZIP = /\b\d{5}(?:-\d{4})?\b/;
const NONE_AVAILABLE = /none available/i;

const ev = (facts: Fact[]) => facts.map(evidenceOf);
const hasDoc = (ctx: QaContext, type: DocumentType) => ctx.docs.some((d) => d.type === type);
const docEvidence = (ctx: QaContext, type: DocumentType): EvidenceRef[] =>
  ctx.docs.filter((d) => d.type === type).map((d) => ({
    text: `${type} supplied: ${d.name}`,
    location: { docId: d.id, docName: d.name, docType: d.type, line: null, section: null },
  }));
const cdsEntries = (ctx: QaContext, re: RegExp) => (ctx.cdsRecord ?? []).filter((e) => re.test(e.label));
const cdsEvidence = (ctx: QaContext, entries: CdsRecordEntry[]): EvidenceRef[] =>
  entries.map((e) => {
    const d = ctx.docs.find((x) => x.id === e.docId);
    return { text: `${e.label}: ${e.value}`, location: d ? { docId: d.id, docName: d.name, docType: d.type, line: e.line, section: null } : null };
  });

function businessDaysBetween(a: Date, b: Date): number {
  let count = 0;
  const d = new Date(a);
  while (d < b) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
const HELP_STATUSES = ['Needs Assistance', 'Dependent', 'Assistance Provided'];
const UNKNOWN_STATUSES = ['Not Documented', 'Conflicting', 'Mentioned - Level Not Stated'];

/** Is the documented FIL tier possible given the ADL/IADL deficits the narrative documents? */
export function filConsistency(ctx: QaContext) {
  const code = ctx.facts.first('risk.fil_code')?.value?.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const tierDigit = code?.match(/^([1-4])/)?.[1];
  if (!code || !tierDigit) return null;
  const tier = FIL_DEFINITIONS.tiers.find((t) => t.tier === tierDigit);
  if (!tier) return null;
  const rows = (ids: readonly string[]) => ctx.adl.filter((r) => ids.includes(r.areaId));
  const adl = rows(FIL_DEFINITIONS.adlAreas);
  const iadl = rows(FIL_DEFINITIONS.iadlAreas);
  const count = (list: typeof adl, statuses: string[]) => list.filter((r) => statuses.includes(r.narrativeStatus));
  const adlMin = count(adl, HELP_STATUSES).length;
  const adlMax = adlMin + count(adl, UNKNOWN_STATUSES).length;
  const iadlMin = count(iadl, HELP_STATUSES).length;
  const iadlMax = iadlMin + count(iadl, UNKNOWN_STATUSES).length;
  const overlaps = (lo: number, hi: number, a: number, b: number) => lo <= b && hi >= a;
  let consistent: boolean;
  switch (tier.tier) {
    case '1': consistent = adlMax >= 4; break;
    case '2': consistent = overlaps(adlMin, adlMax, 2, 3); break;
    case '3': consistent = overlaps(adlMin, adlMax, 1, 1) || (adlMin <= 1 && iadlMax >= 6); break;
    default: consistent = adlMin === 0 && overlaps(iadlMin, iadlMax, 4, 5);
  }
  const fmt = (list: typeof adl) => list.map((r) => `${r.label}: ${r.narrativeStatus}`).join('; ');
  return {
    code, consistent, requirement: tier.text, adlMin, adlMax, iadlMin, iadlMax,
    detail: `ADLs — ${fmt(adl)}. IADLs — ${fmt(iadl)}.`,
    evidence: [...new Map([...count(adl, HELP_STATUSES), ...count(iadl, HELP_STATUSES)].flatMap((r) => r.evidence.filter((e) => e.factId).slice(0, 1)).map((e) => [e.text, e])).values()],
  };
}

const evaluators: Record<string, Evaluator> = {
  contactInfo(ctx) {
    const review = ctx.facts.get('contacts.emergency_contacts');
    const primary = ctx.facts.get('contacts.primary_emergency_contact');
    const alt = ctx.facts.get('contacts.alternate_emergency_contact');
    const hcp = ctx.facts.get('contacts.health_care_proxy');
    const pcp = ctx.facts.get('medical.pcp_info');
    const missing: string[] = [];
    const pv = primary.map((f) => f.value).join(' ');
    const av = alt.map((f) => f.value).join(' ');
    const pcpv = pcp.map((f) => f.value).join(' ');
    if (!primary.length) missing.push('Primary emergency contact full name');
    if (!PHONE.test(pv)) missing.push('Primary emergency contact phone number');
    if (!ZIP.test(pv)) missing.push('Full address and ZIP code');
    if (!alt.length) missing.push('Alternate emergency contact full name (or "None Available")');
    if (!(PHONE.test(av) || NONE_AVAILABLE.test(av))) missing.push('Alternate emergency contact phone number or "None Available"');
    if (!hcp.length) missing.push('Healthcare Proxy information or "None Available"');
    if (!PHONE.test(pcpv)) missing.push('PCP phone number');
    if (!pcp.length) missing.push('PCP address and town (when available)');
    const found = ev([...review, ...primary, ...alt, ...hcp, ...pcp]);
    if (!missing.length) return { status: 'Needs Review', evidenceFound: found, evidenceMissing: [], recommendedCorrection: 'Confirm the documented contacts match the WellSky contact records.' };
    return {
      status: review.length ? 'Unable to Verify' : 'Missing',
      evidenceFound: found,
      evidenceMissing: missing,
      recommendedCorrection: review.length
        ? 'Narrative states contacts were reviewed but the required contact details are not in the submitted documentation. Verify each element in the WellSky contact records and complete any missing entries.'
        : 'Document review of emergency contacts and verify each required contact element in WellSky.',
    };
  },

  visits(ctx, cat) {
    const date = ctx.facts.get('basic.assessment_date');
    const attempts = ctx.facts.get('visits.attempts');
    const min = Number(cat.params?.minimumAttempts ?? 2);
    const found = ev([...date, ...ctx.facts.get('visits.rd_ra'), ...attempts]);
    const missing = ['Program schedule / month the RD or RA was due', 'WellSky visit history'];
    if (!date.length && !ctx.input.assessmentDate) {
      if (attempts.length < min) missing.unshift(`At least ${min} documented attempts during the month due, or a supporting reason`);
      return { status: 'Missing', evidenceFound: found, evidenceMissing: missing, recommendedCorrection: 'Document the visit date, or the attempts made during the month due and the reason the visit was not completed.' };
    }
    return {
      status: 'Unable to Verify', evidenceFound: found, evidenceMissing: missing,
      recommendedCorrection: 'Visit date is documented. Confirm in WellSky that the visit occurred during the month due under the program schedule.',
      notes: ctx.input.assessmentDate ? `Assessment date entered for this review: ${ctx.input.assessmentDate}.` : undefined,
    };
  },

  activities(ctx) {
    return {
      status: 'Unable to Verify', evidenceFound: ev(ctx.facts.get('followup.referrals')),
      evidenceMissing: ['One full year of Activities and Referrals in WellSky', 'Confirmation the case has been open ≥ 1 year (if applicable)'],
      recommendedCorrection: 'Review the WellSky Activities and Referrals record for the past year; this cannot be verified from a narrative alone.',
    };
  },

  financialConsent(ctx) {
    if (ctx.input.assessmentType === 'Six-Month Reassessment') return { status: 'Not Applicable', evidenceFound: [], evidenceMissing: [], recommendedCorrection: 'The Financial Worksheet and Applicant Consent is reviewed at the Annual Redetermination, not at the six-month reassessment.' };
    const annual = ctx.input.assessmentType === 'Annual Redetermination';
    const ws = ctx.facts.get('financial.worksheet');
    const acd = ctx.facts.get('consent.applicant_consent');
    const wsDoc = hasDoc(ctx, 'Financial Worksheet');
    const acdDoc = hasDoc(ctx, 'Applicant Consent and Disclosure');
    const found = [...ev(ws), ...ev(acd), ...docEvidence(ctx, 'Financial Worksheet'), ...docEvidence(ctx, 'Applicant Consent and Disclosure')];
    const missing: string[] = [];
    if (!ws.length && !wsDoc) missing.push('Financial Worksheet completion (not mentioned in narrative; document not supplied)');
    else if (!wsDoc) missing.push('Financial Worksheet document (narrative mention only)');
    if (!acd.length && !acdDoc) missing.push('Applicant Consent and Disclosure (not mentioned; document not supplied)');
    else if (!acdDoc) missing.push('Signed Applicant Consent and Disclosure form (narrative mention only)');
    if (!annual && !ws.length && !wsDoc && !acd.length) {
      return { status: 'Not Applicable', evidenceFound: found, evidenceMissing: [], recommendedCorrection: 'Financial Worksheet requirement applies at Annual Redetermination. Confirm the assessment type.' };
    }
    if (ws.some((f) => f.assertion === 'not_completed') || acd.some((f) => f.assertion === 'not_completed')) {
      return { status: 'Missing', evidenceFound: found, evidenceMissing: missing, recommendedCorrection: 'Documentation states a required financial/consent document was not completed. Complete it before closing the review.' };
    }
    if (!ws.length && !wsDoc) {
      return { status: 'Missing', evidenceFound: found, evidenceMissing: missing, recommendedCorrection: 'The narrative does not document Financial Worksheet completion. Verify the Financial Worksheet was completed at the Annual Redetermination and is in the file; document its completion.' };
    }
    if (missing.length) return { status: 'Needs Review', evidenceFound: found, evidenceMissing: missing, recommendedCorrection: 'Confirm both documents are completed and present in the file.' };
    return { status: 'Complete', evidenceFound: found, evidenceMissing: [], recommendedCorrection: 'None identified. Reviewer confirmation required.' };
  },

  copay(ctx) {
    if (ctx.input.assessmentType === 'Six-Month Reassessment') return { status: 'Not Applicable', evidenceFound: [], evidenceMissing: [], recommendedCorrection: 'The copay is reviewed at the Annual Redetermination, not at the six-month reassessment.' };
    const copays = ctx.allFacts.get('financial.copay');
    const bySource = (t: DocumentType) => copays.filter((f) => f.location.docType === t);
    const narrative = bySource('Narrative / Journal Note');
    const ws = bySource('Financial Worksheet');
    const acd = bySource('Applicant Consent and Disclosure');
    const conflict = ctx.discrepancies.find((d) => d.key === 'financial.copay');
    const missing: string[] = [];
    if (!narrative.length) missing.push('Narrative copay');
    if (!ws.length) missing.push('Financial Worksheet copay (document not supplied or no copay found)');
    if (!acd.length) missing.push('Applicant Consent and Disclosure copay (document not supplied or no copay found)');
    if (conflict) {
      return {
        status: 'Mismatch', evidenceFound: ev(copays), evidenceMissing: missing,
        recommendedCorrection: `Copay values differ (${conflict.values.map((v) => `${v.value} in ${v.evidence.location?.docName}`).join('; ')}). Verify the correct copay from the approved financial determination and correct the inconsistent document(s). The system has not chosen a value.`,
      };
    }
    if (!narrative.length && !ws.length && !acd.length) return { status: 'Missing', evidenceFound: [], evidenceMissing: missing, recommendedCorrection: 'No copay documented. Document the copay in the narrative and verify it against the Financial Worksheet and Applicant Consent and Disclosure.' };
    if (missing.length) return { status: 'Unable to Verify', evidenceFound: ev(copays), evidenceMissing: missing, recommendedCorrection: 'Compare the narrative copay with the Financial Worksheet and the Applicant Consent and Disclosure copay.' };
    return { status: 'Complete', evidenceFound: ev(copays), evidenceMissing: [], recommendedCorrection: 'Copay consistent across supplied documents. Reviewer confirmation required.' };
  },

  goals(ctx) {
    const goals = [...ctx.facts.get('goals.new'), ...ctx.facts.get('goals.existing')];
    const cdsGoals = cdsEntries(ctx, /goal/i);
    const found = [...ev(goals), ...cdsEvidence(ctx, cdsGoals)];
    if (!goals.length) return { status: 'Missing', evidenceFound: found, evidenceMissing: ['Consumer goals in the narrative'], recommendedCorrection: 'Document existing and new person-centered goals in the narrative.' };
    const noneIdentified = goals.every((g) => g.assertion === 'reported_absent');
    if (!ctx.cdsRecord) {
      return {
        status: 'Needs Review', evidenceFound: found, evidenceMissing: ['CDS Consumer Goals section (CDS record not supplied)'],
        recommendedCorrection: noneIdentified
          ? 'The narrative states no person-centered goals were identified. Confirm the CDS Consumer Goals section is completed consistently with this, and consider documenting the consumer\'s preferences or reason no goals were set.'
          : 'Verify the CDS Consumer Goals section is complete and matches the narrative goals.',
      };
    }
    if (!cdsGoals.length) return { status: 'Missing', evidenceFound: found, evidenceMissing: ['Consumer Goals in the supplied CDS record'], recommendedCorrection: 'Complete Consumer Goals in the CDS.' };
    return { status: 'Needs Review', evidenceFound: found, evidenceMissing: [], recommendedCorrection: 'Compare the CDS goals with the narrative goals shown here; confirm they match.' };
  },

  mls(ctx) {
    if (ctx.input.assessmentType === 'Six-Month Reassessment') return { status: 'Not Applicable', evidenceFound: [], evidenceMissing: [], recommendedCorrection: 'The MLS is reviewed at the Annual Redetermination, not at the six-month reassessment.' };
    const mls = ctx.facts.get('mls.status');
    const cdsMls = cdsEntries(ctx, /\bmls\b/i);
    const found = [...ev(mls), ...cdsEvidence(ctx, cdsMls)];
    if (!mls.length && !cdsMls.length) {
      return {
        status: 'Missing', evidenceFound: [], evidenceMissing: ['MLS completion, date and status in the narrative', 'CDS MLS section date/status'],
        recommendedCorrection: 'MLS documentation is not present in the submitted documentation. Verify MLS was completed for this annual review, document the date/status and any follow-up, and confirm the CDS MLS date aligns with the assessment date when required.',
      };
    }
    if (!cdsMls.length) return { status: 'Needs Review', evidenceFound: found, evidenceMissing: ['CDS MLS section date and status'], recommendedCorrection: 'Confirm the CDS MLS section date and status match the narrative.' };
    if (!mls.length) return { status: 'Missing', evidenceFound: found, evidenceMissing: ['MLS documentation in the narrative'], recommendedCorrection: 'CDS shows MLS information but the narrative does not document it. Add MLS status and follow-up to the narrative.' };
    return { status: 'Needs Review', evidenceFound: found, evidenceMissing: [], recommendedCorrection: 'Compare CDS MLS date/status with the narrative and the assessment date.' };
  },

  narrativeCds(ctx, cat) {
    const threshold = Number(cat.params?.discrepancyThreshold ?? 3);
    const focus = String(cat.params?.focusAreas ?? '').split(',').filter(Boolean);
    const focusRows = ctx.adl.filter((r) => focus.includes(r.areaId));
    const focusNote = focusRows.map((r) => `${r.label}: ${r.narrativeStatus}`).join('; ');
    if (!ctx.cdsRecord) {
      return {
        status: 'Unable to Verify', evidenceFound: [], evidenceMissing: ['CDS responses were not supplied — the CDS cannot be declared complete or consistent'],
        recommendedCorrection: 'Supply the CDS record (or compare in WellSky) to check narrative/CDS consistency. Focus areas in the narrative: ' + focusNote,
        notes: `Guideline threshold: ${threshold} or fewer discrepancies/omissions (review aid, not a pass).`,
      };
    }
    const counted = ctx.adl.filter((r) => r.result === 'Mismatch' || r.result === 'Missing in CDS' || r.result === 'Missing in Narrative' || (r.result === 'Needs Verification' && r.narrativeStatus === 'Not Documented'));
    const mismatches = ctx.adl.filter((r) => r.result === 'Mismatch');
    const evidence = counted.flatMap((r) => r.evidence.slice(0, 2));
    const list = counted.map((r) => `${r.label} (${r.result})`);
    const over = counted.length > threshold;
    return {
      status: mismatches.length || over ? 'Mismatch' : 'Needs Review',
      evidenceFound: evidence,
      evidenceMissing: list,
      recommendedCorrection: `${counted.length} discrepancy/omission(s) found${over ? `, above the guideline of ${threshold}` : `, within the guideline of ${threshold} (this is not a pass)`}. Resolve each item in the ADL/IADL comparison. Focus areas: ${focusNote}.`,
    };
  },

  fil(ctx, cat) {
    const facts = [...ctx.facts.get('risk.fil_code'), ...ctx.facts.get('eligibility.fil')];
    const cdsFil = cdsEntries(ctx, /\bfil\b/i);
    const found = [...ev(facts), ...cdsEvidence(ctx, cdsFil)];
    const approved = cat.params?.approvedFormulaConfigured === true;
    if (!facts.length && !cdsFil.length) return { status: 'Missing', evidenceFound: [], evidenceMissing: ['FIL documentation'], recommendedCorrection: 'Document the FIL and verify the CDS FIL calculation.' };
    const conflict = ctx.discrepancies.find((d) => d.key === 'risk.fil_code');
    if (conflict) return { status: 'Mismatch', evidenceFound: found, evidenceMissing: [], recommendedCorrection: 'FIL values differ between documents. Verify the CDS FIL calculation; the system has not chosen a value.' };

    // Consistency check against the instrument's FIL definitions (not a calculation).
    const check = filConsistency(ctx);
    const missing = [approved ? 'Verified FIL inputs' : 'No approved FIL calculation is configured — the system does not calculate FIL or certify eligibility', 'CDS FIL calculation', 'Whether a critical need is unmet (C vs. NC)'];
    if (check && !check.consistent) {
      return {
        status: 'Mismatch', evidenceFound: [...found, ...check.evidence], evidenceMissing: missing,
        recommendedCorrection: `Documented FIL ${check.code} requires ${check.requirement}. The narrative documents ${check.adlMin} ADL deficit(s) (at most ${check.adlMax} if every undocumented or conflicting ADL needed help) and ${range(check.iadlMin, check.iadlMax)} IADL deficit(s). Either the FIL or the functional documentation needs correction. Verify the ADLs in the CDS and the FIL calculation. (${FIL_DEFINITIONS.source})`,
        notes: check.detail,
      };
    }
    return {
      status: 'Unable to Verify', evidenceFound: [...found, ...(check?.evidence ?? [])], evidenceMissing: missing,
      recommendedCorrection: check
        ? `Documented FIL ${check.code} (${check.requirement}) is possible given the narrative (${range(check.adlMin, check.adlMax)} ADL and ${range(check.iadlMin, check.iadlMax)} IADL deficits). Verify the FIL calculation in the CDS. Eligibility statements in the narrative are not verification.`
        : 'Verify the FIL calculation in the CDS and that supporting functional information demonstrates Home Care eligibility. Eligibility statements in the narrative are not verification.',
      notes: check?.detail,
    };
  },

  fallRisk(ctx) {
    const falls = ctx.facts.get('medical.falls');
    const cdsFalls = cdsEntries(ctx, /\bk5\b|fall/i);
    const found = [...ev(falls), ...cdsEvidence(ctx, cdsFalls)];
    const reported = falls.some((f) => f.assertion === 'affirmed');
    const procedure = ctx.facts.facts.some((f) => /falls? procedure|fall report/i.test(f.sourceText));
    if (!falls.length && !cdsFalls.length) return { status: 'Missing', evidenceFound: [], evidenceMissing: ['Fall history / fall risk documentation', 'CDS K5 and fall questions'], recommendedCorrection: 'Document fall history and fall risk, and complete the CDS K5 fall questions.' };
    if (reported && !procedure) return { status: 'Missing', evidenceFound: found, evidenceMissing: ['Falls Procedure follow-up for the reported fall'], recommendedCorrection: 'A fall is reported. Document that the Falls Procedure was followed.' };
    return {
      status: 'Needs Review', evidenceFound: found,
      evidenceMissing: cdsFalls.length ? [] : ['CDS K5 and corresponding fall questions (CDS not supplied)'],
      recommendedCorrection: reported ? 'Verify the Falls Procedure documentation and CDS K5.' : '"No falls reported" is documented, but fall-risk screening still requires verification: confirm CDS K5 and the corresponding fall questions were completed.',
    };
  },

  riskWorksheet(ctx) {
    const level = ctx.allFacts.get('risk.level');
    const narrativeLevel = level.filter((f) => f.location.docType !== 'Risk Worksheet');
    const wsDoc = hasDoc(ctx, 'Risk Worksheet');
    const conflict = ctx.discrepancies.find((d) => d.key === 'risk.level');
    const altId = ctx.allFacts.facts.some((f) => /altid2/i.test(f.sourceText));
    const found = [...ev(level), ...ev(ctx.facts.get('risk.factors_change')), ...ev(ctx.facts.get('risk.fil_code')), ...docEvidence(ctx, 'Risk Worksheet')];
    if (conflict) return { status: 'Mismatch', evidenceFound: found, evidenceMissing: [], recommendedCorrection: `Risk level differs (${conflict.values.map((v) => `${v.value} in ${v.evidence.location?.docName}`).join('; ')}). Verify against the Risk Worksheet and AltID2 and correct the inconsistent record.` };
    if (!narrativeLevel.length && !wsDoc) return { status: 'Missing', evidenceFound: found, evidenceMissing: ['Risk level in narrative', 'Risk Worksheet'], recommendedCorrection: 'Document the risk level and confirm the Risk Worksheet is completed.' };
    const missing = [];
    if (!wsDoc) missing.push('Risk Worksheet (not supplied) and its review date');
    if (!altId) missing.push('AltID2 value');
    return {
      status: wsDoc && altId ? 'Needs Review' : 'Unable to Verify', evidenceFound: found, evidenceMissing: missing,
      recommendedCorrection: 'Compare the narrative risk level and FIL with the Risk Worksheet and AltID2; confirm the worksheet review date is current and updated after any status change.',
    };
  },

  timeliness(ctx, cat) {
    const days = Number(cat.params?.businessDays ?? 5);
    const dateFact = ctx.facts.first('basic.assessment_date');
    const assessDate = dateFact?.normalized.date ?? (ctx.input.assessmentDate || undefined);
    const dated = ctx.facts.facts.filter((f) => f.normalized.date && f.key !== 'basic.assessment_date');
    const found = ev([...(dateFact ? [dateFact] : []), ...dated]);
    const notes: string[] = [];
    if (assessDate) {
      const a = new Date(assessDate + 'T00:00:00');
      for (const f of dated) {
        const b = new Date(f.normalized.date + 'T00:00:00');
        if (b >= a) {
          const bd = businessDaysBetween(a, b);
          notes.push(`${f.label}: ${f.normalized.date} (${bd} business day(s) after assessment)${bd > days ? ' — exceeds checklist timeframe' : ''}`);
        }
      }
    }
    return {
      status: assessDate ? 'Needs Review' : 'Missing', evidenceFound: found,
      evidenceMissing: ['WellSky A&D completion date'],
      recommendedCorrection: `Verify that A&D documentation was completed within ${days} business days of the assessment per applicable policy.`,
      notes: notes.join(' | ') || undefined,
    };
  },

  carePlan(ctx) {
    const services = [...ctx.facts.byPrefix('services.')];
    const needs = ctx.facts.get('goals.identified_needs');
    const helpAreas = ctx.adl.filter((r) => ['Needs Assistance', 'Dependent', 'Assistance Provided'].includes(r.narrativeStatus)).map((r) => r.label);
    return {
      status: 'Needs Review', evidenceFound: ev([...services.slice(0, 6), ...needs]),
      evidenceMissing: ['Care Plan record', 'Program record'],
      recommendedCorrection: `Confirm the program selection and that the Care Plan addresses identified needs${needs.length ? ` (${needs.map((n) => n.value).join('; ')})` : ''}${helpAreas.length ? ` and documented assistance areas (${helpAreas.join(', ')})` : ''}.`,
    };
  },

  suspension(ctx) {
    const s = ctx.facts.get('suspension.info');
    const rec = hasDoc(ctx, 'Service Suspension Record');
    if (!s.length && !rec) {
      return {
        status: 'Unable to Verify', evidenceFound: [], evidenceMissing: ['Confirmation that no Service Suspension record exists'],
        recommendedCorrection: 'No suspension is documented. Confirm in WellSky that no Service Suspension record exists; if none, the reviewer may mark this Not Applicable.',
      };
    }
    const monthly = s.some((f) => /monthly|each month/i.test(f.sourceText));
    return {
      status: rec && monthly ? 'Needs Review' : 'Unable to Verify', evidenceFound: [...ev(s), ...docEvidence(ctx, 'Service Suspension Record')],
      evidenceMissing: [...(rec ? [] : ['Service Suspension record']), ...(monthly ? [] : ['Monthly follow-up documentation'])],
      recommendedCorrection: 'Confirm journal suspension information matches the Service Suspension record and monthly follow-up is documented (nutrition suspension requirement only where applicable).',
    };
  },

  timelyFollowUp(ctx) {
    const requests = [...ctx.facts.get('medical.pcp_change_request'), ...ctx.facts.get('goals.identified_needs')];
    const actions = ctx.facts.get('followup.action').filter((a) => a.assertion !== 'reported_absent');
    const overdue = ctx.facts.get('financial.overdue_balance').filter((f) => (f.normalized.amount ?? 0) > 0);
    const missing: string[] = [];
    if (requests.length && !actions.length) missing.push('Follow-up action for consumer request(s)');
    if (overdue.length && !actions.some((a) => /copay|balance/i.test(a.value))) missing.push('Outstanding copay/balance follow-up');
    if (actions.length) missing.push('Documentation that pending follow-up was completed');
    return {
      status: missing.some((x) => !x.startsWith('Documentation that')) ? 'Missing' : 'Needs Review', evidenceFound: ev([...requests, ...actions, ...overdue, ...ctx.facts.get('followup.action').filter((a) => a.assertion === 'reported_absent')]), evidenceMissing: missing,
      recommendedCorrection: actions.length
        ? `Follow-up is planned (${actions.map((a) => a.value).join('; ')}). Document completion with dates.`
        : ctx.facts.get('followup.action').some((a) => a.assertion === 'reported_absent')
          ? 'The narrative states no follow-up actions were identified. Confirm there are no open consumer, family, vendor or Help Desk requests, status changes or copay follow-up in the journal.'
          : 'Document follow-up for consumer, family, vendor and Help Desk requests and status changes.',
    };
  },

  idc(ctx) {
    const idc = ctx.facts.get('followup.idc');
    if (!idc.length) {
      return { status: 'Missing', evidenceFound: [], evidenceMissing: ['Interdisciplinary conference documentation with full participant names'], recommendedCorrection: 'Document the interdisciplinary conference held for this event (e.g. RD) with the full names of all participants.' };
    }
    if (idc.every((f) => f.assertion === 'reported_absent')) {
      return {
        status: 'Needs Review', evidenceFound: ev(idc), evidenceMissing: ['Confirmation that no interdisciplinary conference was required for this event'],
        recommendedCorrection: 'The narrative states no IDC was indicated. Confirm no IDC was required for this event (RD/RA, service increase, status change, waiver, etc.); if one was held, document it with full participant names.',
      };
    }
    const partial = idc.filter((f) => f.assertion !== 'reported_absent').flatMap((f) => incompleteNames(f.value));
    if (partial.length) {
      return {
        status: 'Missing', evidenceFound: ev(idc), evidenceMissing: partial.map((n) => `Full name of participant: "${n}"`),
        recommendedCorrection: 'Interdisciplinary conference is documented but a participant\'s full name is missing. Add the participant\'s full name (first and last) to the journal note. Do not guess the name.',
      };
    }
    return { status: 'Complete', evidenceFound: ev(idc), evidenceMissing: [], recommendedCorrection: 'None identified. Reviewer confirmation required.' };
  },

  emergencyPermission(ctx) {
    if (ctx.input.assessmentType === 'Six-Month Reassessment') return { status: 'Not Applicable', evidenceFound: [], evidenceMissing: [], recommendedCorrection: 'Permission to Contact Emergency Services is reviewed at the Annual Redetermination, not at the six-month reassessment.' };
    const p = ctx.facts.get('consent.emergency_services_permission');
    const acdDoc = hasDoc(ctx, 'Applicant Consent and Disclosure');
    const notes = ctx.allFacts.facts.some((f) => /a&d (details )?notes?/i.test(f.sourceText));
    if (!p.length) return { status: 'Missing', evidenceFound: docEvidence(ctx, 'Applicant Consent and Disclosure'), evidenceMissing: ['Permission to contact emergency services', 'A&D Details Notes entry'], recommendedCorrection: 'Document permission to contact emergency services and record it in the A&D Details Notes.' };
    if (p.some((f) => f.assertion === 'not_completed')) return { status: 'Missing', evidenceFound: ev(p), evidenceMissing: ['Signed permission'], recommendedCorrection: 'Permission is documented as not obtained; follow agency procedure.' };
    const missing = [...(acdDoc ? [] : ['Signed Applicant Consent and Disclosure form showing the permission']), ...(notes ? [] : ['Corresponding entry in the A&D Details page Notes section'])];
    return {
      status: 'Needs Review', evidenceFound: [...ev(p), ...docEvidence(ctx, 'Applicant Consent and Disclosure')], evidenceMissing: missing,
      recommendedCorrection: 'Narrative reports the permission was signed. Verify the actual form and the A&D Details Notes entry.',
    };
  },
};

export const EVALUATOR_IDS = Object.keys(evaluators);

const RECORD_DOC_TYPES: Record<string, DocumentType> = {
  'Financial Worksheet': 'Financial Worksheet',
  'Applicant Consent and Disclosure': 'Applicant Consent and Disclosure',
  'Risk Worksheet': 'Risk Worksheet',
  'Service Suspension record': 'Service Suspension Record',
  'CDS record': 'CDS Record',
};

export function runQaChecklist(checklist: QaChecklist, ctx: QaContext): QaResult[] {
  return checklist.categories
    .filter((c) => c.enabled)
    .sort((a, b) => a.number - b.number)
    .map((cat) => {
      const fn = evaluators[cat.evaluator];
      let out: EvalOut = fn
        ? fn(ctx, cat)
        : { status: 'Unable to Verify', evidenceFound: [], evidenceMissing: ['No evaluator configured'], recommendedCorrection: `No automated evaluator "${cat.evaluator}" exists; review manually.` };
      // Guard: never Complete without the separate records the checklist requires.
      if (out.status === 'Complete' && cat.requiredRecords.length) {
        const unsupplied = cat.requiredRecords.filter((r) => {
          const t = RECORD_DOC_TYPES[r];
          return !t || !ctx.docs.some((d) => d.type === t);
        });
        if (unsupplied.length) out = { ...out, status: 'Needs Review', evidenceMissing: [...out.evidenceMissing, ...unsupplied.map((r) => `${r} (separate record required)`)] };
      }
      const sourceDocuments = [...new Set(out.evidenceFound.map((e) => e.location?.docName).filter((x): x is string => !!x))];
      return {
        categoryId: cat.id, number: cat.number, title: cat.title, requirements: cat.requirements,
        evidenceFound: out.evidenceFound, evidenceMissing: out.evidenceMissing, status: out.status,
        recommendedCorrection: out.recommendedCorrection, sourceDocuments, notes: out.notes ?? '',
      };
    });
}
