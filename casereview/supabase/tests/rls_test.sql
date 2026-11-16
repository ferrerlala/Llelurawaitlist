-- RLS verification. Run after supabase_stubs.sql and the migration:
--   psql -v ON_ERROR_STOP=1 -f supabase_stubs.sql -f ../migrations/*.sql -f rls_test.sql
\set QUIET on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'cm-a@example.org'),
  ('00000000-0000-0000-0000-00000000000b', 'cm-b@example.org'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin-a@example.org');
insert into public.organizations (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Fictional Org A'), ('10000000-0000-0000-0000-00000000000b', 'Fictional Org B');
insert into public.profiles (id, organization_id, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'CM A', 'case_manager'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'CM B', 'case_manager'),
  ('00000000-0000-0000-0000-0000000000ad', '10000000-0000-0000-0000-00000000000a', 'Admin A', 'admin');
insert into public.org_settings (organization_id) values ('10000000-0000-0000-0000-00000000000a'), ('10000000-0000-0000-0000-00000000000b');
insert into public.cases (id, organization_id, case_identifier) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'A-1'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'B-1');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'RLS TEST FAILED: %', label; end if; raise notice 'ok - %', label; end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.cases) = 1, 'user A sees only org A cases');
select pg_temp.check((select case_identifier from public.cases) = 'A-1', 'user A sees A-1');
select pg_temp.check((select count(*) from public.organizations) = 1, 'user A sees only own organization');

do $$ begin
  insert into public.cases (organization_id, case_identifier) values ('10000000-0000-0000-0000-00000000000b', 'X');
  raise exception 'RLS TEST FAILED: cross-org insert allowed';
exception when insufficient_privilege then raise notice 'ok - cross-org insert blocked'; end $$;

update public.cases set program = 'hacked' where case_identifier = 'B-1';
reset role;
select pg_temp.check((select program from public.cases where case_identifier = 'B-1') = '', 'cross-org update had no effect');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

do $$ begin
  update public.org_settings set retention_days = 1;
  if exists (select 1 from public.org_settings where retention_days = 1) then raise exception 'RLS TEST FAILED: case manager changed settings'; end if;
  raise notice 'ok - case manager cannot change settings';
end $$;

do $$ begin
  update public.profiles set role = 'admin' where id = auth.uid();
  raise exception 'RLS TEST FAILED: self role escalation allowed';
exception when raise_exception then
  if sqlerrm like 'RLS TEST FAILED%' then raise; end if;
  raise notice 'ok - self role escalation blocked (%)', sqlerrm;
end $$;

insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id)
  values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'test', 'review', 'x');
update public.audit_logs set action = 'tampered';
delete from public.audit_logs;
select pg_temp.check((select count(*) from public.audit_logs where action = 'test') = 1, 'audit log is append-only');

do $$ begin
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id)
    values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000ad', 'forged', 'review', 'x');
  raise exception 'RLS TEST FAILED: forged audit author';
exception when insufficient_privilege then raise notice 'ok - audit entries cannot be attributed to another user'; end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('case-documents', '10000000-0000-0000-0000-00000000000b/x/file.pdf');
  raise exception 'RLS TEST FAILED: cross-org storage write';
exception when insufficient_privilege then raise notice 'ok - cross-org document upload blocked'; end $$;
insert into storage.objects (bucket_id, name) values ('case-documents', '10000000-0000-0000-0000-00000000000a/x/file.pdf');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
update public.org_settings set retention_days = 30;
select pg_temp.check((select retention_days from public.org_settings) = 30, 'admin can change own org settings');
select pg_temp.check((select count(*) from public.audit_logs) = 1, 'admin can read org audit log');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.audit_logs) = 0, 'org B cannot read org A audit log');
select pg_temp.check((select count(*) from storage.objects) = 0, 'org B cannot see org A documents');
select pg_temp.check((select retention_days from public.org_settings) = 90, 'org B settings unaffected');

select pg_temp.as_user('');
select pg_temp.check((select count(*) from public.cases) = 0, 'no session sees nothing');
reset role;
\echo ALL RLS TESTS PASSED
