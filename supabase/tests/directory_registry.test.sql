-- Directory listing + permanent certificate registry
-- (migration 20261113100000). The purge-survival test is the point of the
-- registry: live certificate rows cascade away with their registrations,
-- the slim registry answers the public verify page forever.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'super@example.org');

insert into public.organizations (id, slug, name) values
  ('28000000-0000-4000-8000-000000000001', 'reg-org', 'Reg Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at, retention_months) values
  ('29000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001',
    'reg-day', 'Reg Day', 'in_person', 'completed', 'Asia/Kolkata',
    now() - interval '10 days', now() - interval '9 days', 1);

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'platform', 'super_admin', null, null);

insert into public.registrations (org_id, event_id, code, email, first_name,
  status, consent_at, consent_version) values
  ('28000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
   'REGCRT01', 'reg.attendee@example.org', 'Ravi', 'confirmed', now(), 'test');

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

-- The directory listing toggle rides update_event (events.manage).
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', 'aal2',
  '29000000-0000-4000-8000-000000000001');
select is(
  (public.update_event('29000000-0000-4000-8000-000000000001',
     jsonb_build_object('listed', true))).listed,
  true, 'listed toggle stored');
select is(
  (select count(*)::int from public.events
    where id = '29000000-0000-4000-8000-000000000001' and listed),
  1, 'event is listed in the directory');

-- The registry has no authenticated grants by design (the public verify
-- route reads it via the service role); the direct lookups below run as the
-- test's superuser. issue_certificates itself stays callable by staff.
reset role;

-- Issuing a certificate writes the permanent registry record.
select is(
  public.issue_certificates('29000000-0000-4000-8000-000000000001',
    'confirmed') ->> 'issued',
  '1', 'certificate issued');
select is(
  (select name || '|' || event_name from public.event_certificate_registry
    where event_id = '29000000-0000-4000-8000-000000000001' and code = 'REGCRT01'),
  'Ravi|Reg Day', 'registry record written with certificate-face facts');

-- THE TEST: purge the event (retention 1 month, ended 9 days ago → shift the
-- clock by faking retention_months to 0) — registrations and live
-- certificates go, the registry stays.
update public.events set retention_months = 1,
  starts_at = now() - interval '41 days',
  ends_at = now() - interval '40 days'
 where id = '29000000-0000-4000-8000-000000000001';
select public.purge_due_event_data(50);
select is(
  (select count(*)::int from public.event_certificates
    where event_id = '29000000-0000-4000-8000-000000000001'),
  0, 'live certificate rows purged');
select is(
  (select count(*)::int from public.event_certificate_registry
    where event_id = '29000000-0000-4000-8000-000000000001'
      and code = 'REGCRT01' and status = 'issued'),
  1, 'registry record survives the purge');
reset role;

select * from finish();
rollback;
