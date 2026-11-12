-- Submissions inbox (docs/system-design.md §16.4 phase 3, migration
-- 20261112110000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'super@example.org'),
  ('00000000-0000-4000-8000-0000000000c3', 'scanner@example.org');

insert into public.organizations (id, slug, name) values
  ('23000000-0000-4000-8000-000000000001', 'subm-org', 'Subm Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at) values
  ('24000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001',
    'subm-day', 'Subm Day', 'in_person', 'live', 'Asia/Kolkata',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '9 hours',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '17 hours');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000c1', 'platform', 'super_admin', null, null),
  ('00000000-0000-4000-8000-0000000000c3', 'event', 'checkin_staff',
   '23000000-0000-4000-8000-000000000001',
   '24000000-0000-4000-8000-000000000001');

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

-- The intake RPC stores a valid submission (runs as the definer; the
-- public route is the gatekeeper).
select is(
  public.submit_submission('24000000-0000-4000-8000-000000000001',
    'contact', 'Meera Kapoor', 'meera@example.org',
    'Hello, I would like to know more.',
    jsonb_build_object('topic', 'sponsors')) ->> 'result',
  'received', 'valid submission stored');

-- Invalid shapes are rejected.
select throws_ok(
  $$ select public.submit_submission(
       '24000000-0000-4000-8000-000000000001',
       'newsletter', 'X', 'x@example.org', 'hi', '{}'::jsonb) $$,
  null, null, 'unknown kind rejected');
select throws_ok(
  $$ select public.submit_submission(
       '24000000-0000-4000-8000-000000000001',
       'contact', 'X', 'not-an-email', 'hi', '{}'::jsonb) $$,
  null, null, 'bad email rejected');

-- Unknown events get the same answer (no oracle beyond not_found).
select is(
  public.submit_submission('25000000-0000-4000-8000-000000000001',
    'contact', 'X', 'x@example.org', 'hi', '{}'::jsonb) ->> 'result',
  'not_found', 'unknown event reports not_found');

-- Check-in staff cannot triage.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3', 'aal2',
  '24000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.review_submission(
       '24000000-0000-4000-8000-000000000001',
       (select id from public.event_submissions limit 1), 'done') $$,
  '42501', null, 'checkin staff cannot review submissions');
reset role;

-- Triage moves the status and audits it.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1', 'aal2',
  '24000000-0000-4000-8000-000000000001');
select is(
  public.review_submission('24000000-0000-4000-8000-000000000001',
    (select id from public.event_submissions limit 1), 'done') ->> 'result',
  'updated', 'submission moved to done');
select is(
  (select status from public.event_submissions limit 1),
  'done', 'triage status stored');
select is(
  (select count(*)::int from public.audit_log
    where action = 'submission.reviewed'
      and event_id = '24000000-0000-4000-8000-000000000001'),
  1, 'triage audited');
reset role;

select * from finish();
rollback;
