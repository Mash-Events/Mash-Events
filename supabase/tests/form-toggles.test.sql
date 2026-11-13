-- 20261114090000: form toggles. submissions_open + submission_inbox_email
-- merge via update_event; public_event_content exposes the open/closed flag
-- (fail-open) but never the inbox address.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'super@example.org');

insert into public.organizations (id, slug, name) values
  ('41000000-0000-4000-8000-000000000001', 'form-org', 'Form Org');

insert into public.events (id, org_id, slug, name, kind, status, timezone,
  starts_at, ends_at) values
  ('42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001',
    'form-ev', 'Form Event', 'in_person', 'published', 'Asia/Kolkata',
    now() + interval '2 days', now() + interval '3 days');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000d1', 'platform', 'super_admin', null, null);

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

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1',
                      '42000000-0000-4000-8000-000000000001');

-- 1. Default state is open: no key in settings, public content says open.
select is(
  (public.public_event_content('42000000-0000-4000-8000-000000000001')
     -> 'event' ->> 'submissions_open'),
  'true',
  'absent key means open (fail-open)'
);

-- 2. Closing the form via update_event persists the flag.
select public.update_event('42000000-0000-4000-8000-000000000001',
  '{"submissions_open": false, "submission_inbox_email": "team@example.org"}'::jsonb);
select is(
  (public.public_event_content('42000000-0000-4000-8000-000000000001')
     -> 'event' ->> 'submissions_open'),
  'false',
  'closed form is visible in public content'
);

-- 3. The inbox email stays PRIVATE (not in public content) but is stored.
select is(
  (select settings ->> 'submission_inbox_email' from public.events
   where id = '42000000-0000-4000-8000-000000000001'),
  'team@example.org',
  'inbox email stored in settings'
);
select is(
  (public.public_event_content('42000000-0000-4000-8000-000000000001')
     -> 'event' ->> 'submission_inbox_email'),
  null,
  'inbox email never exposed publicly'
);

-- 4. Invalid inbox email is rejected.
select throws_ok(
  'select public.update_event(''42000000-0000-4000-8000-000000000001'',
     ''{"submission_inbox_email": "not-an-email"}''::jsonb)',
  '23514', 'submission_inbox_email must be an email address',
  'invalid inbox email rejected'
);

-- 5. Empty string clears the inbox email (null) without touching the flag.
select public.update_event('42000000-0000-4000-8000-000000000001',
  '{"submission_inbox_email": ""}'::jsonb);
select is(
  (select settings ->> 'submission_inbox_email' from public.events
   where id = '42000000-0000-4000-8000-000000000001'),
  null,
  'empty inbox email clears the value'
);

select * from finish();
rollback;
