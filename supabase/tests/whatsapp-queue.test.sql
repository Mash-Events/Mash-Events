-- WhatsApp queue (docs/system-design.md §8.1, migration 20261111150000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'wa-admin@example.org');

insert into public.organizations (id, slug, name) values
  ('80000000-0000-4000-8000-000000000001', 'wa-org', 'WA Org');

insert into public.events (id, org_id, slug, name, kind, status, review_mode) values
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
    'wa-auto', 'WA Auto', 'webinar', 'registration_open', 'auto_confirm'),
  ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001',
    'wa-manual', 'WA Manual', 'in_person', 'registration_open', 'manual'),
  ('81000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001',
    'wa-off', 'WA Off', 'webinar', 'registration_open', 'auto_confirm');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'event', 'reviewer',
   '80000000-0000-4000-8000-000000000001',
   '81000000-0000-4000-8000-000000000002');

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

-- Opted-in, auto-confirm: email AND whatsapp items for the confirmation.
set local role service_role;
select is(
  public.submit_registration('81000000-0000-4000-8000-000000000001',
    jsonb_build_object('email', 'optin@example.org', 'first_name', 'Opt',
      'last_name', 'In', 'phone_e164', '+919900000001',
      'whatsapp_opt_in', true), 'v1') ->> 'result',
  'created', 'opted-in registration created');
select is(
  (select count(*)::int from public.message_job_items
    where event_id = '81000000-0000-4000-8000-000000000001'
      and channel = 'whatsapp' and template_key = 'confirmed'),
  1, 'opted-in confirmation queues exactly one WhatsApp item');
select is(
  (select recipient from public.message_job_items
    where event_id = '81000000-0000-4000-8000-000000000001'
      and channel = 'whatsapp'),
  '+919900000001', 'WhatsApp recipient is the phone number');

-- No opt-in: no WhatsApp items at all.
select is(
  public.submit_registration('81000000-0000-4000-8000-000000000003',
    jsonb_build_object('email', 'optout@example.org', 'first_name', 'Opt',
      'last_name', 'Out', 'phone_e164', '+919900000002'), 'v1') ->> 'result',
  'created', 'registration without opt-in created');
select is(
  (select count(*)::int from public.message_job_items
    where event_id = '81000000-0000-4000-8000-000000000003'
      and channel = 'whatsapp'),
  0, 'no opt-in means no WhatsApp items');

-- Manual review: confirm queues WhatsApp for the opted-in registration.
select is(
  public.submit_registration('81000000-0000-4000-8000-000000000002',
    jsonb_build_object('email', 'manual@example.org', 'first_name', 'Man',
      'last_name', 'Ual', 'phone_e164', '+919900000003',
      'whatsapp_opt_in', true), 'v1') ->> 'result',
  'created', 'manual-review registration created');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1', 'aal2',
  '81000000-0000-4000-8000-000000000002');
select is(
  public.transition_registration('81000000-0000-4000-8000-000000000002',
    (select id from public.registrations
      where event_id = '81000000-0000-4000-8000-000000000002'
        and email = 'manual@example.org'),
    'confirmed', null, null) ->> 'result',
  'updated', 'reviewer confirms the registration');
select is(
  (select count(*)::int from public.message_job_items
    where event_id = '81000000-0000-4000-8000-000000000002'
      and channel = 'whatsapp' and template_key = 'confirmed'),
  1, 'manual confirmation also queues WhatsApp');
reset role;

-- A disabled WhatsApp template suppresses the item.
set local role service_role;
insert into public.event_message_templates (org_id, event_id, channel,
  template_key, enabled)
values ('80000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001', 'whatsapp', 'confirmed', false);
select is(
  public.submit_registration('81000000-0000-4000-8000-000000000001',
    jsonb_build_object('email', 'blocked@example.org', 'first_name', 'Block',
      'last_name', 'Ed', 'phone_e164', '+919900000004',
      'whatsapp_opt_in', true), 'v1') ->> 'result',
  'created', 'registration with disabled WhatsApp template created');
select is(
  (select count(*)::int from public.message_job_items
    where event_id = '81000000-0000-4000-8000-000000000001'
      and channel = 'whatsapp' and template_key = 'confirmed'),
  1, 'disabled template queues nothing new');
reset role;

select * from finish();
rollback;
