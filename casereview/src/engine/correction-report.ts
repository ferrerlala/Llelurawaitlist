// Builds the prioritized correction report and the final review status.
// Suggested corrections never introduce new clinical or financial facts.

import { formatLocation } from './assessment-parser.ts';
import { evidenceOf, type FactIndex } from './facts.ts';
import type {
  AdlComparisonRow, CdsResponse, CorrectionIssue, Discrepancy, FinalReviewStatus, Priority, QaChecklist, QaResult, SourceDocument,
} from './types.ts';

const WHY: Record<string, string> = {
  contact_info: 'Complete emergency and PCP contact information is required to reach supports and providers in an emergency.',
  rd_ra_visits: 'Visits must occur in the month due under the program schedule; missed visits require documented attempts.',
  activities_referrals: 'Activities and Referrals must reflect a full year of case activity for annual review.',
  financial_consent: 'The Financial Worksheet and Applicant Consent and Disclosure are required program documents at Annual Redetermination.',
  copay: 'Copay must be consistent across the Financial Worksheet, Consent and Disclosure and narrative to avoid billing errors.',
  goals: 'Consumer goals in the CDS must reflect the person-centered goals in the narrative.',
  mls: 'MLS must be completed annually and documented consistently with the CDS.',
  narrative_cds: 'The narrative must support the CDS responses that drive eligibility and services.',
  fil: 'FIL supports Home Care eligibility; an inaccurate calculation affects eligibility.',
  fall_risk: 'Fall risk questions must be completed at RA/RD visits; reported falls require the Falls Procedure.',
  risk_worksheet: 'Risk level must agree across the Risk Worksheet, AltID2 and the narrative.',
  ra_rd_timeliness: 'A&D documentation has a required completion timeframe.',
  program_care_plan: 'The care plan and program must address documented needs.',
  suspension: 'Suspension information must match the Service Suspension record with monthly follow-up.',
  timely_followup: 'Requests and status changes require timely, documented follow-up.',
  idc: 'Interdisciplinary conferences must list the full names of participants.',
  emergency_permission: 'Permission to contact emergency services must be on the signed form and noted in A&D Details.',
};

function qaPriority(r: QaResult, checklist: QaChecklist): Priority | null {
  const cat = checklist.categories.find((c) => c.id === r.categoryId);
  switch (r.status) {
    case 'Mismatch': return 'High';
    case 'Missing': return cat?.priority ?? 'Medium';
    case 'Unable to Verify':
    case 'Needs Review': return 'Medium';
    default: return null;
  }
}

export function buildCorrectionReport(args: {
  qa: QaResult[];
  checklist: QaChecklist;
  adl: AdlComparisonRow[];
  cds: CdsResponse[];
  discrepancies: Discrepancy[];
  facts: FactIndex;
  docs: SourceDocument[];
  injectionWarnings: string[];
}): CorrectionIssue[] {
  const issues: CorrectionIssue[] = [];
  const push = (i: Omit<CorrectionIssue, 'id'>) => issues.push({ ...i, id: `i${issues.length + 1}` });

  // Cross-document conflicts (always High).
  for (const d of args.discrepancies) {
    push({
      priority: 'High',
      title: `Conflicting ${d.topic.toLowerCase()}`,
      problem: `${d.topic} values disagree: ${d.values.map((v) => `"${v.value}" (${formatLocation(v.evidence.location)})`).join(' vs. ')}.`,
      whyItMatters: /copay|income|balance|masshealth/i.test(d.topic)
        ? 'Conflicting financial information can cause billing and eligibility errors.'
        : /risk|fil/i.test(d.topic) ? 'Risk and FIL discrepancies affect service planning and eligibility.' : 'Inconsistent documentation undermines the record.',
      where: [...new Set(d.values.map((v) => v.evidence.location?.docName))].join(', '),
      verify: `Verify the correct ${d.topic.toLowerCase()} from the authoritative source record.`,
      suggestedCorrection: 'Correct the inconsistent document(s) after verification. The system has not chosen a value.',
      source: 'Discrepancy',
      evidence: d.values.map((v) => v.evidence),
    });
  }

  // QA categories.
  for (const r of args.qa) {
    const priority = qaPriority(r, args.checklist);
    if (!priority) continue;
    if (r.categoryId === 'copay' && r.status === 'Mismatch' && args.discrepancies.some((d) => d.key === 'financial.copay')) continue;
    push({
      priority,
      title: `QA ${r.number}. ${r.title}: ${r.status}`,
      problem: r.evidenceMissing.length ? `Not found or not verifiable: ${r.evidenceMissing.join('; ')}.` : r.recommendedCorrection,
      whyItMatters: WHY[r.categoryId] ?? 'Required by the annual QA checklist.',
      where: r.sourceDocuments.length ? r.sourceDocuments.join(', ') : 'Not found in submitted documentation',
      verify: r.recommendedCorrection,
      suggestedCorrection: r.status === 'Mismatch' ? 'Correct the inconsistent entry after verifying the source record.' : 'Add the verified information to the record. Do not add information that has not been verified.',
      source: 'QA',
      evidence: r.evidenceFound,
    });
  }

  // ADL / IADL.
  for (const row of args.adl.filter((r) => r.result === 'Mismatch')) {
    push({
      priority: 'High',
      title: `Conflicting ${row.label} documentation`,
      problem: row.explanation,
      whyItMatters: 'Conflicting ADL/IADL responses affect FIL, eligibility and the care plan.',
      where: [...new Set(row.evidence.map((e) => e.location?.docName))].join(', '),
      verify: `Confirm the consumer's actual level of ${row.label.toLowerCase()} with the consumer/caregiver.`,
      suggestedCorrection: 'Correct the narrative or the CDS so both reflect the verified level.',
      source: 'ADL/IADL',
      evidence: row.evidence,
    });
  }
  const undocumented = args.adl.filter((r) => r.narrativeStatus === 'Not Documented' && r.type !== 'Support');
  if (undocumented.length) {
    push({
      priority: 'Medium',
      title: 'Functional areas not documented in the narrative',
      problem: `No narrative statement for: ${undocumented.map((r) => r.label).join(', ')}.`,
      whyItMatters: 'Undocumented activities cannot be assumed independent; the CDS response must be supported by the narrative.',
      where: 'Narrative / Journal Note',
      verify: 'Assess and document each listed activity, including the level of assistance and who provides it.',
      suggestedCorrection: 'Add a statement for each activity based on the assessment. Do not mark undocumented activities as independent.',
      source: 'ADL/IADL',
      evidence: [],
    });
  }
  const partial = args.adl.filter((r) => r.narrativeStatus === 'Assistance Provided' || r.narrativeStatus === 'Mentioned - Level Not Stated' || r.narrativeStatus === 'Conflicting');
  if (partial.length) {
    push({
      priority: 'Medium',
      title: 'Functional areas mentioned without a clear level of assistance',
      problem: partial.map((r) => `${r.label}: ${r.narrativeStatus}${r.narrativeDetail ? ` (${r.narrativeDetail})` : ''}`).join('; '),
      whyItMatters: 'The CDS requires a level of independence; a support being mentioned does not establish it.',
      where: 'Narrative / Journal Note',
      verify: "Confirm the consumer's level of independence for each activity.",
      suggestedCorrection: 'Clarify the level of assistance in the narrative.',
      source: 'ADL/IADL',
      evidence: partial.flatMap((r) => r.evidence),
    });
  }
  const missingInCds = args.adl.filter((r) => r.result === 'Missing in CDS');
  if (missingInCds.length) {
    push({
      priority: 'Medium',
      title: 'Functional areas documented in narrative but not in CDS',
      problem: missingInCds.map((r) => `${r.label} (narrative: ${r.narrativeStatus})`).join('; '),
      whyItMatters: 'CDS omissions count toward the narrative/CDS discrepancy threshold.',
      where: 'CDS Record',
      verify: 'Confirm and complete the CDS responses.',
      suggestedCorrection: 'Enter the verified level in the CDS.',
      source: 'ADL/IADL',
      evidence: missingInCds.flatMap((r) => r.evidence),
    });
  }

  // CDS fields not documented (non-functional).
  const notDoc = args.cds.filter((c) => c.status === 'Not Documented' && !c.fieldId.startsWith('fn_'));
  if (notDoc.length) {
    push({
      priority: 'Medium',
      title: 'Assessment details not documented',
      problem: `No supporting documentation for: ${notDoc.map((c) => c.label).join(', ')}.`,
      whyItMatters: 'These CDS-related fields cannot be prepared from the narrative and must not be entered as "No".',
      where: 'Narrative / Journal Note',
      verify: 'Obtain the information from the consumer or the appropriate record.',
      suggestedCorrection: 'Document the verified information.',
      source: 'CDS',
      evidence: [],
    });
  }

  // Low priority documentation quality.
  const twoDigit = args.facts.facts.filter((f) => /\b\d{1,2}\/\d{1,2}\/\d{2}\b/.test(f.sourceText));
  if (twoDigit.length) {
    push({
      priority: 'Low', title: 'Dates written with two-digit years', problem: `${twoDigit.length} statement(s) use two-digit years (e.g. "${twoDigit[0].sourceText}").`,
      whyItMatters: 'Four-digit years avoid ambiguity in the record.', where: twoDigit[0].location.docName,
      verify: 'Confirm the dates.', suggestedCorrection: 'Write dates as MM/DD/YYYY.', source: 'Documentation', evidence: twoDigit.slice(0, 3).map(evidenceOf),
    });
  }
  const vague = args.facts.get('services.informal_supports').filter((f) => /^family\b/i.test(f.value) && !/\b(daughter|son|niece|nephew|sister|brother|spouse|husband|wife)\b/i.test(f.value));
  if (vague.length) {
    push({
      priority: 'Low', title: 'Informal support description is incomplete', problem: `"${vague[0].sourceText}" does not identify who provides support or how often.`,
      whyItMatters: 'Specific informal support information supports care planning.', where: vague[0].location.docName,
      verify: 'Ask which family members provide support and how often.', suggestedCorrection: 'Name the family member(s), relationship and frequency of support, if known.',
      source: 'Documentation', evidence: vague.map(evidenceOf),
    });
  }
  const screening = args.facts.get('medical.memory_screening').filter((f) => f.assertion === 'declined' || f.assertion === 'not_completed');
  if (screening.length) {
    push({
      priority: 'Low', title: 'Memory screening not completed', problem: `${screening[0].value}.`,
      whyItMatters: 'A declined screening must not be recorded as completed; the record should note any plan to re-offer it.',
      where: screening[0].location.docName, verify: 'Confirm the screening was declined and whether it will be re-offered.',
      suggestedCorrection: 'Record the screening as declined/not completed in the CDS. Document any plan to re-offer.', source: 'Documentation', evidence: screening.map(evidenceOf),
    });
  }

  for (const w of args.injectionWarnings) {
    push({
      priority: 'Medium', title: 'Possible embedded instructions in a document', problem: w,
      whyItMatters: 'Document content is treated as data. Embedded instructions were ignored but may indicate a tampered or inappropriate document.',
      where: w.split(':')[0], verify: 'Review the source document.', suggestedCorrection: 'Remove non-clinical instruction text from the document.', source: 'Security', evidence: [],
    });
  }

  const order: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
  return issues.sort((a, b) => order[a.priority] - order[b.priority]).map((i, idx) => ({ ...i, id: `i${idx + 1}` }));
}

export function determineFinalStatus(args: {
  qa: QaResult[]; adl: AdlComparisonRow[]; discrepancies: Discrepancy[]; cds: CdsResponse[];
}): { status: FinalReviewStatus; reasons: string[] } {
  const reasons: string[] = [];
  const mismatches = args.qa.filter((q) => q.status === 'Mismatch').length + args.adl.filter((a) => a.result === 'Mismatch').length;
  if (args.discrepancies.length) reasons.push(`${args.discrepancies.length} conflicting value(s) between or within documents`);
  if (mismatches) reasons.push(`${mismatches} mismatch(es) in QA or ADL/IADL comparison`);
  if (reasons.length) return { status: 'Corrections Required', reasons };
  const missing = args.qa.filter((q) => q.status === 'Missing');
  if (missing.length) {
    return { status: 'Additional Documentation Required', reasons: [`Missing documentation in QA categories: ${missing.map((m) => `${m.number}. ${m.title}`).join('; ')}`] };
  }
  const verify = args.qa.filter((q) => q.status === 'Unable to Verify' || q.status === 'Needs Review').length + args.cds.filter((c) => c.status !== 'Ready for Review').length;
  if (verify) return { status: 'Human Verification Required', reasons: [`${verify} item(s) require human verification`] };
  return { status: 'Ready for Case Manager Review', reasons: ['No automated findings. Case manager review is still required; this is not a QA pass.'] };
}
