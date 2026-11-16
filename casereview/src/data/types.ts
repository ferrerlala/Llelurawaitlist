import type { FunctionalAreaDef } from '@shared/fact-catalog.ts';
import type { AnalysisResult, CdsTemplate, FollowUpTask, QaChecklist, ReviewInput } from '../engine/types.ts';
import type { WorkflowState } from '../workflow/types.ts';
import type { JournalTemplate } from '../config/journal-template.ts';

export type Role = 'case_manager' | 'qa_reviewer' | 'supervisor' | 'admin';
export const ROLE_LABELS: Record<Role, string> = {
  case_manager: 'Case Manager',
  qa_reviewer: 'QA Reviewer',
  supervisor: 'Supervisor',
  admin: 'Program Administrator',
};

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
}

export type DecisionStatus = 'approved' | 'rejected' | 'edited';

export interface ReviewDecision {
  status: DecisionStatus;
  /** Human-approved value (for edits, or the accepted suggestion when approved). */
  value: string;
  originalValue: string;
  note: string;
  by: string;
  byName: string;
  at: string;
}

export type ReviewWorkflowStatus = 'Draft' | 'In Review' | 'Reviewed';

export interface ReviewRecord {
  id: string;
  organizationId: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  input: ReviewInput;
  analysis: AnalysisResult;
  /** Keyed by `${kind}:${itemId}`, kind = cds | adl | qa | issue | fact. */
  decisions: Record<string, ReviewDecision>;
  tasks: FollowUpTask[];
  reviewerNotes: string;
  workflowStatus: ReviewWorkflowStatus;
  /** Present for reviews created through "Start Annual Assessment". */
  workflow?: WorkflowState;
}

export interface AuditEntry {
  id: string;
  organizationId: string;
  reviewId: string | null;
  at: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  before: string | null;
  after: string | null;
  note: string;
}

export type AiMode = 'mock' | 'claude';

export interface OrgSettings {
  aiMode: AiMode;
  /** Endpoint for the Claude provider. Empty = default (local dev endpoint or Supabase Edge Function). */
  aiEndpoint: string;
  retentionDays: number;
  cdsTemplate: CdsTemplate;
  qaChecklist: QaChecklist;
  functionalAreas: FunctionalAreaDef[];
  idleTimeoutMinutes: number;
  journalTemplate: JournalTemplate;
  /** Journal format for six-month reassessments (defaults to the built-in format). */
  sixMonthJournalTemplate?: JournalTemplate;
}
