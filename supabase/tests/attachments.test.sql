-- 20261113200000: message attachments. Agenda PDFs on reminder/bulk mail;
-- attachment kinds flow intent -> job -> claim -> drainer.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'super@example.org');

insert into public.organizations (id, slug, name) values
  ('31000000-0000-4000-8000-000000000001', 'att-org', 'Attach Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at) values
  ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
    'att-ev', 'Attach Event', 'in_person', 'live', 'Asia/Kolkata',
    now() + interval '2 days', now() + interval '3 days');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000c1', 'platform', 'super_admin', null, null);

insert into public.registrations (org_id, event_id, code, email, first_name,
  status, consent_at, consent_version) values
  ('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001',
    'ATTACH01', 'att@example.org', 'Ada', 'confirmed', now(), 'test');

insert into public.event_sessions (id, org_id, event_id, title, starts_at,
  ends_at, visible) values
  ('33000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001', 'Welcome keynote',
    now() + interval '2 days', now() + interval '2 days' + interval '1 hour', true);

create function pg_temp.act_as(p_user uuid, p_event uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.headers',
    json_build_object('x-mash-event', coalesce(p_event::text, ''))::text, true);
  execute 'set local role authenticated';
end;
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1',
                      '32000000-0000-4000-8000-000000000001');

-- 1. create_message_intent accepts agenda_pdf and counts the audience.
select is(
  (public.create_message_intent(
     '32000000-0000-4000-8000-000000000001',
     array['confirmed'], 'Agenda attached', 'See the attached agenda.',
     false, null, '["agenda_pdf"]'::jsonb
   ) ->> 'count')::int,
  1,
  'intent created with attachment'
);

-- 2. The intent row carries the attachments.
select is(
  attachments::text,
  '["agenda_pdf"]',
  'intent stores agenda_pdf'
)
from public.bulk_action_intents
where event_id = '32000000-0000-4000-8000-000000000001';

-- 3. Unknown attachment kinds are rejected.
select throws_ok(
  'select public.create_message_intent(
     ''32000000-0000-4000-8000-000000000001'', array[''confirmed''], ''x'', ''y'',
     false, null, ''["trojan.pdf"]''::jsonb)',
  '23514', 'invalid attachments',
  'unknown attachment kinds rejected'
);

-- 4. Full pipeline: test, confirm, and confirm the job inherited the kind.
select public.mark_message_intent_tested(
  '32000000-0000-4000-8000-000000000001',
  (select id from public.bulk_action_intents
   where event_id = '32000000-0000-4000-8000-000000000001')
);
select public.confirm_message_intent(
  '32000000-0000-4000-8000-000000000001',
  (select id from public.bulk_action_intents
   where event_id = '32000000-0000-4000-8000-000000000001'),
  'Attach Event',
  (select selection_hash from public.bulk_action_intents
   where event_id = '32000000-0000-4000-8000-000000000001')
);

select is(
  attachments::text,
  '["agenda_pdf"]',
  'job inherits agenda_pdf from intent'
)
from public.message_jobs
where event_id = '32000000-0000-4000-8000-000000000001';

-- 5. The claim exposes the attachments to the drainer.
set role service_role;
select is(
  attachments::text,
  '["agenda_pdf"]',
  'claim exposes attachments'
)
from public.claim_message_items('32000000-0000-4000-8000-000000000001', 'email', 10);
reset role;

-- 6. More than 4 attachments rejected by the constraint.
select throws_ok(
  'update public.message_jobs set attachments =
     ''["agenda_pdf","agenda_pdf","agenda_pdf","agenda_pdf","agenda_pdf"]''::jsonb
   where event_id = ''32000000-0000-4000-8000-000000000001''',
  '23514',
  'new row for relation "message_jobs" violates check constraint "message_jobs_attachments_check"',
  'more than 4 attachments rejected'
);

-- 7. Non-array attachments rejected.
select throws_ok(
  'update public.bulk_action_intents set attachments = ''"agenda_pdf"''::jsonb
   where event_id = ''32000000-0000-4000-8000-000000000001''',
  '23514',
  'new row for relation "bulk_action_intents" violates check constraint "bulk_action_intents_attachments_check"',
  'non-array attachments rejected'
);

-- 8. A second intent without attachments stores an empty array.
select is(
  (public.create_message_intent(
     '32000000-0000-4000-8000-000000000001',
     array['confirmed'], 'No attachments', 'Plain body.', false, null, '[]'::jsonb
   ) ->> 'count')::int,
  1,
  'intent without attachments still works'
);
select is(
  jsonb_array_length(attachments),
  0,
  'default attachments is an empty array'
)
from public.bulk_action_intents
where event_id = '32000000-0000-4000-8000-000000000001'
  and subject = 'No attachments';

-- 9. Bulk/reminder intent via the default (no p_attachments argument).
select is(
  (public.create_message_intent(
     '32000000-0000-4000-8000-000000000001',
     array['confirmed'], 'Default call', 'Plain body.'
   ) ->> 'count')::int,
  1,
  'attachments argument optional'
);

select * from finish();
rollback;
