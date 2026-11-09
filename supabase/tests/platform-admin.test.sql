-- Platform administration RPCs (docs/system-design.md §6.5, §14).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'super@example.org'),
  ('00000000-0000-4000-8000-0000000000a2', 'orgadmin@example.org');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Org A');
insert into public.events (id, org_id, slug, name, kind) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'a-one', 'A One', 'webinar');
insert into public.memberships (user_id, scope, role, org_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'platform', 'super_admin', null),
  ('00000000-0000-4000-8000-0000000000a2', 'org', 'org_admin', '10000000-0000-4000-8000-000000000001');

create function pg_temp.act_as(p_user uuid, p_aal text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Org admin: cannot create orgs/events or change event settings.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2', 'aal2');
select throws_ok($$ select public.create_organization('new-org', 'New Org') $$,
  '42501', 'forbidden', 'org admin cannot create organisations');
select throws_ok($$ select public.create_event('10000000-0000-4000-8000-000000000001', 'x', 'X', 'webinar') $$,
  '42501', 'forbidden', 'org admin cannot create events');
select throws_ok($$ select public.update_event('20000000-0000-4000-8000-0000000000a1', '{"status":"registration_open"}') $$,
  '42501', 'forbidden', 'org admin cannot change event settings');
reset role;

-- Super admin without MFA: nothing.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', 'aal1');
select throws_ok($$ select public.create_organization('new-org', 'New Org') $$,
  '42501', 'forbidden', 'aal1 super admin cannot create organisations');
reset role;

-- Super admin with MFA.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', 'aal2');
select ok(public.create_organization('New-Org ', 'New Org') is not null, 'super admin creates an organisation');
select throws_ok($$ select public.create_organization('new-org', 'Again') $$,
  '23505', null, 'organisation slugs are unique');
select ok(
  public.create_event((select id from public.organizations where slug = 'new-org'),
    'launch', 'Launch', 'webinar', 'Asia/Kolkata') is not null,
  'super admin creates an event');
select is(
  (public.update_event('20000000-0000-4000-8000-0000000000a1',
    '{"status":"registration_open","capacity":100,"slug":"hacked"}')).status,
  'registration_open', 'super admin updates event settings');
reset role;

select is(
  (select slug || ':' || capacity from public.events where id = '20000000-0000-4000-8000-0000000000a1'),
  'a-one:100', 'slug is not editable; capacity is');

select * from finish();
rollback;
