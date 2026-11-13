-- CaseReview QA — initial schema
-- Multi-tenant: every row carries organization_id and is protected by row-level security.
-- Organization membership and role come from public.profiles (never from client-supplied claims).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organizations and users
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name text not null default '',
  role text not null default 'case_manager' check (role in ('case_manager', 'qa_reviewer', 'supervisor', 'admin')),
  created_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);

-- Helper functions (security definer so policies can read profiles without recursion).
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.has_app_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = any (roles) from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.current_org_id() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.has_app_role(text[]) from public;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_app_role(text[]) to authenticated;

-- Prevent users from moving themselves to another organization or escalating their own role.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'organization_id cannot be changed';
  end if;
  if new.role <> old.role and not public.has_app_role(array['admin']) then
    raise exception 'only administrators can change roles';
  end if;
  if new.role <> old.role and new.id = auth.uid() then
    raise exception 'administrators cannot change their own role';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Organization configuration
-- ---------------------------------------------------------------------------
create table public.org_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  ai_mode text not null default 'mock' check (ai_mode in ('mock', 'claude')),
  ai_endpoint text not null default '',
  retention_days integer not null default 90 check (retention_days between 1 and 3650),
  idle_timeout_minutes integer not null default 15 check (idle_timeout_minutes between 1 and 240),
  -- Must stay false until a BAA with the AI provider and organizational approval are in place.
  ai_provider_phi_approved boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table public.cds_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_key text not null,
  name text not null,
  version text not null,
  provisional boolean not null default true,
  definition jsonb not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, template_key, version)
);
create unique index cds_templates_one_active on public.cds_templates (organization_id) where is_active;

create table public.cds_field_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid not null references public.cds_templates (id) on delete cascade,
  field_key text not null,
  section text not null,
  label text not null,
  fact_keys text[] not null default '{}',
  choices text[] not null default '{}',
  requires_record text,
  required boolean not null default true,
  unique (template_id, field_key)
);

create table public.adl_iadl_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  area_key text not null,
  label text not null,
  area_type text not null check (area_type in ('ADL', 'IADL', 'Support')),
  synonyms text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (organization_id, area_key)
);

create table public.qa_checklist_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  checklist_key text not null,
  name text not null,
  version text not null,
  definition jsonb not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, checklist_key, version)
);
create unique index qa_checklist_one_active on public.qa_checklist_versions (organization_id) where is_active;

-- ---------------------------------------------------------------------------
-- Cases, assessments and documents
-- ---------------------------------------------------------------------------
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_identifier text not null,
  program text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, case_identifier)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  assessment_type text not null check (assessment_type in ('Annual Redetermination', 'Six-Month Reassessment', 'Initial Assessment', 'Other')),
  assessment_date date,
  program text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create index assessments_case_idx on public.assessments (case_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  client_doc_id text not null,
  name text not null,
  doc_type text not null,
  storage_path text,
  text_content text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);
create index documents_assessment_idx on public.documents (assessment_id);

-- ---------------------------------------------------------------------------
-- Review results
-- ---------------------------------------------------------------------------
create table public.case_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_by_name text not null default '',
  workflow_status text not null default 'In Review' check (workflow_status in ('Draft', 'In Review', 'Reviewed')),
  final_status text not null check (final_status in ('Ready for Case Manager Review', 'Corrections Required', 'Additional Documentation Required', 'Human Verification Required')),
  provider_mode text not null check (provider_mode in ('mock', 'claude')),
  engine_version text not null,
  config_versions jsonb not null default '{}',
  analysis jsonb not null,
  decisions jsonb not null default '{}',
  reviewer_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_reviews_org_created_idx on public.case_reviews (organization_id, created_at desc);

-- "Extracted assessment data": one row per validated fact, with its evidence.
create table public.extracted_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_id uuid not null references public.case_reviews (id) on delete cascade,
  fact_ref text not null,
  fact_key text not null,
  category text not null,
  value text not null,
  detail text not null default '',
  assertion text not null,
  source_text text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  doc_name text not null,
  line_no integer,
  section text,
  verification_status text not null default 'unverified'
);
create index extracted_facts_review_idx on public.extracted_facts (review_id);

create table public.qa_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_id uuid not null references public.case_reviews (id) on delete cascade,
  category_key text not null,
  category_number integer not null,
  title text not null,
  status text not null check (status in ('Complete', 'Needs Review', 'Missing', 'Mismatch', 'Not Applicable', 'Unable to Verify')),
  evidence_found jsonb not null default '[]',
  evidence_missing jsonb not null default '[]',
  recommended_correction text not null default '',
  reviewer_status text not null default 'pending'
);
create index qa_results_review_idx on public.qa_results (review_id);

create table public.discrepancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_id uuid not null references public.case_reviews (id) on delete cascade,
  topic text not null,
  fact_key text not null,
  conflicting_values jsonb not null,
  explanation text not null
);
create index discrepancies_review_idx on public.discrepancies (review_id);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_id uuid not null references public.case_reviews (id) on delete cascade,
  task_key text not null,
  description text not null,
  responsible text not null default 'Not documented',
  due_date_text text,
  due_date_source text not null check (due_date_source in ('documented', 'not documented')),
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  follow_up text not null default '',
  completion_notes text not null default '',
  evidence jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (review_id, task_key)
);
create index follow_up_tasks_org_status_idx on public.follow_up_tasks (organization_id, status);

create table public.case_manager_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_id uuid not null references public.case_reviews (id) on delete cascade,
  item_kind text not null check (item_kind in ('cds', 'adl', 'qa', 'issue', 'fact')),
  item_id text not null,
  status text not null check (status in ('approved', 'rejected', 'edited')),
  value text not null,
  original_value text not null,
  note text not null default '',
  decided_by uuid not null references auth.users (id),
  decided_by_name text not null default '',
  decided_at timestamptz not null default now()
);
create index approvals_review_idx on public.case_manager_approvals (review_id, item_kind, item_id);

-- Append-only audit trail. No update or delete policies exist.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_id uuid,
  at timestamptz not null default now(),
  user_id uuid not null references auth.users (id),
  user_name text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_value text,
  after_value text,
  note text not null default ''
);
create index audit_logs_org_at_idx on public.audit_logs (organization_id, at desc);
create index audit_logs_review_idx on public.audit_logs (review_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.org_settings enable row level security;
alter table public.cds_templates enable row level security;
alter table public.cds_field_mappings enable row level security;
alter table public.adl_iadl_categories enable row level security;
alter table public.qa_checklist_versions enable row level security;
alter table public.cases enable row level security;
alter table public.assessments enable row level security;
alter table public.documents enable row level security;
alter table public.case_reviews enable row level security;
alter table public.extracted_facts enable row level security;
alter table public.qa_results enable row level security;
alter table public.discrepancies enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.case_manager_approvals enable row level security;
alter table public.audit_logs enable row level security;

create policy org_select on public.organizations for select to authenticated using (id = public.current_org_id());

create policy profiles_select on public.profiles for select to authenticated using (organization_id = public.current_org_id());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (organization_id = public.current_org_id() and public.has_app_role(array['admin']))
  with check (organization_id = public.current_org_id());

-- Configuration: readable by members, writable by supervisors/admins.
do $$
declare t text;
begin
  foreach t in array array['org_settings', 'cds_templates', 'cds_field_mappings', 'adl_iadl_categories', 'qa_checklist_versions'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (organization_id = public.current_org_id() and public.has_app_role(array[''supervisor'',''admin'']))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (organization_id = public.current_org_id() and public.has_app_role(array[''supervisor'',''admin''])) with check (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (organization_id = public.current_org_id() and public.has_app_role(array[''supervisor'',''admin'']))', t);
  end loop;
end $$;

-- Case data: any member of the organization can read/write; only supervisors/admins delete.
do $$
declare t text;
begin
  foreach t in array array['cases', 'assessments', 'documents', 'case_reviews', 'extracted_facts', 'qa_results', 'discrepancies', 'follow_up_tasks'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (organization_id = public.current_org_id() and public.has_app_role(array[''supervisor'',''admin'']))', t);
  end loop;
end $$;

-- Approvals: insert-only record of human decisions, attributed to the caller.
create policy approvals_select on public.case_manager_approvals for select to authenticated using (organization_id = public.current_org_id());
create policy approvals_insert on public.case_manager_approvals for insert to authenticated
  with check (organization_id = public.current_org_id() and decided_by = auth.uid());

-- Audit: members insert their own entries; QA reviewers, supervisors and admins read all entries in the org.
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (organization_id = public.current_org_id() and user_id = auth.uid());
create policy audit_select on public.audit_logs for select to authenticated
  using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_app_role(array['qa_reviewer', 'supervisor', 'admin'])));

-- Tables are not exposed to anonymous users at all.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Private document storage (original uploads). Path convention: <organization_id>/<assessment_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('case-documents', 'case-documents', false)
  on conflict (id) do update set public = false;

create policy case_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy case_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'case-documents' and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy case_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = public.current_org_id()::text and public.has_app_role(array['supervisor', 'admin']));

-- ---------------------------------------------------------------------------
-- Data retention
-- ---------------------------------------------------------------------------
-- Deletes reviews (and their documents/assessments) older than each organization's retention period.
-- Schedule with pg_cron, e.g.: select cron.schedule('purge-expired-reviews', '15 3 * * *', 'select public.purge_expired_reviews()');
create or replace function public.purge_expired_reviews() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with expired as (
    delete from public.case_reviews r
    using public.org_settings s
    where s.organization_id = r.organization_id
      and r.created_at < now() - make_interval(days => s.retention_days)
    returning r.assessment_id
  ), removed_assessments as (
    -- Cascades to the assessment's documents.
    delete from public.assessments a where a.id in (select assessment_id from expired) returning a.id
  )
  select count(*) into n from expired;
  return n;
end $$;
revoke all on function public.purge_expired_reviews() from public, authenticated;
