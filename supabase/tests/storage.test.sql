-- Storage buckets and policies (docs/system-design.md §12.3, S11).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Read the actual bucket rows without needing storage-role grants: the
-- fixtures below use policies on storage.objects, which is what matters.
select is(
  (select count(*)::int from storage.buckets where id in ('event-assets', 'event-private')),
  2, 'both buckets exist');

select is(
  (select bool_or(public) from storage.buckets where id = 'event-assets'),
  true, 'event-assets is public');
select is(
  (select bool_or(public) from storage.buckets where id = 'event-private'),
  false, 'event-private is private');

-- Fixture rows for the read policies.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'exporter@example.org');

insert into public.organizations (id, slug, name) values
  ('70000000-0000-4000-8000-000000000001', 'storage-org', 'Storage Org');

insert into public.events (id, org_id, slug, name, kind, status) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
    'storage-event', 'Storage Event', 'webinar', 'registration_open');

insert into public.memberships (user_id, scope, role, org_id, event_id) values
  ('00000000-0000-4000-8000-0000000000d1', 'event', 'reviewer',
   '70000000-0000-4000-8000-000000000001',
   '71000000-0000-4000-8000-000000000001');

insert into storage.objects (bucket_id, name, owner, metadata)
values
  ('event-assets', '71000000-0000-4000-8000-000000000001/speaker.png',
   '00000000-0000-4000-8000-0000000000d1', '{}'::jsonb),
  ('event-private', '71000000-0000-4000-8000-000000000001/exports/roster.csv',
   '00000000-0000-4000-8000-0000000000d1', '{}'::jsonb);

-- Public bucket: anon reads; nobody writes directly.
set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'event-assets'),
  1, 'anon can read public event assets');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'event-private'),
  0, 'anon cannot read private objects');
reset role;
set local role authenticated;
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('event-assets', '71000000-0000-4000-8000-000000000001/x.png',
       '00000000-0000-4000-8000-0000000000d1') $$,
  null, null, 'no direct inserts: writes go through the service role only');
reset role;

-- Private bucket: only a pinned workspace with exports.pii sees its files.
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

-- reviewer (no exports.pii) sees nothing even with the pin.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1', 'aal2',
  '71000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'event-private'),
  0, 'reviewer without exports.pii cannot read private objects');
reset role;

select * from finish();
rollback;
