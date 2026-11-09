-- Access rules for platform tables (docs/system-design.md §6.5, §12.3, §12.13).
-- Run locally: npm run sb -- test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Fixture: two orgs, three events, one user per role (example.org only).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'super@example.org'),
  ('00000000-0000-4000-8000-0000000000a2', 'orgadmin@example.org'),
  ('00000000-0000-4000-8000-0000000000a3', 'reviewer@example.org'),
  ('00000000-0000-4000-8000-0000000000a4', 'nobody@example.org'),
  ('00000000-0000-4000-8000-0000000000a5', 'revoked@example.org');

insert into public.organizations (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Org A'),
  ('10000000-0000-4000-8000-000000000002', 'org-b', 'Org B');

insert into public.events (id, org_id, slug, name, kind) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'a-one', 'A One', 'webinar'),
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', 'a-two', 'A Two', 'webinar'),
  ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', 'b-one', 'B One', 'in_person');

insert into public.memberships (user_id, scope, role, org_id, event_id, revoked_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'platform', 'super_admin', null, null, null),
  ('00000000-0000-4000-8000-0000000000a2', 'org', 'org_admin', '10000000-0000-4000-8000-000000000001', null, null),
  ('00000000-0000-4000-8000-0000000000a3', 'event', 'reviewer', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1', null),
  ('00000000-0000-4000-8000-0000000000a5', 'event', 'reviewer', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1', now());

-- Helper: act as a user with a given MFA level and pinned event.
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

-- Schema-level guarantees.
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'),
  'every public table has RLS enabled and forced'
);
select ok(
  not exists (select 1 from information_schema.role_table_grants
              where grantee = 'anon' and table_schema = 'public'),
  'anon has no table privileges in public'
);
select ok(
  not exists (select 1 from information_schema.role_table_grants
              where grantee = 'authenticated' and table_schema = 'public'
                and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  'authenticated cannot write platform tables directly'
);
select is(
  (select count(*)::int from information_schema.schemata where schema_name = 'app'),
  1, 'app helper schema exists'
);

-- Event reviewer of A1 (MFA done).
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2');
select results_eq(
  'select slug from public.events order by slug',
  $$ values ('a-one'::text) $$,
  'event reviewer sees only their event'
);
select ok(app.has_event_permission('20000000-0000-4000-8000-0000000000a1', 'registrations.review'),
  'reviewer may review their event');
select ok(not app.has_event_permission('20000000-0000-4000-8000-0000000000a2', 'registrations.read'),
  'reviewer has nothing on another event of the same org');
select ok(not app.has_event_permission('20000000-0000-4000-8000-0000000000a1', 'messages.bulk'),
  'reviewer cannot bulk message');
select is((select count(*)::int from public.memberships), 1,
  'a user sees only their own memberships');
reset role;

-- Same reviewer without MFA sees nothing.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal1');
select is((select count(*)::int from public.events), 0, 'aal1 sees no events');
select ok(not app.has_event_permission('20000000-0000-4000-8000-0000000000a1', 'registrations.read'),
  'aal1 has no permissions');
reset role;

-- Org admin of A.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2', 'aal2');
select results_eq(
  'select slug from public.events order by slug',
  $$ values ('a-one'::text), ('a-two'::text) $$,
  'org admin sees all events of their org and none of org B'
);
select is((select count(*)::int from public.organizations), 1,
  'org admin sees only their organisation');
select throws_ok(
  $$ select public.grant_membership('00000000-0000-4000-8000-0000000000a4', 'platform', 'super_admin') $$,
  '42501', 'forbidden', 'org admin cannot grant memberships'
);
reset role;

-- Revoked membership and no membership.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a5', 'aal2');
select is((select count(*)::int from public.events), 0, 'revoked membership sees nothing');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a4', 'aal2');
select is((select count(*)::int from public.events), 0, 'no membership sees nothing');
reset role;

-- Super admin: all events in the picker, but audit rows only for the pin.
insert into public.audit_log (event_id, actor_kind, action) values
  ('20000000-0000-4000-8000-0000000000a1', 'system', 'test.a1'),
  ('20000000-0000-4000-8000-0000000000b1', 'system', 'test.b1');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from public.events), 3, 'super admin sees every event in the picker');
select ok(
  (select public.grant_membership('00000000-0000-4000-8000-0000000000a4', 'event', 'checkin_staff',
     '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-0000000000b1')) is not null,
  'super admin can grant an event membership'
);
reset role;

-- Composite FK: an event membership cannot pair an event with the wrong org.
select throws_ok(
  $$ insert into public.memberships (user_id, scope, role, org_id, event_id)
     values ('00000000-0000-4000-8000-0000000000a4', 'event', 'reviewer',
             '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000b1') $$,
  '23503', null, 'event membership with mismatched org is rejected'
);

-- Audit log is append-only even for the table owner.
select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', null, 'audit_log rejects deletes'
);

select * from finish();
rollback;
