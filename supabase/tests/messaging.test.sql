-- Messaging queue isolation and correctness (docs/system-design.md §8, §12.5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a3', 'reviewer@example.org');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Org A'),
  ('10000000-0000-4000-8000-000000000002', 'org-b', 'Org B');
insert into public.events (id, org_id, slug, name, kind, status, review_mode) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'a-one', 'A One', 'webinar', 'registration_open', 'manual'),
  ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', 'b-one', 'B One', 'webinar', 'registration_open', 'auto_confirm');
insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000a3', 'event', 'reviewer', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1');

create function pg_temp.reg(p_event uuid, p_email text) returns uuid language sql as $$
  select (public.submit_registration(p_event,
    jsonb_build_object('email', p_email, 'first_name', 'Test'), 'v1') ->> 'registration_id')::uuid
$$;

-- Same person in two events (one manual, one auto-confirm).
create temp table regs as select
  pg_temp.reg('20000000-0000-4000-8000-0000000000a1', 'same@example.org') as a1,
  pg_temp.reg('20000000-0000-4000-8000-0000000000b1', 'same@example.org') as b1;
grant select on regs to authenticated, service_role;

select is((select template_key from public.message_job_items
           where registration_id = (select a1 from regs)), 'acknowledgement',
  'manual event: submission queues an acknowledgement');
select is((select template_key from public.message_job_items
           where registration_id = (select b1 from regs)), 'confirmed',
  'auto-confirm event: submission queues the confirmation, not an acknowledgement');
select is((select count(*)::int from public.message_job_items), 2, 'one item per registration');

-- Who may touch the queue.
set local role anon;
select throws_ok($$ select * from public.message_job_items $$, '42501', null, 'anon cannot read the queue');
select throws_ok($$ select public.claim_message_items('20000000-0000-4000-8000-0000000000a1', 'email', 10) $$,
  '42501', null, 'anon cannot claim');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a3',
  'role', 'authenticated', 'aal', 'aal2')::text, true);
select set_config('request.headers', json_build_object('x-mash-event', '20000000-0000-4000-8000-0000000000a1')::text, true);
set local role authenticated;
select is((select count(*)::int from public.message_job_items), 1, 'reviewer sees only the pinned event''s messages');
select throws_ok($$ select public.claim_message_items('20000000-0000-4000-8000-0000000000a1', 'email', 10) $$,
  '42501', null, 'signed-in users cannot claim');
select throws_ok($$ update public.message_job_items set status = 'sent' $$, '42501', null, 'no direct writes');
reset role;

-- Claims are per event.
set local role service_role;
create temp table claim_a as
  select * from public.claim_message_items('20000000-0000-4000-8000-0000000000a1', 'email', 10);
select is((select count(*)::int from claim_a), 1, 'claim returns the one due item of event A');
select ok((select bool_and(event_id = '20000000-0000-4000-8000-0000000000a1') from claim_a),
  'claimed items all belong to the claimed event');
select is((select count(*)::int from public.claim_message_items('20000000-0000-4000-8000-0000000000a1', 'email', 10)), 0,
  'a leased item is not claimed twice');

-- Only the lease holder can finish.
select is(public.finish_message_item('20000000-0000-4000-8000-0000000000a1',
  (select item_id from claim_a), gen_random_uuid(), 'sent', 'x'), false, 'wrong lease cannot finish');
select is(public.finish_message_item('20000000-0000-4000-8000-0000000000b1',
  (select item_id from claim_a), (select lease_id from claim_a), 'sent', 'x'), false,
  'right lease under another event id cannot finish');
select is(public.finish_message_item('20000000-0000-4000-8000-0000000000a1',
  (select item_id from claim_a), (select lease_id from claim_a), 'sent', 'msg-a1'), true, 'lease holder finishes');
reset role;

-- Re-verification at claim time: email changed after enqueue → skipped.
update public.message_job_items set status = 'queued', provider_message_id = null
 where registration_id = (select b1 from regs);
update public.registrations set email = 'changed@example.org' where id = (select b1 from regs);
set local role service_role;
select is((select count(*)::int from public.claim_message_items('20000000-0000-4000-8000-0000000000b1', 'email', 10)), 0,
  'changed recipient is not sent');
reset role;
select is((select last_error from public.message_job_items where registration_id = (select b1 from regs)),
  'recipient_changed', 'skip reason recorded');

-- A review decision queues the matching email once.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a3',
  'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select public.transition_registration('20000000-0000-4000-8000-0000000000a1', (select a1 from regs), 'rejected');
reset role;
select is((select count(*)::int from public.message_job_items
           where registration_id = (select a1 from regs) and template_key = 'rejected'), 1,
  'rejection queued once');

-- Retry with backoff, then failure after max attempts.
set local role service_role;
create temp table claim_r as
  select * from public.claim_message_items('20000000-0000-4000-8000-0000000000a1', 'email', 10);
select ok(public.finish_message_item('20000000-0000-4000-8000-0000000000a1',
  (select item_id from claim_r), (select lease_id from claim_r), 'retry', null, '503:server'), 'retry recorded');
reset role;
select ok((select status = 'retrying' and next_attempt_at > now() from public.message_job_items
           where id = (select item_id from claim_r)), 'retry is scheduled later');

-- Webhook: event tag must match; bounces suppress the address for the org.
set local role service_role;
select is(public.record_message_delivery('resend', 'msg-a1', 'bounced', '20000000-0000-4000-8000-0000000000b1'),
  'event_mismatch', 'webhook with another event''s tag is ignored');
select is(public.record_message_delivery('resend', 'msg-a1', 'bounced', '20000000-0000-4000-8000-0000000000a1'),
  'recorded', 'webhook with the right event tag is recorded');
reset role;
select is((select count(*)::int from public.message_suppressions
           where recipient_normalised = 'same@example.org'
             and org_id = '10000000-0000-4000-8000-000000000001'), 1,
  'hard bounce suppresses the address for that org only');

select * from finish();
rollback;
