-- 0002 platform tables (docs/system-design.md §3, §5.1, §5.6)

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  name text not null check (length(name) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'suspended')),
  brand jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  name text not null check (length(name) between 1 and 200),
  short_name text check (length(short_name) <= 60),
  kind text not null check (kind in ('in_person', 'webinar', 'hybrid')),
  timezone text not null default 'Asia/Kolkata',
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (
    status in ('draft', 'published', 'registration_open', 'registration_closed',
               'live', 'completed', 'archived')
  ),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  waitlist_enabled boolean not null default false,
  review_mode text not null default 'manual' check (review_mode in ('manual', 'auto_confirm')),
  settings jsonb not null default '{}'::jsonb,
  pass_key_version integer not null default 1 check (pass_key_version > 0),
  retention_months integer not null default 6 check (retention_months between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  unique (id, org_id),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index events_org_idx on public.events (org_id);

-- Mirrors core/auth/permissions.ts (a test keeps the two identical).
create table public.role_permissions (
  role text not null check (role in ('super_admin', 'org_admin', 'reviewer', 'checkin_staff')),
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission) values
  ('super_admin', 'events.manage'),
  ('super_admin', 'members.manage'),
  ('super_admin', 'content.edit'),
  ('super_admin', 'registrations.read'),
  ('super_admin', 'registrations.review'),
  ('super_admin', 'messages.send'),
  ('super_admin', 'messages.bulk'),
  ('super_admin', 'exports.pii'),
  ('super_admin', 'checkin.scan'),
  ('super_admin', 'audit.read'),
  ('org_admin', 'content.edit'),
  ('org_admin', 'registrations.read'),
  ('org_admin', 'registrations.review'),
  ('org_admin', 'messages.send'),
  ('org_admin', 'messages.bulk'),
  ('org_admin', 'exports.pii'),
  ('org_admin', 'checkin.scan'),
  ('org_admin', 'audit.read'),
  ('reviewer', 'registrations.read'),
  ('reviewer', 'registrations.review'),
  ('checkin_staff', 'checkin.scan');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('platform', 'org', 'event')),
  org_id uuid references public.organizations (id),
  event_id uuid,
  role text not null check (role in ('super_admin', 'org_admin', 'reviewer', 'checkin_staff')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  foreign key (event_id, org_id) references public.events (id, org_id),
  check (
    (scope = 'platform' and org_id is null and event_id is null and role = 'super_admin')
    or (scope = 'org' and org_id is not null and event_id is null and role in ('org_admin', 'reviewer'))
    or (scope = 'event' and org_id is not null and event_id is not null and role in ('reviewer', 'checkin_staff'))
  )
);
-- One live membership per user and scope.
create unique index memberships_live_uq on public.memberships (
  user_id,
  scope,
  coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where revoked_at is null;
create index memberships_user_live_idx on public.memberships (user_id) where revoked_at is null;

create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  email_lower text not null check (email_lower = lower(email_lower)),
  scope text not null check (scope in ('platform', 'org', 'event')),
  org_id uuid references public.organizations (id),
  event_id uuid,
  role text not null check (role in ('super_admin', 'org_admin', 'reviewer', 'checkin_staff')),
  invited_by uuid references auth.users (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'sent' check (status in ('sent', 'accepted', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id),
  event_id uuid references public.events (id),
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'system', 'webhook')),
  action text not null,
  target_table text,
  target_id text,
  request_id text,
  ip_hash text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_event_idx on public.audit_log (event_id, created_at desc);

-- Triggers.
create trigger organizations_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function app.set_updated_at();

-- An event never moves to another org.
create or replace function app.prevent_event_org_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'events.org_id is immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger events_org_immutable before update on public.events
  for each row execute function app.prevent_event_org_change();

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function app.prevent_append_only_change();

-- Archived events are read-only (§12.10). Attached to event-scoped tables as
-- they are created in later migrations.
create or replace function app.prevent_archived_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
begin
  if exists (select 1 from public.events e where e.id = v_event and e.status = 'archived') then
    raise exception 'event % is archived (read-only)', v_event
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

-- RLS on (and forced) everywhere; policies come in the access migration.
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.events enable row level security;
alter table public.events force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
alter table public.member_invites enable row level security;
alter table public.member_invites force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

revoke all on public.organizations, public.events, public.role_permissions,
  public.memberships, public.member_invites, public.audit_log from anon, authenticated;
