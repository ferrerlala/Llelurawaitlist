-- Fictional seed data for local development (supabase db reset).
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000001', 'Demo Aging Services (fictional)')
  on conflict do nothing;
insert into public.org_settings (organization_id) values ('10000000-0000-0000-0000-000000000001')
  on conflict do nothing;

-- After creating a user in Supabase Auth (Dashboard › Authentication › Users), link it:
-- insert into public.profiles (id, organization_id, full_name, role)
--   values ('<auth user uuid>', '10000000-0000-0000-0000-000000000001', 'Demo Case Manager', 'admin');
