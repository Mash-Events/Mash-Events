-- Passes and check-in (docs/system-design.md §5.4, §9.1, §9.2, S14).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'scanner@example.org'),
  ('00000000-0000-4000-8000-0000000000c2', 'reviewer@example.org');

insert into public.organizations (id, slug, name) values
  ('40000000-0000-4000-8000-000000000001', 'gate-org', 'Gate Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at) values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    'gate-day', 'Gate Day', 'in_person', 'live', 'Asia/Kolkata',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '9 hours',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '18 hours');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000c1', 'platform', 'super_admin', null, null),
  ('00000000-0000-4000-8000-0000000000c2', 'event', 'reviewer',
   '40000000-0000-4000-8000-000000000001',
   '41000000-0000-4000-8000-000000000001');

set local role service_role;
insert into public.registrations (org_id, event_id, code, email, first_name,
  last_name, status, consent_at, consent_version) values
  ('40000000-0000-4000-8000-000000000001',
   '41000000-0000-4000-8000-000000000001',
   'GATE0001', 'attendee@example.org', 'Gate', 'Goer', 'confirmed', now(), 'v1');
reset role;

-- issue_pass: service role only, idempotent per (event, token hash).
set local role service_role;
select ok(public.issue_pass('41000000-0000-4000-8000-000000000001',
  (select id from public.registrations where code = 'GATE0001'),
  digest('token-one', 'sha256'), 'qr') is not null,
  'pass issued');
select is(
  public.issue_pass('41000000-0000-4000-8000-000000000001',
    (select id from public.registrations where code = 'GATE0001'),
    digest('token-one', 'sha256'), 'qr'),
  (select id from public.passes where event_id = '41000000-0000-4000-8000-000000000001'),
  're-issuing the same token hash is idempotent');
select is((select count(*)::int from public.passes
  where event_id = '41000000-0000-4000-8000-000000000001'), 1,
  'one pass row, token hash stored not the token');
reset role;

-- A reviewer (no checkin.scan) cannot create devices or see passes.
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

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2', 'aal2',
  '41000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.create_checkin_device(
       '41000000-0000-4000-8000-000000000001', 'Desk 1',
       digest('device-secret', 'sha256')) $$,
  '42501', null, 'reviewer cannot create a scanner device');
select is((select count(*)::int from public.passes), 0,
  'reviewer without checkin.scan sees no passes');
reset role;

-- Scanner (super admin) creates a device; secret hash only.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1', 'aal2',
  '41000000-0000-4000-8000-000000000001');
select ok(public.create_checkin_device(
  '41000000-0000-4000-8000-000000000001', 'Desk 1',
  digest('device-secret', 'sha256')) is not null,
  'scanner creates a device');
reset role;

-- record_check_in: the device secret is checked in the RPC itself.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1', 'aal2',
  '41000000-0000-4000-8000-000000000001');
select is(
  public.record_check_in('41000000-0000-4000-8000-000000000001',
    (select id from public.checkin_devices
      where event_id = '41000000-0000-4000-8000-000000000001'),
    'wrong-secret',
    (select id from public.passes
      where event_id = '41000000-0000-4000-8000-000000000001'),
    digest('token-one', 'sha256')) ->> 'result',
  'device_rejected', 'wrong device secret is rejected in the RPC');
select is(
  public.record_check_in('41000000-0000-4000-8000-000000000001',
    (select id from public.checkin_devices
      where event_id = '41000000-0000-4000-8000-000000000001'),
    'device-secret',
    (select id from public.passes
      where event_id = '41000000-0000-4000-8000-000000000001'),
    digest('token-one', 'sha256')) ->> 'result',
  'checked_in', 'right secret and token checks the attendee in');
select is(
  public.record_check_in('41000000-0000-4000-8000-000000000001',
    (select id from public.checkin_devices
      where event_id = '41000000-0000-4000-8000-000000000001'),
    'device-secret',
    (select id from public.passes
      where event_id = '41000000-0000-4000-8000-000000000001'),
    digest('token-one', 'sha256')) ->> 'result',
  'already_checked_in', 'second scan the same day is a no-op');
select is(
  public.record_check_in('41000000-0000-4000-8000-000000000001',
    (select id from public.checkin_devices
      where event_id = '41000000-0000-4000-8000-000000000001'),
    'device-secret',
    (select id from public.passes
      where event_id = '41000000-0000-4000-8000-000000000001'),
    digest('a-different-token', 'sha256')) ->> 'result',
  'pass_not_found', 'unknown token for this event is rejected');
select is((select count(*)::int from public.check_ins), 1,
  'exactly one check-in row');
select is((select count(*)::int from public.scan_log), 4,
  'every scan attempt is logged, including rejections');
reset role;

-- A rejected registrant's pass stops working.
set local role service_role;
update public.registrations set status = 'rejected' where code = 'GATE0001';
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1', 'aal2',
  '41000000-0000-4000-8000-000000000001');
select is(
  public.record_check_in('41000000-0000-4000-8000-000000000001',
    (select id from public.checkin_devices
      where event_id = '41000000-0000-4000-8000-000000000001'),
    'device-secret',
    (select id from public.passes
      where event_id = '41000000-0000-4000-8000-000000000001'),
    digest('token-one', 'sha256')) ->> 'result',
  'registration_not_confirmed',
  'a valid signature is not enough: registration status is re-checked');

-- Manual fallback.
select is(
  public.record_manual_check_in('41000000-0000-4000-8000-000000000001',
    (select id from public.registrations where code = 'GATE0001')) ->> 'result',
  'registration_not_confirmed',
  'manual check-in also refuses a non-confirmed registration');
reset role;

select * from finish();
rollback;
