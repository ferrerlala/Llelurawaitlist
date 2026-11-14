import type { EvidenceRef } from '../engine/types.ts';
import type { DraftField, JournalFieldInput } from './journal-builder.ts';

export type WorkflowStage = 'Journal Approved' | 'Corrections' | 'Final Approved';

export interface JournalVersion {
  version: number;
  text: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  reason: string;
  /** Every saved version is explicitly approved by the case manager who made it. */
  approvedAt: string;
  approvedByName: string;
}

export interface JournalState {
  templateId: string;
  previousReviewId: string | null;
  previousAssessmentDate: string | null;
  inputs: Record<string, JournalFieldInput>;
  draftFields: DraftField[];
  versions: JournalVersion[];
}

export type FindingSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type FindingKind =
  | 'journal_conflict' | 'journal_missing' | 'cds_unresolved' | 'cds_contradiction'
  | 'record_verification' | 'classification' | 'discrepancy' | 'fil';

export interface FindingOption {
  id: string;
  label: string;
  journalPatch?: { fieldId: string; content: string };
  cdsAnswer?: { fieldId: string; value: string; original: string };
}

export interface ConsistencyFinding {
  id: string;
  kind: FindingKind;
  category: string;
  severity: FindingSeverity;
  title: string;
  journalSection: string | null;
  journalInfo: string;
  cdsAnswer: string;
  mismatch: string;
  whyItMatters: string;
  suggestedCorrection: string;
  requiresClarification: boolean;
  journalFieldId?: string;
  cdsFieldIds: string[];
  qaCategoryIds: string[];
  options: FindingOption[];
  evidence: EvidenceRef[];
}

export type FindingStatus = 'open' | 'accepted' | 'edited' | 'info_provided' | 'rejected' | 'unable_to_verify';

export interface FindingState {
  status: FindingStatus;
  note: string;
  value?: string;
  by: string;
  byName: string;
  at: string;
  title: string;
  /** What the documentation said or what was wrong before the case manager acted. */
  before?: string;
  history: { status: FindingStatus; note: string; value?: string; at: string; byName: string }[];
}

export interface Attestation {
  qaCategoryId: string;
  text: string;
  by: string;
  byName: string;
  at: string;
}

export interface FinalApproval {
  by: string;
  byName: string;
  at: string;
  note: string;
  journalVersion: number;
  analysisGeneratedAt: string;
  decisionsSignature: string;
  score: number | null;
}

export interface RerunImpact {
  at: string;
  reason: string;
  changedCds: { fieldId: string; label: string; before: string; after: string }[];
  changedQa: { categoryId: string; title: string; before: string; after: string }[];
  invalidatedDecisions: string[];
}

export interface WorkflowState {
  stage: WorkflowStage;
  /** The case manager attested the documents are fictional/de-identified (needed for an external AI provider). */
  aiAttested?: boolean;
  journal: JournalState;
  findingStates: Record<string, FindingState>;
  attestations: Record<string, Attestation>;
  finalApproval: FinalApproval | null;
  lastRerun: RerunImpact | null;
}
