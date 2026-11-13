import type { Assertion, Confidence, DocumentType, RejectedFact, SourceDocument } from '@shared/extraction-contract.ts';
import type { FactCategory, FunctionalType } from '@shared/fact-catalog.ts';

export type { Assertion, Confidence, DocumentType, SourceDocument };

export interface SourceLocation {
  docId: string;
  docName: string;
  docType: DocumentType;
  line: number | null;
  section: string | null;
}

export interface Fact {
  id: string;
  key: string;
  category: FactCategory;
  label: string;
  value: string;
  detail: string;
  assertion: Assertion;
  sourceText: string;
  confidence: Confidence;
  location: SourceLocation;
  normalized: { amount?: number; date?: string; text?: string };
}

export type AssessmentType = 'Annual Redetermination' | 'Six-Month Reassessment' | 'Initial Assessment' | 'Other';
export const ASSESSMENT_TYPES: AssessmentType[] = ['Annual Redetermination', 'Six-Month Reassessment', 'Initial Assessment', 'Other'];

export interface ReviewInput {
  caseIdentifier: string;
  assessmentType: AssessmentType;
  assessmentDate: string;
  program: string;
  documents: SourceDocument[];
}

// ---------- CDS preparation ----------
export type CdsStatus = 'Ready for Review' | 'Needs Verification' | 'Not Documented' | 'Unable to Determine';

/**
 * Maps narrative facts to answer choices. All fields are optional filters; a rule applies to a
 * fact when every given filter matches. choices are answer codes ("0", "1-C") or choice text
 * prefixes ("Not completed"). Several choices = candidates for the case manager to select from.
 */
export interface AnswerRule {
  factKey?: string;
  /** Case-insensitive regular expression tested against the fact value. */
  valueMatches?: string;
  assertion?: Assertion;
  choices?: string[];
  /** For text questions: the suggested text (defaults to the fact value). */
  text?: string;
  /** Use this capture group of valueMatches as the answer code. */
  captureChoice?: number;
  verify?: boolean;
  note?: string;
}

export type CdsQuestionType = 'single' | 'multi' | 'date' | 'text';

export interface CdsFieldDef {
  id: string;
  section: string;
  label: string;
  /** Instrument item code, e.g. "H.2 j." */
  code?: string;
  group?: string;
  type?: CdsQuestionType;
  answerRules?: AnswerRule[];
  /** Answer choices if the configured instrument defines them. Empty = free text. */
  choices: string[];
  /** Fact keys that can support this field (first match wins, all are shown as evidence). */
  factKeys: string[];
  /** Field requires a separate form/record even when the narrative mentions it. */
  requiresRecord?: string;
  required?: boolean;
  guidance?: string;
}

export interface CdsTemplate {
  id: string;
  name: string;
  version: string;
  provisional: boolean;
  notice: string;
  fields: CdsFieldDef[];
}

export interface CdsResponse {
  fieldId: string;
  section: string;
  label: string;
  code: string;
  group: string;
  type: CdsQuestionType;
  choices: string[];
  /** Candidate answer choices when the narrative supports more than one. */
  candidates: string[];
  /** The field has a narrative mapping (otherwise it must be completed from the assessment). */
  mapped: boolean;
  functional: boolean;
  suggestedResponse: string;
  evidence: EvidenceRef[];
  confidence: Confidence | 'n/a';
  status: CdsStatus;
  provisional: boolean;
  rationale: string;
  cdsRecordValue: string | null;
}

export interface EvidenceRef {
  factId?: string;
  text: string;
  location: SourceLocation | null;
}

// ---------- ADL / IADL ----------
export type NarrativeFunctionalStatus =
  | 'Independent'
  | 'Needs Assistance'
  | 'Dependent'
  | 'Assistance Provided'
  | 'Mentioned - Level Not Stated'
  | 'Conflicting'
  | 'Not Documented';

export type CdsFunctionalStatus = 'Independent' | 'Needs Assistance' | 'Dependent' | 'Not Applicable' | 'Other' | 'Not Recorded' | 'CDS Not Supplied';

export type ComparisonResult = 'Match' | 'Mismatch' | 'Missing in Narrative' | 'Missing in CDS' | 'Needs Verification' | 'Not Applicable';

export interface AdlComparisonRow {
  areaId: string;
  label: string;
  type: FunctionalType;
  narrativeStatus: NarrativeFunctionalStatus;
  narrativeDetail: string;
  cdsStatus: CdsFunctionalStatus;
  cdsRawValue: string | null;
  result: ComparisonResult;
  explanation: string;
  evidence: EvidenceRef[];
}

// ---------- QA ----------
export type QaStatus = 'Complete' | 'Needs Review' | 'Missing' | 'Mismatch' | 'Not Applicable' | 'Unable to Verify';

export interface QaCategoryDef {
  id: string;
  number: number;
  title: string;
  requirements: string[];
  /** Records outside the narrative that the checklist requires. */
  requiredRecords: string[];
  evaluator: string;
  priority: 'High' | 'Medium' | 'Low';
  params?: Record<string, number | string | boolean>;
  enabled: boolean;
}

export interface QaChecklist {
  id: string;
  name: string;
  version: string;
  basis: string;
  disclaimer: string;
  categories: QaCategoryDef[];
}

export interface QaResult {
  categoryId: string;
  number: number;
  title: string;
  requirements: string[];
  evidenceFound: EvidenceRef[];
  evidenceMissing: string[];
  status: QaStatus;
  recommendedCorrection: string;
  sourceDocuments: string[];
  notes: string;
}

// ---------- Discrepancies, issues, tasks ----------
export interface Discrepancy {
  id: string;
  topic: string;
  key: string;
  values: { value: string; evidence: EvidenceRef }[];
  explanation: string;
}

export type Priority = 'High' | 'Medium' | 'Low';

export interface CorrectionIssue {
  id: string;
  priority: Priority;
  title: string;
  problem: string;
  whyItMatters: string;
  where: string;
  verify: string;
  suggestedCorrection: string;
  source: 'QA' | 'ADL/IADL' | 'CDS' | 'Discrepancy' | 'Documentation' | 'Security';
  evidence: EvidenceRef[];
}

export type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';

export interface FollowUpTask {
  id: string;
  description: string;
  responsible: string;
  dueDate: string | null;
  dueDateSource: 'documented' | 'not documented';
  status: TaskStatus;
  followUp: string;
  completionNotes: string;
  evidence: EvidenceRef[];
}

export type FinalReviewStatus =
  | 'Ready for Case Manager Review'
  | 'Corrections Required'
  | 'Additional Documentation Required'
  | 'Human Verification Required';

export interface ProviderInfo {
  mode: 'mock' | 'claude';
  label: string;
  model?: string;
}

export interface CdsRecordEntry {
  label: string;
  value: string;
  line: number;
  docId: string;
  docName: string;
}

export interface AnalysisResult {
  engineVersion: string;
  generatedAt: string;
  provider: ProviderInfo;
  configVersions: { cdsTemplate: string; qaChecklist: string };
  facts: Fact[];
  rejectedFacts: RejectedFact[];
  injectionWarnings: string[];
  cdsRecord: CdsRecordEntry[] | null;
  cds: CdsResponse[];
  adl: AdlComparisonRow[];
  qa: QaResult[];
  discrepancies: Discrepancy[];
  issues: CorrectionIssue[];
  tasks: FollowUpTask[];
  finalStatus: FinalReviewStatus;
  finalStatusReasons: string[];
}
