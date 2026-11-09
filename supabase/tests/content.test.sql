-- Event content and the public read path (docs/system-design.md §5.2, §10.1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a2', 'orgadmin@example.org'),
  ('00000000-0000-4000-8000-0000000000a3', 'reviewer@example.org');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Org A'),
  ('10000000-0000-4000-8000-000000000002', 'org-b', 'Org B');
insert into public.events (id, org_id, slug, name, kind, status) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'a-one', 'A One', 'webinar', 'registration_open'),
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', 'a-draft', 'A Draft', 'webinar', 'draft'),
  ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', 'b-one', 'B One', 'webinar', 'published');
insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000a2', 'org', 'org_admin', '10000000-0000-4000-8000-000000000001', null),
  ('00000000-0000-4000-8000-0000000000a3', 'event', 'reviewer', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1');

insert into public.event_speakers (id, event_id, name, visible) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1', 'Visible Speaker', true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-0000000000a1', 'Hidden Speaker', false),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-0000000000b1', 'B Speaker', true);
insert into public.event_sessions (id, event_id, title) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1', 'A Session'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-0000000000b1', 'B Session');
insert into public.registrations (org_id, event_id, code, email, first_name, consent_at, consent_version)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1',
  'ABCDEFGH', 'private@example.org', 'Private', now(), 'v1');

create function pg_temp.act_as(p_user uuid, p_pin uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.headers', json_build_object('x-mash-event', p_pin)::text, true);
  execute 'set local role authenticated';
end;
$$;

select is((select org_id::text from public.event_speakers where id = '30000000-0000-4000-8000-000000000001'),
  '10000000-0000-4000-8000-000000000001', 'org_id is filled from the event');

-- Public read path (anon).
set local role anon;
select ok(public.public_event_content('20000000-0000-4000-8000-0000000000a1') is not null,
  'anon can read an open event');
select is(jsonb_array_length(public.public_event_content('20000000-0000-4000-8000-0000000000a1') -> 'speakers'), 1,
  'hidden speakers are not public');
select is(public.public_event_content('20000000-0000-4000-8000-0000000000a1') #>> '{speakers,0,name}', 'Visible Speaker',
  'only this event''s speakers');
select ok(public.public_event_content('20000000-0000-4000-8000-0000000000a1')::text not like '%private@example.org%',
  'no registration data in public content');
select ok((public.public_event_content('20000000-0000-4000-8000-0000000000a1') #>> '{event,registration_open}')::boolean,
  'registration_open reflects the event status');
select is(public.public_event_content('20000000-0000-4000-8000-0000000000a2'), null, 'draft events are not public');
select throws_ok($$ select * from public.event_speakers $$, '42501', null, 'anon cannot read content tables directly');
reset role;

-- Writes: org admin pinned to A1 adds a speaker without naming the event.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000a1');
select lives_ok($$ insert into public.event_speakers (name) values ('New Speaker') $$,
  'content editor inserts without event or org ids');
select is((select count(*)::int from public.event_speakers), 3, 'editor sees only the pinned event''s speakers');
select throws_ok(
  $$ insert into public.event_speakers (event_id, name) values ('20000000-0000-4000-8000-0000000000b1', 'X') $$,
  '42501', null, 'event_id cannot be supplied');
select throws_ok(
  $$ insert into public.event_session_speakers (session_id, speaker_id)
     values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003') $$,
  '23503', null, 'cannot link a session to another event''s speaker');
reset role;

-- Org admin pinned to another org's event: no access.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000b1');
select throws_ok($$ insert into public.event_speakers (name) values ('Sneaky') $$,
  '42501', null, 'no content writes for another org''s event');
select is((select count(*)::int from public.event_speakers), 0, 'no content reads for another org''s event');
reset role;

-- A reviewer cannot edit content.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-0000000000a1');
select throws_ok($$ insert into public.event_speakers (name) values ('Nope') $$,
  '42501', null, 'reviewers cannot edit content');
reset role;

select * from finish();
rollback;
