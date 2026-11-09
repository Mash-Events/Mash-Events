-- Registration isolation (docs/system-design.md §7, §12.13 items 2–5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'super@example.org'),
  ('00000000-0000-4000-8000-0000000000a3', 'reviewer@example.org');

insert into public.organizations (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Org A'),
  ('10000000-0000-4000-8000-000000000002', 'org-b', 'Org B');

insert into public.events (id, org_id, slug, name, kind, status, review_mode, capacity, waitlist_enabled) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'a-one', 'A One', 'webinar', 'registration_open', 'manual', null, false),
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', 'a-two', 'A Two', 'webinar', 'registration_open', 'auto_confirm', 1, true),
  ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', 'b-one', 'B One', 'in_person', 'registration_open', 'manual', null, false),
  ('20000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000002', 'b-closed', 'B Closed', 'webinar', 'draft', 'manual', null, false);

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'platform', 'super_admin', null, null),
  ('00000000-0000-4000-8000-0000000000a3', 'event', 'reviewer', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1');

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

create function pg_temp.reg(p_event uuid, p_email text) returns jsonb language sql as $$
  select public.submit_registration(p_event,
    jsonb_build_object('email', p_email, 'first_name', 'Test', 'last_name', 'Person'), 'v1')
$$;

-- Who may submit.
set local role anon;
select throws_ok($$ select public.submit_registration('20000000-0000-4000-8000-0000000000a1', '{}'::jsonb, 'v1') $$,
  '42501', null, 'anon cannot call submit_registration');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', 'aal2', '20000000-0000-4000-8000-0000000000a1');
select throws_ok($$ select public.submit_registration('20000000-0000-4000-8000-0000000000a1', '{}'::jsonb, 'v1') $$,
  '42501', null, 'even a super admin session cannot call submit_registration directly');
reset role;

-- Same email in three events = three independent registrations.
set local role service_role;
select is(pg_temp.reg('20000000-0000-4000-8000-0000000000a1', 'Same@Example.org') ->> 'result', 'created', 'A1 created');
select is(pg_temp.reg('20000000-0000-4000-8000-0000000000a1', 'same@example.org') ->> 'result', 'duplicate', 'A1 dedupes case-insensitively');
select is(pg_temp.reg('20000000-0000-4000-8000-0000000000a2', 'same@example.org') ->> 'result', 'created', 'same email in A2 is a new registration');
select is(pg_temp.reg('20000000-0000-4000-8000-0000000000b1', 'same@example.org') ->> 'result', 'created', 'same email in B1 is a new registration');
select is(pg_temp.reg('20000000-0000-4000-8000-0000000000c1', 'x@example.org') ->> 'result', 'closed', 'closed event refuses');
select is(pg_temp.reg('20000000-0000-4000-8000-0000000000a2', 'second@example.org') ->> 'status', 'waitlisted',
  'auto-confirm event over capacity waitlists');
select is(pg_temp.reg('20000000-0000-4000-8000-000000000999', 'x@example.org') ->> 'result', 'not_found', 'unknown event');
reset role;

select is((select status from public.registrations
           where event_id = '20000000-0000-4000-8000-0000000000a1'), 'pending', 'manual review starts pending');
select is((select status from public.registrations
           where event_id = '20000000-0000-4000-8000-0000000000a2' and email = 'same@example.org'), 'confirmed',
  'auto-confirm within capacity confirms');

-- Reading is pinned to one event.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2', '20000000-0000-4000-8000-0000000000a1');
select is((select count(*)::int from public.registrations), 1, 'reviewer pinned to A1 sees A1 only');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2', '20000000-0000-4000-8000-0000000000b1');
select is((select count(*)::int from public.registrations), 0, 'reviewer pinned to another org''s event sees nothing');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2');
select is((select count(*)::int from public.registrations), 0, 'no pin sees nothing');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', 'aal2', '20000000-0000-4000-8000-0000000000a2');
select is((select count(*)::int from public.registrations), 2, 'super admin pinned to A2 sees only A2 rows');
reset role;

-- Writes only through RPCs, and only for the pinned event.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2', '20000000-0000-4000-8000-0000000000a1');
select throws_ok($$ update public.registrations set status = 'confirmed' $$,
  '42501', null, 'direct UPDATE is not allowed even for a reviewer');
select throws_ok(
  format('select public.transition_registration(%L, %L, %L)',
    '20000000-0000-4000-8000-0000000000b1',
    (select id from public.registrations limit 1), 'confirmed'),
  '42501', 'event pin mismatch', 'RPC refuses an event other than the pinned one');
reset role;

-- Crafted id from another event, with the right pin: not found.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2', '20000000-0000-4000-8000-0000000000a1');
select throws_ok(
  format('select public.transition_registration(%L, %L, %L)',
    '20000000-0000-4000-8000-0000000000a1',
    '00000000-0000-0000-0000-000000000000', 'confirmed'),
  'P0002', 'registration not found', 'unknown registration id is not found');
reset role;
create temp table b1_reg as
  select id from public.registrations where event_id = '20000000-0000-4000-8000-0000000000b1';
grant select on b1_reg to authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2', '20000000-0000-4000-8000-0000000000a1');
select throws_ok(
  format('select public.transition_registration(%L, %L, %L)',
    '20000000-0000-4000-8000-0000000000a1', (select id from b1_reg), 'confirmed'),
  'P0002', 'registration not found', 'B1 registration id under A1 is not found');

-- A valid review decision writes history.
select is(
  public.transition_registration('20000000-0000-4000-8000-0000000000a1',
    (select id from public.registrations limit 1), 'confirmed', 'looks good') ->> 'status',
  'confirmed', 'reviewer confirms in their event');
select is(
  (select from_status || '>' || to_status from public.registration_status_history
   where reason = 'looks good'),
  'pending>confirmed', 'history records the real previous status');
select throws_ok(
  format('select public.transition_registration(%L, %L, %L)',
    '20000000-0000-4000-8000-0000000000a1',
    (select id from public.registrations limit 1), 'rejected'),
  '23514', null, 'confirmed -> rejected is not an allowed transition');
reset role;

-- Without MFA nothing works.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal1', '20000000-0000-4000-8000-0000000000a1');
select is((select count(*)::int from public.registrations), 0, 'aal1 reads nothing');
reset role;

-- Schema guarantees.
select throws_ok(
  format($$ insert into public.registration_status_history (org_id, event_id, registration_id, to_status)
            values (%L, %L, %L, 'pending') $$,
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1',
    (select id from b1_reg)),
  '23503', null, 'history cannot point at another event''s registration');
select throws_ok(
  $$ update public.registrations set event_id = '20000000-0000-4000-8000-0000000000a2'
     where event_id = '20000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'event_id is immutable');

update public.events set status = 'archived' where id = '20000000-0000-4000-8000-0000000000b1';
select throws_ok(
  $$ update public.registrations set first_name = 'X'
     where event_id = '20000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'archived events are read-only');

select * from finish();
rollback;
