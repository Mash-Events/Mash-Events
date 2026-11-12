-- Certificates (docs/system-design.md §9.1 phase 3, migration
-- 20261112100000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 'super@example.org'),
  ('00000000-0000-4000-8000-0000000000b2', 'reviewer@example.org'),
  ('00000000-0000-4000-8000-0000000000b3', 'scanner@example.org');

insert into public.organizations (id, slug, name) values
  ('21000000-0000-4000-8000-000000000001', 'cert-org', 'Cert Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at) values
  ('22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001',
    'cert-day', 'Cert Day', 'in_person', 'live', 'Asia/Kolkata',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '9 hours',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '17 hours');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000b1', 'platform', 'super_admin', null, null),
  ('00000000-0000-4000-8000-0000000000b2', 'event', 'reviewer',
   '21000000-0000-4000-8000-000000000001',
   '22000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000b3', 'event', 'checkin_staff',
   '21000000-0000-4000-8000-000000000001',
   '22000000-0000-4000-8000-000000000001');

insert into public.registrations (org_id, event_id, code, email, first_name,
  status, consent_at, consent_version) values
  ('21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001',
   'ATTEND01', 'attended@example.org', 'Anna', 'confirmed', now(), 'test'),
  ('21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001',
   'NOSHOW01', 'noshow@example.org', 'Nina', 'confirmed', now(), 'test'),
  ('21000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001',
   'PENDNG01', 'pending@example.org', 'Pia', 'pending', now(), 'test');

insert into public.check_ins (org_id, event_id, registration_id, event_day,
  method)
select org_id, event_id, id,
       (now() at time zone 'Asia/Kolkata')::date, 'qr'
  from public.registrations where code = 'ATTEND01';

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

-- Check-in staff and reviewers cannot issue certificates.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b3', 'aal2',
  '22000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.issue_certificates(
       '22000000-0000-4000-8000-000000000001', 'attended') $$,
  '42501', null, 'checkin staff cannot issue certificates');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2', 'aal2',
  '22000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.issue_certificates(
       '22000000-0000-4000-8000-000000000001', 'attended') $$,
  '42501', null, 'reviewers cannot issue certificates');
reset role;

-- Super admin issues to the attended audience: only the checked-in,
-- confirmed registration gets one; the certificate code is the registration
-- code; one email is queued per certificate.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1', 'aal2',
  '22000000-0000-4000-8000-000000000001');
select is(
  public.issue_certificates('22000000-0000-4000-8000-000000000001',
    'attended') ->> 'result',
  'issued', 'attended audience issues');
select is(
  (select count(*)::int from public.event_certificates
    where event_id = '22000000-0000-4000-8000-000000000001'),
  1, 'only the checked-in registration has a certificate');
select is(
  (select code from public.event_certificates
    where event_id = '22000000-0000-4000-8000-000000000001'),
  'ATTEND01', 'certificate code is the registration code');
select is(
  (select count(*)::int from public.message_job_items i
    join public.message_jobs j on j.id = i.job_id
    where i.event_id = '22000000-0000-4000-8000-000000000001'
      and j.template_key = 'certificate_issued'),
  1, 'one certificate email queued');

-- Re-issuing is idempotent: the same audience skips the existing one and
-- queues nothing new.
select is(
  public.issue_certificates('22000000-0000-4000-8000-000000000001',
    'attended') ->> 'skipped',
  '1', 're-issue skips the existing certificate');
select is(
  (select count(*)::int from public.message_job_items i
    join public.message_jobs j on j.id = i.job_id
    where i.event_id = '22000000-0000-4000-8000-000000000001'
      and j.template_key = 'certificate_issued'),
  1, 're-issue queues no new email');

-- The confirmed audience covers both confirmed registrations, but the
-- existing one is skipped.
select is(
  public.issue_certificates('22000000-0000-4000-8000-000000000001',
    'confirmed') ->> 'issued',
  '1', 'confirmed audience adds the not-checked-in registration');

-- One audit row per issue call that issued something (the all-skipped
-- re-issue writes none).
select is(
  (select count(*)::int from public.audit_log
    where action = 'certificate.issued'
      and event_id = '22000000-0000-4000-8000-000000000001'),
  2, 'one audit row per issuing call');

-- Revoke: status moves, second revoke reports not_found, audit row written.
select is(
  public.revoke_certificate('22000000-0000-4000-8000-000000000001',
    (select id from public.event_certificates
      where event_id = '22000000-0000-4000-8000-000000000001'
        and code = 'ATTEND01')) ->> 'result',
  'revoked', 'certificate revoked');
select is(
  (select status from public.event_certificates where code = 'ATTEND01'),
  'revoked', 'revoked status stored');
select is(
  public.revoke_certificate('22000000-0000-4000-8000-000000000001',
    (select id from public.event_certificates where code = 'ATTEND01')
  ) ->> 'result',
  'not_found', 'revoking twice reports not_found');
select is(
  (select count(*)::int from public.audit_log
    where action = 'certificate.revoked'
      and event_id = '22000000-0000-4000-8000-000000000001'),
  1, 'revocation audited');
reset role;

select * from finish();
rollback;
