-- Webinar join and bulk/scheduled messages (docs/system-design.md §9.3, §12.11).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a2', 'orgadmin@example.org'),
  ('00000000-0000-4000-8000-0000000000a3', 'reviewer@example.org');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Org A'),
  ('10000000-0000-4000-8000-000000000002', 'org-b', 'Org B');
insert into public.events (id, org_id, slug, name, kind, status, starts_at, ends_at, settings) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'a-web', 'A  Webinar', 'webinar',
   'registration_open', now() + interval '10 minutes', now() + interval '70 minutes',
   '{"join_url":"https://meet.example.org/a","join_window_minutes":30}'),
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', 'a-later', 'A Later', 'webinar',
   'registration_open', now() + interval '3 days', null, '{"join_url":"https://meet.example.org/later"}'),
  ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', 'b-web', 'B Webinar', 'webinar',
   'registration_open', now() + interval '10 minutes', null, '{"join_url":"https://meet.example.org/b"}');
insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000a2', 'org', 'org_admin', '10000000-0000-4000-8000-000000000001', null),
  ('00000000-0000-4000-8000-0000000000a3', 'event', 'reviewer', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1');

create function pg_temp.reg(p_event uuid, p_email text, p_status text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.registrations (org_id, event_id, code, email, first_name, status, consent_at, consent_version)
  select e.org_id, e.id, upper(substr(md5(p_email || p_event), 1, 8)), p_email, 'T', p_status, now(), 'v1'
  from public.events e where e.id = p_event returning id into v;
  return v;
end; $$;

create temp table r as select
  pg_temp.reg('20000000-0000-4000-8000-0000000000a1', 'conf@example.org', 'confirmed') as a_conf,
  pg_temp.reg('20000000-0000-4000-8000-0000000000a1', 'pend@example.org', 'pending') as a_pend,
  pg_temp.reg('20000000-0000-4000-8000-0000000000a2', 'later@example.org', 'confirmed') as a2_conf,
  pg_temp.reg('20000000-0000-4000-8000-0000000000b1', 'b@example.org', 'confirmed') as b_conf;
grant select on r to authenticated, service_role;

-- Join: only confirmed registrants of THIS event, inside the window.
set local role service_role;
select is(public.record_webinar_join('20000000-0000-4000-8000-0000000000a1', (select a_conf from r), 'h1') ->> 'join_url',
  'https://meet.example.org/a', 'confirmed registrant inside the window gets the platform link');
select is(public.record_webinar_join('20000000-0000-4000-8000-0000000000a1', (select a_pend from r), 'h1') ->> 'result',
  'invalid', 'pending registrant cannot join');
select is(public.record_webinar_join('20000000-0000-4000-8000-0000000000a1', (select b_conf from r), 'h1') ->> 'result',
  'invalid', 'another event''s registrant cannot join this event');
select is(public.record_webinar_join('20000000-0000-4000-8000-0000000000a2', (select a2_conf from r), 'h1') ->> 'result',
  'early', 'before the window shows the opening time');
select is((public.record_webinar_join('20000000-0000-4000-8000-0000000000a1', (select a_conf from r), 'h2') ->> 'result'),
  'ok', 'second join');
reset role;
select is((select join_count || ':' || cardinality(ip_hashes) from public.webinar_attendance
           where registration_id = (select a_conf from r)), '2:2', 'joins and distinct IP hashes counted');
set local role anon;
select throws_ok($$ select public.record_webinar_join('20000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'x') $$,
  '42501', null, 'anon cannot record joins directly');
reset role;

-- Bulk: permission, preview, test, typed confirm.
create function pg_temp.act_as(p_user uuid, p_pin uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.headers', json_build_object('x-mash-event', p_pin)::text, true);
  execute 'set local role authenticated';
end; $$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-0000000000a1');
select throws_ok($$ select public.create_message_intent('20000000-0000-4000-8000-0000000000a1', array['confirmed'], 's', 'b') $$,
  '42501', 'forbidden', 'reviewers cannot send bulk messages');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000a1');
create temp table p as select public.create_message_intent('20000000-0000-4000-8000-0000000000a1',
  array['confirmed'], 'Starts soon', 'See you there.', true) as preview;
select is(((select preview from p) ->> 'count')::int, 1, 'preview counts this event''s confirmed registrants only');
select throws_ok(format('select public.confirm_message_intent(%L, %L, %L, %L)',
  '20000000-0000-4000-8000-0000000000a1', (select preview ->> 'intent_id' from p), 'A Webinar',
  (select preview ->> 'selection_hash' from p)), '23514', 'send a test first', 'test send is required');
select lives_ok(format('select public.mark_message_intent_tested(%L, %L)',
  '20000000-0000-4000-8000-0000000000a1', (select preview ->> 'intent_id' from p)), 'test recorded');
select throws_ok(format('select public.confirm_message_intent(%L, %L, %L, %L)',
  '20000000-0000-4000-8000-0000000000a1', (select preview ->> 'intent_id' from p), 'B Webinar',
  (select preview ->> 'selection_hash' from p)), '23514', 'typed name does not match the event', 'wrong event name refused');
select throws_ok(format('select public.confirm_message_intent(%L, %L, %L, %L)',
  '20000000-0000-4000-8000-0000000000a1', (select preview ->> 'intent_id' from p), 'a webinar',
  md5('x')), '23514', 'selection changed; preview again', 'changed selection refused');
select is(public.confirm_message_intent('20000000-0000-4000-8000-0000000000a1', (select (preview ->> 'intent_id')::uuid from p),
  '  a   WEBINAR ', (select preview ->> 'selection_hash' from p)) ->> 'result', 'queued',
  'typed name matches ignoring case and spaces');
select is(public.confirm_message_intent('20000000-0000-4000-8000-0000000000a1', (select (preview ->> 'intent_id')::uuid from p),
  'A Webinar', (select preview ->> 'selection_hash' from p)) ->> 'result', 'already_confirmed',
  'confirming twice does not send twice');
reset role;
select is((select count(*)::int from public.message_job_items where template_key = 'custom'), 1,
  'one custom email queued, for the one confirmed registrant');

-- Another event's intent id under this event's pin: not found.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000a2');
select throws_ok(format('select public.mark_message_intent_tested(%L, %L)',
  '20000000-0000-4000-8000-0000000000a2', (select preview ->> 'intent_id' from p)),
  'P0002', 'intent not found', 'an intent from another event is not found');

-- Scheduled: audience worked out at send time.
create temp table s as select public.create_message_intent('20000000-0000-4000-8000-0000000000a2',
  array['confirmed'], 'Reminder', 'Tomorrow!', true, now() + interval '1 hour') as preview;
select public.mark_message_intent_tested('20000000-0000-4000-8000-0000000000a2', (select (preview ->> 'intent_id')::uuid from s));
select is(public.confirm_message_intent('20000000-0000-4000-8000-0000000000a2', (select (preview ->> 'intent_id')::uuid from s),
  'A Later', (select preview ->> 'selection_hash' from s)) ->> 'result', 'scheduled', 'future message is scheduled');
reset role;
select pg_temp.reg('20000000-0000-4000-8000-0000000000a2', 'late@example.org', 'confirmed');
update public.bulk_action_intents set send_at = now() - interval '1 second'
 where id = (select (preview ->> 'intent_id')::uuid from s);
set local role service_role;
select is(public.release_due_message_intents(), 1, 'due scheduled message released');
reset role;
select is((select count(*)::int from public.message_job_items i
           join public.message_jobs j on j.id = i.job_id
           where j.intent_id = (select (preview ->> 'intent_id')::uuid from s)), 2,
  'release includes people confirmed after scheduling');

select * from finish();
rollback;
