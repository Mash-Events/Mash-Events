-- 0005 registration (docs/system-design.md §5.3, §5.7, §7, §12)
-- Event-scoped tables with composite keys, pinned RLS (read-only for
-- authenticated) and definer RPCs for every write.

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9]{8}$'),
  email text not null check (length(email) between 3 and 320 and position('@' in email) > 1),
  first_name text not null check (length(first_name) between 1 and 100),
  last_name text not null default '' check (length(last_name) <= 100),
  organisation text check (length(organisation) <= 200),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_opt_in_at timestamptz,
  whatsapp_opt_in_version text,
  category text check (length(category) <= 100),
  answers jsonb not null default '{}'::jsonb check (pg_column_size(answers) <= 16384),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'waitlisted', 'rejected', 'cancelled')),
  status_changed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  consent_at timestamptz not null,
  consent_version text not null check (length(consent_version) between 1 and 40),
  source text not null default 'web' check (source in ('web', 'admin', 'spot', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  unique (event_id, code),
  foreign key (event_id, org_id) references public.events (id, org_id),
  check (whatsapp_opt_in_at is null or phone_e164 is not null)
);
create unique index registrations_event_email_uq on public.registrations (event_id, lower(email));
create index registrations_event_status_idx on public.registrations (event_id, status, created_at desc);

create table public.registration_status_history (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  event_id uuid not null,
  registration_id uuid not null,
  from_status text,
  to_status text not null,
  reason text check (length(reason) <= 500),
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  foreign key (registration_id, event_id) references public.registrations (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index registration_status_history_reg_idx
  on public.registration_status_history (event_id, registration_id, created_at desc);

create table public.review_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  registration_id uuid not null,
  body text not null check (length(body) between 1 and 2000),
  author_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (registration_id, event_id) references public.registrations (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index review_notes_reg_idx on public.review_notes (event_id, registration_id, created_at desc);

-- Triggers: updated_at, immutable tenancy, archived read-only, append-only history.
create trigger registrations_updated_at before update on public.registrations
  for each row execute function app.set_updated_at();

create trigger registrations_tenancy before update on public.registrations
  for each row execute function app.prevent_tenancy_change();
create trigger registration_status_history_tenancy before update on public.registration_status_history
  for each row execute function app.prevent_tenancy_change();
create trigger review_notes_tenancy before update on public.review_notes
  for each row execute function app.prevent_tenancy_change();

create trigger registrations_archived before insert or update or delete on public.registrations
  for each row execute function app.prevent_archived_write();
create trigger registration_status_history_archived before insert or update or delete on public.registration_status_history
  for each row execute function app.prevent_archived_write();
create trigger review_notes_archived before insert or update or delete on public.review_notes
  for each row execute function app.prevent_archived_write();

create trigger registration_status_history_append_only before update or delete on public.registration_status_history
  for each row execute function app.prevent_append_only_change();

-- RLS: forced; authenticated may only read the pinned event, with permission.
alter table public.registrations enable row level security;
alter table public.registrations force row level security;
alter table public.registration_status_history enable row level security;
alter table public.registration_status_history force row level security;
alter table public.review_notes enable row level security;
alter table public.review_notes force row level security;

revoke all on public.registrations, public.registration_status_history,
  public.review_notes from anon, authenticated;
grant select on public.registrations, public.registration_status_history,
  public.review_notes to authenticated;

create policy registrations_select on public.registrations for select to authenticated
  using (event_id = (select app.pinned_event())
         and (select app.has_event_permission(app.pinned_event(), 'registrations.read')));
create policy registration_status_history_select on public.registration_status_history
  for select to authenticated
  using (event_id = (select app.pinned_event())
         and (select app.has_event_permission(app.pinned_event(), 'registrations.read')));
create policy review_notes_select on public.review_notes for select to authenticated
  using (event_id = (select app.pinned_event())
         and (select app.has_event_permission(app.pinned_event(), 'registrations.read')));

-- Guard used by every definer RPC callable by authenticated (§5.7).
create or replace function app.require_event_access(p_event_id uuid, p_perm text)
returns public.events
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if p_event_id is null or p_event_id is distinct from app.pinned_event() then
    raise exception 'event pin mismatch' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_event_permission(p_event_id, p_perm) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_event from public.events where id = p_event_id;
  return v_event;
end;
$$;
revoke execute on function app.require_event_access(uuid, text) from public, anon;
grant execute on function app.require_event_access(uuid, text) to authenticated;

-- 8-character code from an unambiguous alphabet (no 0/O/1/I).
create or replace function app.new_registration_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (b % 32), 1), '')
  from (select get_byte(extensions.gen_random_bytes(8), i) as b
        from generate_series(0, 7) as i) as bytes
$$;
revoke execute on function app.new_registration_code() from public, anon, authenticated;

-- Allowed status transitions (mirrored in core/registration/transitions.ts).
create or replace function app.registration_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('pending', 'confirmed'), ('pending', 'waitlisted'), ('pending', 'rejected'), ('pending', 'cancelled'),
    ('waitlisted', 'confirmed'), ('waitlisted', 'rejected'), ('waitlisted', 'cancelled'),
    ('confirmed', 'cancelled'), ('confirmed', 'waitlisted'),
    ('rejected', 'pending'),
    ('cancelled', 'pending')
  )
$$;

-- Public registration (§7). Called only by the server route, as service_role,
-- after Turnstile and rate limits. The event id comes from host + slug.
-- Returns {result: created|duplicate|closed|full|not_found, ...}.
create or replace function public.submit_registration(
  p_event_id uuid,
  p_payload jsonb,
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_email text := lower(trim(p_payload ->> 'email'));
  v_existing uuid;
  v_status text := 'pending';
  v_confirmed integer;
  v_id uuid;
  v_code text;
  v_attempt integer := 0;
  v_whatsapp boolean := coalesce((p_payload ->> 'whatsapp_opt_in')::boolean, false);
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_event.status <> 'registration_open'
     or (v_event.registration_opens_at is not null and now() < v_event.registration_opens_at)
     or (v_event.registration_closes_at is not null and now() > v_event.registration_closes_at) then
    return jsonb_build_object('result', 'closed');
  end if;

  -- One registration per (event, email); concurrent submits for this event
  -- serialise here so capacity and dedupe stay exact.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  select id into v_existing from public.registrations
   where event_id = p_event_id and lower(email) = v_email;
  if found then
    return jsonb_build_object('result', 'duplicate', 'registration_id', v_existing);
  end if;

  if v_event.review_mode = 'auto_confirm' then
    select count(*) into v_confirmed from public.registrations
     where event_id = p_event_id and status = 'confirmed';
    if v_event.capacity is null or v_confirmed < v_event.capacity then
      v_status := 'confirmed';
    elsif v_event.waitlist_enabled then
      v_status := 'waitlisted';
    else
      return jsonb_build_object('result', 'full');
    end if;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := app.new_registration_code();
    begin
      insert into public.registrations (
        org_id, event_id, code, email, first_name, last_name, organisation,
        phone_e164, whatsapp_opt_in_at, whatsapp_opt_in_version, category,
        answers, status, consent_at, consent_version, source
      ) values (
        v_event.org_id, p_event_id, v_code, trim(p_payload ->> 'email'),
        trim(p_payload ->> 'first_name'), coalesce(trim(p_payload ->> 'last_name'), ''),
        nullif(trim(p_payload ->> 'organisation'), ''),
        nullif(p_payload ->> 'phone_e164', ''),
        case when v_whatsapp then now() end,
        case when v_whatsapp then p_consent_version end,
        nullif(trim(p_payload ->> 'category'), ''),
        coalesce(p_payload -> 'answers', '{}'::jsonb),
        v_status, now(), p_consent_version, 'web'
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- Only a code collision is retried; an email race is a duplicate.
      if exists (select 1 from public.registrations
                 where event_id = p_event_id and lower(email) = v_email) then
        return jsonb_build_object('result', 'duplicate');
      end if;
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;

  insert into public.registration_status_history (org_id, event_id, registration_id,
    from_status, to_status, reason)
  values (v_event.org_id, p_event_id, v_id, null, v_status, 'submitted');

  return jsonb_build_object('result', 'created', 'registration_id', v_id,
    'code', v_code, 'status', v_status);
end;
$$;
revoke execute on function public.submit_registration(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.submit_registration(uuid, jsonb, text) to service_role;

-- Review decision (§7). Optimistic concurrency via p_expected_updated_at.
create or replace function public.transition_registration(
  p_event_id uuid,
  p_registration_id uuid,
  p_to text,
  p_reason text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_row public.registrations;
  v_from text;
begin
  v_event := app.require_event_access(p_event_id, 'registrations.review');

  select * into v_row from public.registrations
   where id = p_registration_id and event_id = p_event_id
   for update;
  if not found then
    raise exception 'registration not found' using errcode = 'no_data_found';
  end if;
  if p_expected_updated_at is not null and v_row.updated_at <> p_expected_updated_at then
    return jsonb_build_object('result', 'stale', 'status', v_row.status,
      'updated_at', v_row.updated_at);
  end if;
  if v_row.status = p_to then
    return jsonb_build_object('result', 'unchanged', 'status', v_row.status,
      'updated_at', v_row.updated_at);
  end if;
  if not app.registration_transition_allowed(v_row.status, p_to) then
    raise exception 'transition % -> % not allowed', v_row.status, p_to
      using errcode = 'check_violation';
  end if;

  v_from := v_row.status;
  update public.registrations
     set status = p_to, status_changed_at = now(), reviewed_by = auth.uid()
   where id = v_row.id and event_id = p_event_id
  returning * into v_row;

  insert into public.registration_status_history (org_id, event_id, registration_id,
    from_status, to_status, reason, actor_user_id)
  values (v_event.org_id, p_event_id, v_row.id, v_from, p_to,
    left(p_reason, 500), auth.uid());

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind, action,
    target_table, target_id, summary)
  values (v_event.org_id, p_event_id, auth.uid(), 'user', 'registration.status',
    'registrations', v_row.id::text, jsonb_build_object('to', p_to));

  return jsonb_build_object('result', 'updated', 'status', v_row.status,
    'updated_at', v_row.updated_at);
end;
$$;

create or replace function public.add_review_note(
  p_event_id uuid,
  p_registration_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_id uuid;
begin
  v_event := app.require_event_access(p_event_id, 'registrations.review');
  if not exists (select 1 from public.registrations
                 where id = p_registration_id and event_id = p_event_id) then
    raise exception 'registration not found' using errcode = 'no_data_found';
  end if;
  insert into public.review_notes (org_id, event_id, registration_id, body, author_user_id)
  values (v_event.org_id, p_event_id, p_registration_id, trim(p_body), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Counts per status for the pinned event (invoker: RLS applies).
create or replace function public.registration_summary(p_event_id uuid)
returns table (status text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.status, count(*)
  from public.registrations r
  where r.event_id = p_event_id
  group by r.status
$$;

revoke execute on function public.transition_registration(uuid, uuid, text, text, timestamptz),
  public.add_review_note(uuid, uuid, text),
  public.registration_summary(uuid) from public, anon;
grant execute on function public.transition_registration(uuid, uuid, text, text, timestamptz),
  public.add_review_note(uuid, uuid, text),
  public.registration_summary(uuid) to authenticated;
