-- Spot registration (docs/system-design.md §16.4, migration 20261111170000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'super@example.org'),
  ('00000000-0000-4000-8000-0000000000a3', 'scanneronly@example.org');

insert into public.organizations (id, slug, name) values
  ('11000000-0000-4000-8000-000000000001', 'spot-org', 'Spot Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at) values
  ('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
    'gate-day', 'Gate Day', 'in_person', 'live', 'Asia/Kolkata',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '9 hours',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '18 hours');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'platform', 'super_admin', null, null),
  ('00000000-0000-4000-8000-0000000000a3', 'event', 'checkin_staff',
   '11000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000001');

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

-- Check-in-only staff cannot create spot registrations.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', 'aal2',
  '12000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.create_spot_registration(
       '12000000-0000-4000-8000-000000000001', 'Walk', 'Up', null, null) $$,
  '42501', null, 'checkin-only staff cannot create spot registrations');
reset role;

-- Reviewer-level staff: registration created, confirmed, spot-sourced,
-- checked in for today, audited.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', 'aal2',
  '12000000-0000-4000-8000-000000000001');
select is(
  public.create_spot_registration('12000000-0000-4000-8000-000000000001',
    'Walk', 'Up', 'walk@example.org', 'ACME') ->> 'result',
  'created', 'spot registration created');
select is(
  (select source || ':' || status from public.registrations
    where event_id = '12000000-0000-4000-8000-000000000001'
      and email = 'walk@example.org'),
  'spot:confirmed', 'spot registration is confirmed with source spot');
select is(
  (select method from public.check_ins
    where event_id = '12000000-0000-4000-8000-000000000001'),
  'spot', 'spot registration is checked in for today');
select is(
  (select count(*)::int from public.audit_log
    where action = 'registration.spot'
      and event_id = '12000000-0000-4000-8000-000000000001'),
  1, 'spot registration is audited');
reset role;

select * from finish();
rollback;
