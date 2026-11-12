-- Announcements + feedback (migrations 20261113090000/20261113090100).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'super@example.org'),
  ('00000000-0000-4000-8000-0000000000d2', 'scanner@example.org');

insert into public.organizations (id, slug, name) values
  ('26000000-0000-4000-8000-000000000001', 'ann-org', 'Ann Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at) values
  ('27000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    'ann-day', 'Ann Day', 'in_person', 'live', 'Asia/Kolkata',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '9 hours',
    (now() at time zone 'Asia/Kolkata')::date::timestamptz + interval '17 hours');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000d1', 'platform', 'super_admin', null, null),
  ('00000000-0000-4000-8000-0000000000d2', 'event', 'checkin_staff',
   '26000000-0000-4000-8000-000000000001',
   '27000000-0000-4000-8000-000000000001');

insert into public.registrations (org_id, event_id, code, email, first_name,
  status, consent_at, consent_version) values
  ('26000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
   'FBKATT01', 'fb.attendee@example.org', 'Farah', 'confirmed', now(), 'test');

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

-- Check-in staff cannot publish announcements.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2', 'aal2',
  '27000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.publish_announcement(
       '27000000-0000-4000-8000-000000000001', 'Hello', 'info') $$,
  '42501', null, 'checkin staff cannot publish announcements');
reset role;

-- Super admin publishes; the row exists and is audited.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1', 'aal2',
  '27000000-0000-4000-8000-000000000001');
select is(
  public.publish_announcement('27000000-0000-4000-8000-000000000001',
    'Doors open at 9', 'info') ->> 'result',
  'published', 'announcement published');
select is(
  (select count(*)::int from public.event_announcements
    where event_id = '27000000-0000-4000-8000-000000000001'
      and status = 'published'),
  1, 'announcement row published');
select is(
  (select count(*)::int from public.audit_log
    where action = 'announcement.published'
      and event_id = '27000000-0000-4000-8000-000000000001'),
  1, 'announcement audited');

-- Hiding flips the status; hiding twice reports not_found.
select is(
  public.hide_announcement('27000000-0000-4000-8000-000000000001',
    (select id from public.event_announcements limit 1)) ->> 'result',
  'hidden', 'announcement hidden');
select is(
  public.hide_announcement('27000000-0000-4000-8000-000000000001',
    (select id from public.event_announcements limit 1)) ->> 'result',
  'not_found', 'hiding twice reports not_found');

-- Feedback: form save is idempotent upsert; disabled form refuses
-- submissions; enabled form accepts a linked response; unknown question
-- keys are rejected; responses are append-only.
select is(
  public.save_feedback_form('27000000-0000-4000-8000-000000000001', false,
    'How was it?', 'Thanks!', jsonb_build_array(
      jsonb_build_object('key', 'best_bit', 'label', 'Best bit',
        'type', 'textarea'),
      jsonb_build_object('key', 'again', 'label', 'Would come again?',
        'type', 'select', 'options', jsonb_build_array('Yes', 'No')))),
  jsonb_build_object('result', 'saved'), 'form saved');

-- submit_feedback is service-role-only (the public route is the
-- gatekeeper), so the remaining calls run as the test's superuser.
reset role;

select is(
  public.submit_feedback('27000000-0000-4000-8000-000000000001', 5,
    jsonb_build_object('best_bit', 'The keynote'), null) ->> 'result',
  'closed', 'disabled form refuses submissions');

select is(
  public.save_feedback_form('27000000-0000-4000-8000-000000000001', true,
    'How was it?', 'Thanks!', jsonb_build_array(
      jsonb_build_object('key', 'best_bit', 'label', 'Best bit',
        'type', 'textarea'))) ->> 'result',
  'saved', 'form enabled');

-- submit_feedback is service-role-only, so it runs as the test's
-- superuser (see the reset role above).
select is(
  public.submit_feedback('27000000-0000-4000-8000-000000000001', 4,
    jsonb_build_object('best_bit', 'The hallway track'),
    'FBKATT01') ->> 'result',
  'received', 'linked feedback accepted');
select is(
  (select registration_id = (
     select id from public.registrations where code = 'FBKATT01')
   from public.event_feedback_responses limit 1),
  true, 'response linked to the registration');

select throws_ok(
  $$ select public.submit_feedback(
       '27000000-0000-4000-8000-000000000001', null,
       jsonb_build_object('hacked', 'x'), null) $$,
  null, null, 'unknown question key rejected');

select throws_ok(
  $$ delete from public.event_feedback_responses $$,
  null, null, 'responses are append-only');

-- The feedback request email queues once per registration.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1', 'aal2',
  '27000000-0000-4000-8000-000000000001');
select is(
  public.request_feedback('27000000-0000-4000-8000-000000000001') ->> 'queued',
  '1', 'feedback email queued');
select is(
  public.request_feedback('27000000-0000-4000-8000-000000000001') ->> 'queued',
  '0', 'second request queues nothing');
select is(
  (select count(*)::int from public.message_job_items i
    join public.message_jobs j on j.id = i.job_id
    where i.event_id = '27000000-0000-4000-8000-000000000001'
      and j.template_key = 'feedback_request'),
  1, 'exactly one feedback email queued');
reset role;

select * from finish();
rollback;
