-- Export audit (docs/system-design.md §12.11, migration 20261111160000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'exporter@example.org'),
  ('00000000-0000-4000-8000-0000000000f2', 'reviewer@example.org');

insert into public.organizations (id, slug, name) values
  ('90000000-0000-4000-8000-000000000001', 'export-org', 'Export Org');

insert into public.events (id, org_id, slug, name, kind, status) values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
    'export-event', 'Export Event', 'in_person', 'registration_open');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'org', 'org_admin',
   '90000000-0000-4000-8000-000000000001', null),
  ('00000000-0000-4000-8000-0000000000f2', 'event', 'reviewer',
   '90000000-0000-4000-8000-000000000001',
   '91000000-0000-4000-8000-000000000001');

create function pg_temp.act_as(p_user uuid, p_aal text, p_pin uuid default null)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.headers',
    json_build_object('x-mash-event', coalesce(p_pin::text, ''))::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Reviewer (no exports.pii) is denied.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2', 'aal2',
  '91000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select app.record_export('91000000-0000-4000-8000-000000000001', 'csv', 12) $$,
  '42501', null, 'reviewer cannot record an export');
reset role;

-- Org admin (exports.pii) is audited with a PII-free summary.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1', 'aal2',
  '91000000-0000-4000-8000-000000000001');
select app.record_export('91000000-0000-4000-8000-000000000001', 'csv', 12);
select is(
  (select jsonb_build_object('format', summary ->> 'format',
                             'count', (summary ->> 'count')::int)
     from public.audit_log
    where action = 'export.roster'
      and event_id = '91000000-0000-4000-8000-000000000001'),
  jsonb_build_object('format', 'csv', 'count', 12),
  'export is audited with format and count only');
reset role;

select * from finish();
rollback;
