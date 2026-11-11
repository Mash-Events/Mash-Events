-- Retention purge (docs/system-design.md §13, migration 20261111120000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 'sys@example.org');

insert into public.organizations (id, slug, name) values
  ('30000000-0000-4000-8000-000000000001', 'purge-org', 'Purge Org');

insert into public.events (id, org_id, slug, name, kind, status, starts_at,
  ends_at, retention_months) values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
    'old-conference', 'Old Conference', 'in_person', 'completed',
    now() - interval '8 months', now() - interval '8 months' + interval '2 days', 6),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001',
    'archived-old', 'Archived Old', 'webinar', 'completed',
    now() - interval '9 months', now() - interval '9 months' + interval '1 day', 6),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001',
    'fresh-event', 'Fresh Event', 'webinar', 'registration_open',
    now() + interval '30 days', now() + interval '30 days' + interval '2 hours', 6);

set local role service_role;
insert into public.registrations (org_id, event_id, code, email, first_name,
  last_name, status, consent_at, consent_version)
values
  ('30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
    'OLDONE01', 'old1@example.org', 'Old', 'One', 'confirmed', now(), 'v1'),
  ('30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002',
    'ARCHIVE1', 'arc1@example.org', 'Arc', 'One', 'confirmed', now(), 'v1'),
  ('30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003',
    'FRESH001', 'new1@example.org', 'New', 'One', 'pending', now(), 'v1');

insert into public.message_jobs (org_id, event_id, channel, template_key, kind)
values ('30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001', 'email', 'custom', 'bulk');
insert into public.message_job_items (org_id, event_id, job_id, channel,
  template_key, recipient, registration_id, idempotency_key, priority)
select j.org_id, j.event_id, j.id, 'email', 'custom', 'old1@example.org',
  (select id from public.registrations
    where event_id = '31000000-0000-4000-8000-000000000001'
      and code = 'OLDONE01'), 'item:oldone01', 1
  from public.message_jobs j
  where j.event_id = '31000000-0000-4000-8000-000000000001';

insert into public.bulk_action_intents (org_id, event_id, action, audience,
  subject, body, count, selection_hash, created_by)
values ('30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001', 'message', '{confirmed}',
  'Old subject', 'Old body', 1,  'hash-old',
  '00000000-0000-4000-8000-0000000000b1');
reset role;

-- Rows are in; now archive the second event so the purge must work
-- despite the archived write guard.
update public.events set status = 'archived'
 where id = '31000000-0000-4000-8000-000000000002';

select is(
  (public.purge_due_event_data(50) ->> 'events_purged')::int, 2,
  'both past-retention events purged (including the archived one)');

select is((select count(*)::int from public.registrations
  where event_id = '31000000-0000-4000-8000-000000000001'), 0,
  'past-due event has no registrations left');
select is((select count(*)::int from public.message_jobs
  where event_id = '31000000-0000-4000-8000-000000000001'), 0,
  'message jobs purged');
select is((select count(*)::int from public.message_job_items
  where event_id = '31000000-0000-4000-8000-000000000001'), 0,
  'message items purged');
select is((select count(*)::int from public.bulk_action_intents
  where event_id = '31000000-0000-4000-8000-000000000001'), 0,
  'bulk intents purged');
select is((select count(*)::int from public.registration_status_history
  where event_id = '31000000-0000-4000-8000-000000000001'), 0,
  'status history purged with the registrations');
select is((select purged_at is not null from public.events
  where id = '31000000-0000-4000-8000-000000000001'), true,
  'event marked purged');
select is((select count(*)::int from public.registrations
  where event_id = '31000000-0000-4000-8000-000000000003'), 1,
  'future event keeps its registrations');
select is((select count(*)::int from public.audit_log
  where action = 'event.data_purged'), 2,
  'purges are audited');

select is(
  (public.purge_due_event_data(50) ->> 'events_purged')::int, 0,
  'second run is a no-op (idempotent)');
select is((select count(*)::int from public.audit_log
  where action = 'event.data_purged'), 2,
  'no duplicate audit rows on re-run');

-- Second archived event, NOT past retention: its rows must survive and keep
-- the archived write guard. Rows go in while it is live, then it archives.
insert into public.events (id, org_id, slug, name, kind, status, starts_at,
  ends_at, retention_months) values
  ('31000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001',
    'archived-fresh', 'Archived Fresh', 'webinar', 'live',
    now() + interval '30 days', now() + interval '30 days' + interval '1 hour', 6);

set local role service_role;
insert into public.registrations (org_id, event_id, code, email, first_name,
  last_name, status, consent_at, consent_version) values
  ('30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000004',
   'ARCHIVE2', 'arc2@example.org', 'Arc', 'Two', 'confirmed', now(), 'v1');
reset role;

update public.events set status = 'archived'
 where id = '31000000-0000-4000-8000-000000000004';

-- Guards stay on outside the purge transaction.
select throws_ok(
  $$ delete from public.registrations
     where event_id = '31000000-0000-4000-8000-000000000004' $$,
  '42501', null, 'archived event still refuses direct deletes');

set local role authenticated;
select throws_ok(
  $$ select public.purge_due_event_data(50) $$,
  '42501', null, 'authenticated cannot call the purge');
reset role;

select * from finish();
rollback;
