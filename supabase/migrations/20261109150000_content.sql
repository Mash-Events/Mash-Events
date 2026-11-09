-- 0007 event content (docs/system-design.md §5.2, §10.1)
-- Speakers, sessions and sponsors per event, edited in admin and rendered by
-- the event's site code. Public pages read them only through
-- public_event_content(), which returns published, non-personal fields.

-- Fill org_id from the event so writers never supply tenancy columns.
-- Definer: it must see the event even when the writer cannot, so the RLS
-- policy (not this lookup) is what refuses writes to other events.
create or replace function app.fill_org_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.org_id into new.org_id from public.events e where e.id = new.event_id;
  if new.org_id is null then
    raise exception 'unknown event %', new.event_id using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create table public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  name text not null check (length(name) between 1 and 200),
  title text check (length(title) <= 200),
  affiliation text check (length(affiliation) <= 200),
  bio text check (length(bio) <= 4000),
  photo_path text check (length(photo_path) <= 500),
  sort integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  title text not null check (length(title) between 1 and 300),
  description text check (length(description) <= 4000),
  starts_at timestamptz,
  ends_at timestamptz,
  track text check (length(track) <= 100),
  room text check (length(room) <= 100),
  sort integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.event_session_speakers (
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  session_id uuid not null,
  speaker_id uuid not null,
  sort integer not null default 0,
  primary key (session_id, speaker_id),
  foreign key (session_id, event_id) references public.event_sessions (id, event_id) on delete cascade,
  foreign key (speaker_id, event_id) references public.event_speakers (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.event_sponsors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  name text not null check (length(name) between 1 and 200),
  tier text check (length(tier) <= 60),
  logo_path text check (length(logo_path) <= 500),
  url text check (url ~ '^https://' and length(url) <= 500),
  sort integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create index event_speakers_event_idx on public.event_speakers (event_id, sort);
create index event_sessions_event_idx on public.event_sessions (event_id, starts_at, sort);
create index event_sponsors_event_idx on public.event_sponsors (event_id, sort);

-- Triggers: org fill, updated_at, immutable tenancy, archived read-only.
do $$
declare
  t text;
begin
  foreach t in array array['event_speakers', 'event_sessions', 'event_session_speakers', 'event_sponsors'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function app.fill_org_from_event()', t || '_org', t);
    execute format('create trigger %I before update on public.%I for each row execute function app.prevent_tenancy_change()', t || '_tenancy', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function app.prevent_archived_write()', t || '_archived', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (event_id = (select app.pinned_event()) and (select app.has_event_permission(app.pinned_event(), %L)))',
      t || '_select', t, 'content.edit');
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (event_id = (select app.pinned_event()) and (select app.has_event_permission(app.pinned_event(), %L)))',
      t || '_insert', t, 'content.edit');
    execute format(
      'create policy %I on public.%I for update to authenticated using (event_id = (select app.pinned_event()) and (select app.has_event_permission(app.pinned_event(), %L))) with check (event_id = (select app.pinned_event()))',
      t || '_update', t, 'content.edit');
    execute format(
      'create policy %I on public.%I for delete to authenticated using (event_id = (select app.pinned_event()) and (select app.has_event_permission(app.pinned_event(), %L)))',
      t || '_delete', t, 'content.edit');
  end loop;
end;
$$;

create trigger event_speakers_updated_at before update on public.event_speakers
  for each row execute function app.set_updated_at();
create trigger event_sessions_updated_at before update on public.event_sessions
  for each row execute function app.set_updated_at();
create trigger event_sponsors_updated_at before update on public.event_sponsors
  for each row execute function app.set_updated_at();

-- Column-level write grants: never id, org_id, event_id or timestamps
-- (event_id defaults to the request's pinned event, org_id comes from it).
grant insert (name, title, affiliation, bio, photo_path, sort, visible),
      update (name, title, affiliation, bio, photo_path, sort, visible)
  on public.event_speakers to authenticated;
grant insert (title, description, starts_at, ends_at, track, room, sort, visible),
      update (title, description, starts_at, ends_at, track, room, sort, visible)
  on public.event_sessions to authenticated;
grant insert (session_id, speaker_id, sort), update (sort)
  on public.event_session_speakers to authenticated;
grant insert (name, tier, logo_path, url, sort, visible),
      update (name, tier, logo_path, url, sort, visible)
  on public.event_sponsors to authenticated;

-- Public, cacheable content for one event (anon; §10.1). Draft and archived
-- events return null; only visible rows and non-personal fields.
create or replace function public.public_event_content(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'name', e.name, 'short_name', e.short_name,
      'kind', e.kind, 'timezone', e.timezone, 'starts_at', e.starts_at,
      'ends_at', e.ends_at, 'status', e.status,
      'registration_open', e.status = 'registration_open'
        and (e.registration_opens_at is null or now() >= e.registration_opens_at)
        and (e.registration_closes_at is null or now() <= e.registration_closes_at),
      'registration_opens_at', e.registration_opens_at,
      'registration_closes_at', e.registration_closes_at,
      'org', jsonb_build_object('slug', o.slug, 'name', o.name)
    ),
    'speakers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'title', s.title,
        'affiliation', s.affiliation, 'bio', s.bio, 'photo_path', s.photo_path)
        order by s.sort, s.name)
      from public.event_speakers s where s.event_id = e.id and s.visible), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title,
        'description', x.description, 'starts_at', x.starts_at, 'ends_at', x.ends_at,
        'track', x.track, 'room', x.room,
        'speaker_ids', coalesce((select jsonb_agg(ss.speaker_id order by ss.sort)
                                 from public.event_session_speakers ss
                                 join public.event_speakers sp
                                   on sp.id = ss.speaker_id and sp.visible
                                 where ss.session_id = x.id), '[]'::jsonb))
        order by x.starts_at nulls last, x.sort)
      from public.event_sessions x where x.event_id = e.id and x.visible), '[]'::jsonb),
    'sponsors', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'tier', p.tier,
        'logo_path', p.logo_path, 'url', p.url) order by p.sort, p.name)
      from public.event_sponsors p where p.event_id = e.id and p.visible), '[]'::jsonb)
  )
  from public.events e
  join public.organizations o on o.id = e.org_id
  where e.id = p_event_id
    and e.status not in ('draft', 'archived')
    and o.status = 'active'
$$;

revoke execute on function public.public_event_content(uuid) from public;
grant execute on function public.public_event_content(uuid) to anon, authenticated, service_role;
