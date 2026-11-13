// Supabase/PostgreSQL repository. All access goes through the authenticated
// user's session; row-level security enforces organization isolation server-side.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FunctionalAreaDef } from '@shared/fact-catalog.ts';
import type { CdsTemplate, FollowUpTask, QaChecklist, ReviewInput } from '../engine/types.ts';
import { defaultSettings } from './default-settings.ts';
import type { Repository } from './repository.ts';
import type { AppUser, AuditEntry, OrgSettings, ReviewDecision, ReviewRecord } from './types.ts';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

interface ReviewRow {
  id: string; organization_id: string; assessment_id: string; created_by: string; created_by_name: string; created_at: string; updated_at: string;
  workflow_status: ReviewRecord['workflowStatus']; analysis: ReviewRecord['analysis']; decisions: Record<string, ReviewDecision>;
  reviewer_notes: string;
  cases: { case_identifier: string; program: string } | null;
  assessments: { assessment_type: ReviewInput['assessmentType']; assessment_date: string | null; program: string } | null;
}

export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;
  constructor(private db: SupabaseClient) {}

  private async hydrate(row: ReviewRow): Promise<ReviewRecord> {
    const [docs, tasks] = await Promise.all([
      this.db.from('documents').select('client_doc_id,name,doc_type,text_content').eq('assessment_id', row.assessment_id).order('created_at'),
      this.db.from('follow_up_tasks').select('*').eq('review_id', row.id).order('task_key'),
    ]);
    const documents = (check(docs) ?? []).map((d) => ({ id: d.client_doc_id, name: d.name, type: d.doc_type, text: d.text_content }));
    const taskRows = (check(tasks) ?? []) as Record<string, unknown>[];
    return {
      id: row.id, organizationId: row.organization_id, createdBy: row.created_by, createdByName: row.created_by_name,
      createdAt: row.created_at, updatedAt: row.updated_at, analysis: row.analysis, decisions: row.decisions ?? {},
      reviewerNotes: row.reviewer_notes, workflowStatus: row.workflow_status,
      input: {
        caseIdentifier: row.cases?.case_identifier ?? '', program: row.assessments?.program ?? row.cases?.program ?? '',
        assessmentType: row.assessments?.assessment_type ?? 'Other', assessmentDate: row.assessments?.assessment_date ?? '', documents,
      },
      tasks: taskRows.map((t) => ({
        id: t.task_key as string, description: t.description as string, responsible: t.responsible as string,
        dueDate: (t.due_date_text as string | null) ?? null, dueDateSource: t.due_date_source as FollowUpTask['dueDateSource'],
        status: t.status as FollowUpTask['status'], followUp: t.follow_up as string, completionNotes: t.completion_notes as string,
        evidence: (t.evidence as FollowUpTask['evidence']) ?? [],
      })),
    };
  }

  private readonly reviewSelect = 'id,organization_id,case_id,assessment_id,created_by,created_by_name,created_at,updated_at,workflow_status,analysis,decisions,reviewer_notes,cases(case_identifier,program),assessments(assessment_type,assessment_date,program)';

  async listReviews(_user: AppUser) {
    const rows = check(await this.db.from('case_reviews').select(this.reviewSelect).order('created_at', { ascending: false }).limit(200)) as unknown as ReviewRow[];
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  async getReview(_user: AppUser, id: string) {
    const row = check(await this.db.from('case_reviews').select(this.reviewSelect).eq('id', id).maybeSingle()) as unknown as ReviewRow | null;
    return row ? this.hydrate(row) : null;
  }

  async saveReview(user: AppUser, review: ReviewRecord) {
    const org = user.organizationId;
    const existing = check(await this.db.from('case_reviews').select('id,case_id,assessment_id').eq('id', review.id).maybeSingle()) as
      | { id: string; case_id: string; assessment_id: string } | null;

    if (!existing) {
      const kase = check(await this.db.from('cases')
        .upsert({ organization_id: org, case_identifier: review.input.caseIdentifier, program: review.input.program, created_by: user.id }, { onConflict: 'organization_id,case_identifier' })
        .select('id').single()) as { id: string };
      const assessment = check(await this.db.from('assessments').insert({
        organization_id: org, case_id: kase.id, assessment_type: review.input.assessmentType,
        assessment_date: review.input.assessmentDate || null, program: review.input.program, created_by: user.id,
      }).select('id').single()) as { id: string };
      check(await this.db.from('documents').insert(review.input.documents.map((d) => ({
        organization_id: org, assessment_id: assessment.id, client_doc_id: d.id, name: d.name, doc_type: d.type, text_content: d.text, created_by: user.id,
      }))));
      const a = review.analysis;
      check(await this.db.from('case_reviews').insert({
        id: review.id, organization_id: org, case_id: kase.id, assessment_id: assessment.id, created_by: user.id, created_by_name: review.createdByName,
        workflow_status: review.workflowStatus, final_status: a.finalStatus, provider_mode: a.provider.mode, engine_version: a.engineVersion,
        config_versions: a.configVersions, analysis: a, decisions: review.decisions, reviewer_notes: review.reviewerNotes,
      }));
      // Normalized, queryable copies of the results.
      if (a.facts.length) check(await this.db.from('extracted_facts').insert(a.facts.map((f) => ({
        organization_id: org, review_id: review.id, fact_ref: f.id, fact_key: f.key, category: f.category, value: f.value, detail: f.detail,
        assertion: f.assertion, source_text: f.sourceText, confidence: f.confidence, doc_name: f.location.docName, line_no: f.location.line, section: f.location.section,
      }))));
      check(await this.db.from('qa_results').insert(a.qa.map((q) => ({
        organization_id: org, review_id: review.id, category_key: q.categoryId, category_number: q.number, title: q.title, status: q.status,
        evidence_found: q.evidenceFound, evidence_missing: q.evidenceMissing, recommended_correction: q.recommendedCorrection,
      }))));
      if (a.discrepancies.length) check(await this.db.from('discrepancies').insert(a.discrepancies.map((d) => ({
        organization_id: org, review_id: review.id, topic: d.topic, fact_key: d.key, conflicting_values: d.values, explanation: d.explanation,
      }))));
    } else {
      const prev = check(await this.db.from('case_reviews').select('decisions').eq('id', review.id).single()) as { decisions: Record<string, ReviewDecision> };
      check(await this.db.from('case_reviews').update({
        decisions: review.decisions, reviewer_notes: review.reviewerNotes, workflow_status: review.workflowStatus, updated_at: new Date().toISOString(),
      }).eq('id', review.id));
      // Insert-only approval history for decisions that changed.
      const changed = Object.entries(review.decisions).filter(([k, d]) => prev.decisions?.[k]?.at !== d.at);
      if (changed.length) check(await this.db.from('case_manager_approvals').insert(changed.map(([k, d]) => {
        const [kind, ...rest] = k.split(':');
        return {
          organization_id: org, review_id: review.id, item_kind: kind, item_id: rest.join(':'), status: d.status, value: d.value,
          original_value: d.originalValue, note: d.note, decided_by: user.id, decided_by_name: d.byName, decided_at: d.at,
        };
      })));
    }
    if (review.tasks.length) check(await this.db.from('follow_up_tasks').upsert(review.tasks.map((t) => ({
      organization_id: org, review_id: review.id, task_key: t.id, description: t.description, responsible: t.responsible, due_date_text: t.dueDate,
      due_date_source: t.dueDateSource, status: t.status, follow_up: t.followUp, completion_notes: t.completionNotes, evidence: t.evidence,
      updated_at: new Date().toISOString(),
    })), { onConflict: 'review_id,task_key' }));
  }

  async deleteReview(_user: AppUser, id: string) {
    const row = check(await this.db.from('case_reviews').select('assessment_id').eq('id', id).maybeSingle()) as { assessment_id: string } | null;
    check(await this.db.from('case_reviews').delete().eq('id', id));
    if (row) check(await this.db.from('assessments').delete().eq('id', row.assessment_id));
  }

  async getSettings(user: AppUser): Promise<OrgSettings> {
    const base = defaultSettings();
    const [s, cds, qa, areas] = await Promise.all([
      this.db.from('org_settings').select('*').eq('organization_id', user.organizationId).maybeSingle(),
      this.db.from('cds_templates').select('definition').eq('is_active', true).maybeSingle(),
      this.db.from('qa_checklist_versions').select('definition').eq('is_active', true).maybeSingle(),
      this.db.from('adl_iadl_categories').select('*').eq('active', true).order('sort_order'),
    ]);
    const row = check(s) as Record<string, unknown> | null;
    const areaRows = check(areas) as Record<string, unknown>[];
    return {
      ...base,
      aiMode: (row?.ai_mode as OrgSettings['aiMode']) ?? base.aiMode,
      aiEndpoint: (row?.ai_endpoint as string) ?? base.aiEndpoint,
      retentionDays: (row?.retention_days as number) ?? base.retentionDays,
      idleTimeoutMinutes: (row?.idle_timeout_minutes as number) ?? base.idleTimeoutMinutes,
      cdsTemplate: (check(cds) as { definition: CdsTemplate } | null)?.definition ?? base.cdsTemplate,
      qaChecklist: (check(qa) as { definition: QaChecklist } | null)?.definition ?? base.qaChecklist,
      functionalAreas: areaRows.length
        ? areaRows.map((a) => ({ id: a.area_key as string, label: a.label as string, type: a.area_type as FunctionalAreaDef['type'], synonyms: a.synonyms as string[] }))
        : base.functionalAreas,
    };
  }

  async saveSettings(user: AppUser, settings: OrgSettings) {
    const org = user.organizationId;
    check(await this.db.from('org_settings').upsert({
      organization_id: org, ai_mode: settings.aiMode, ai_endpoint: settings.aiEndpoint, retention_days: settings.retentionDays,
      idle_timeout_minutes: settings.idleTimeoutMinutes, updated_at: new Date().toISOString(), updated_by: user.id,
    }));
    await this.activateVersion('cds_templates', 'template_key', settings.cdsTemplate.id, settings.cdsTemplate.version, {
      name: settings.cdsTemplate.name, provisional: settings.cdsTemplate.provisional, definition: settings.cdsTemplate,
    }, user);
    const tpl = check(await this.db.from('cds_templates').select('id').eq('is_active', true).single()) as { id: string };
    check(await this.db.from('cds_field_mappings').delete().eq('template_id', tpl.id));
    check(await this.db.from('cds_field_mappings').insert(settings.cdsTemplate.fields.map((f) => ({
      organization_id: org, template_id: tpl.id, field_key: f.id, section: f.section, label: f.label, fact_keys: f.factKeys,
      choices: f.choices, requires_record: f.requiresRecord ?? null, required: f.required ?? true,
    }))));
    await this.activateVersion('qa_checklist_versions', 'checklist_key', settings.qaChecklist.id, settings.qaChecklist.version, {
      name: settings.qaChecklist.name, definition: settings.qaChecklist,
    }, user);
    check(await this.db.from('adl_iadl_categories').delete().eq('organization_id', org));
    check(await this.db.from('adl_iadl_categories').insert(settings.functionalAreas.map((a, i) => ({
      organization_id: org, area_key: a.id, label: a.label, area_type: a.type, synonyms: a.synonyms, sort_order: i,
    }))));
  }

  private async activateVersion(table: string, keyCol: string, key: string, version: string, fields: Record<string, unknown>, user: AppUser) {
    check(await this.db.from(table).update({ is_active: false }).eq('is_active', true));
    check(await this.db.from(table).upsert(
      { organization_id: user.organizationId, [keyCol]: key, version, ...fields, is_active: true, created_by: user.id },
      { onConflict: `organization_id,${keyCol},version` },
    ));
  }

  async appendAudit(_user: AppUser, entries: AuditEntry[]) {
    if (!entries.length) return;
    check(await this.db.from('audit_logs').insert(entries.map((e) => ({
      id: e.id, organization_id: e.organizationId, review_id: e.reviewId, at: e.at, user_id: e.userId, user_name: e.userName,
      action: e.action, entity_type: e.entityType, entity_id: e.entityId, before_value: e.before, after_value: e.after, note: e.note,
    }))));
  }

  async listAudit(_user: AppUser, reviewId?: string) {
    let q = this.db.from('audit_logs').select('*').order('at', { ascending: false }).limit(500);
    if (reviewId) q = q.eq('review_id', reviewId);
    return (check(await q) as Record<string, string>[]).map((r) => ({
      id: r.id, organizationId: r.organization_id, reviewId: r.review_id, at: r.at, userId: r.user_id, userName: r.user_name,
      action: r.action, entityType: r.entity_type, entityId: r.entity_id, before: r.before_value, after: r.after_value, note: r.note,
    }));
  }

  async purgeExpired(_user: AppUser, retentionDays: number) {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const rows = check(await this.db.from('case_reviews').select('id,assessment_id').lt('created_at', cutoff)) as { id: string; assessment_id: string }[];
    for (const r of rows) {
      check(await this.db.from('case_reviews').delete().eq('id', r.id));
      check(await this.db.from('assessments').delete().eq('id', r.assessment_id));
    }
    return rows.length;
  }
}
