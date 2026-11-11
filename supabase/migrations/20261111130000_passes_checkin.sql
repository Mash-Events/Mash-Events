-- 0012 passes and check-in (docs/system-design.md §5.4, §9.1, §9.2, §12.7):
-- in-person phase 2b, migrated early so the schema guards cover it. QR passes
-- store only sha256(token); scanner sessions are bound to one event; every
-- scan attempt is logged. All writes go through the RPCs.

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  registration_id uuid not null,
  token_hash bytea not null,
  key_version integer not null default 1 check (key_version > 0),
  kind text not null check (kind in ('qr', 'webinar_link')),
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, token_hash),
  unique (id, event_id),
  foreign key (registration_id, event_id)
    references public.registrations (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);
-- One live pass per registration and kind; reissues revoke the previous row.
create unique index passes_one_issued
  on public.passes (event_id, registration_id, kind) where status = 'issued';

create table public.checkin_devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  label text not null check (length(label) between 1 and 200),
  device_secret_hash bytea not null,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  registration_id uuid not null,
  pass_id uuid,
  device_id uuid,
  event_day date not null,
  method text not null default 'qr' check (method in ('qr', 'manual', 'spot')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, registration_id, event_day),
  foreign key (registration_id, event_id)
    references public.registrations (id, event_id) on delete cascade,
  foreign key (pass_id, event_id) references public.passes (id, event_id),
  foreign key (device_id, event_id)
    references public.checkin_devices (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.scan_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  device_id uuid,
  registration_id uuid,
  outcome text not null check (outcome in
    ('checked_in', 'already_checked_in', 'pass_not_found', 'pass_revoked',
     'registration_not_confirmed', 'device_rejected', 'event_closed')),
  reason text check (length(reason) <= 200),
  created_at timestamptz not null default now(),
  foreign key (device_id, event_id)
    references public.checkin_devices (id, event_id) on delete set null,
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index scan_log_event_idx on public.scan_log (event_id, created_at desc);
create index passes_event_idx on public.passes (event_id, registration_id);
create index check_ins_event_idx on public.check_ins (event_id, event_day);

-- Standard treatment: org fill, updated_at, immutable tenancy, archived
-- read-only, RLS on and forced, select-only for authenticated.
do $$
declare
  t text;
begin
  foreach t in array array['passes', 'checkin_devices', 'check_ins', 'scan_log'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function app.fill_org_from_event()', t || '_org', t);
    execute format('create trigger %I before update on public.%I for each row execute function app.prevent_tenancy_change()', t || '_tenancy', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function app.prevent_archived_write()', t || '_archived', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (event_id = (select app.pinned_event()) and (select app.has_event_permission(app.pinned_event(), %L)))',
      t || '_select', t, 'checkin.scan');
  end loop;
end;
$$;

create trigger passes_updated_at before update on public.passes
  for each row execute function app.set_updated_at();
create trigger checkin_devices_updated_at before update on public.checkin_devices
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- RPCs (§5.7, §9.1, §9.2, S14). record_check_in re-checks the device secret,
-- the event, and the pass itself: app-level checks are convenience only.

-- Issue (or return the live) pass for a registration. Service role: called
-- from the confirmation flow with a token hash the app computed.
create or replace function public.issue_pass(
  p_event_id uuid, p_registration_id uuid, p_token_hash bytea,
  p_kind text, p_key_version integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  select status into v_status from public.registrations
   where id = p_registration_id and event_id = p_event_id;
  if v_status is null or v_status <> 'confirmed' then
    raise exception 'registration is not confirmed for this event'
      using errcode = 'no_data_found';
  end if;

  insert into public.passes (org_id, event_id, registration_id, token_hash,
    key_version, kind)
  select e.org_id, p_event_id, p_registration_id, p_token_hash,
    greatest(p_key_version, 1), p_kind
  from public.events e where e.id = p_event_id
  on conflict (event_id, token_hash) do update set updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Revoke a pass (admin action, audited).
create or replace function public.revoke_pass(p_event_id uuid, p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_event_permission(p_event_id, 'events.manage') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update public.passes
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where id = p_pass_id and event_id = p_event_id and status = 'issued';
  if not found then
    raise exception 'pass not found or already revoked'
      using errcode = 'no_data_found';
  end if;
  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id)
  select org_id, p_event_id, auth.uid(), 'user', 'pass.revoked', 'passes',
    p_pass_id::text
  from public.events where id = p_event_id;
end;
$$;

-- A scanner session, bound to one event. The raw secret never leaves the
-- scanner page; only its sha256 is stored.
create or replace function public.create_checkin_device(
  p_event_id uuid, p_label text, p_device_secret_hash bytea,
  p_expires_hours integer default 12
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.has_event_permission(p_event_id, 'checkin.scan') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if length(p_device_secret_hash) <> 32 then
    raise exception 'device secret hash must be sha256'
      using errcode = 'check_violation';
  end if;

  insert into public.checkin_devices (org_id, event_id, label,
    device_secret_hash, created_by, expires_at)
  select e.org_id, p_event_id, p_label, p_device_secret_hash, auth.uid(),
    now() + make_interval(hours => greatest(p_expires_hours, 1))
  from public.events e where e.id = p_event_id
  returning id into v_id;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  select org_id, p_event_id, auth.uid(), 'user', 'checkin_device.created',
    'checkin_devices', v_id::text, jsonb_build_object('label', p_label)
  from public.events where id = p_event_id;
  return v_id;
end;
$$;

create or replace function public.revoke_checkin_device(
  p_event_id uuid, p_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_event_permission(p_event_id, 'checkin.scan') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update public.checkin_devices
     set revoked_at = now(), updated_at = now()
   where id = p_device_id and event_id = p_event_id and revoked_at is null;
  if not found then
    raise exception 'device not found or already revoked'
      using errcode = 'no_data_found';
  end if;
  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id)
  select org_id, p_event_id, auth.uid(), 'user', 'checkin_device.revoked',
    'checkin_devices', p_device_id::text
  from public.events where id = p_event_id;
end;
$$;

-- One scan: device secret verified HERE (S14), pass looked up by
-- (event, token hash), registration must still be confirmed.
create or replace function public.record_check_in(
  p_event_id uuid, p_device_id uuid, p_device_secret text,
  p_pass_id uuid, p_token_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.checkin_devices;
  v_event public.events;
  v_pass public.passes;
  v_reg public.registrations;
  v_day date;
  v_reason text;
begin
  select * into v_device from public.checkin_devices
   where id = p_device_id and event_id = p_event_id;
  if v_device.id is null or v_device.revoked_at is not null
     or v_device.expires_at < now()
     or v_device.device_secret_hash
        <> extensions.digest(coalesce(p_device_secret, ''), 'sha256')
  then
    insert into public.scan_log (org_id, event_id, device_id, outcome, reason)
    select e.org_id, p_event_id, p_device_id, 'device_rejected',
      case when v_device.id is null then 'device unknown'
           when v_device.revoked_at is not null then 'device revoked'
           when v_device.expires_at < now() then 'device expired'
           else 'secret mismatch' end
    from public.events e where e.id = p_event_id;
    return jsonb_build_object('result', 'device_rejected');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null or v_event.status = 'archived' then
    return jsonb_build_object('result', 'event_closed');
  end if;
  if v_event.starts_at is null then
    return jsonb_build_object('result', 'event_closed');
  end if;
  v_day := (now() at time zone v_event.timezone)::date;
  if v_day < (v_event.starts_at at time zone v_event.timezone)::date - 1
     or (v_event.ends_at is not null
         and v_day > (v_event.ends_at at time zone v_event.timezone)::date + 1)
  then
    return jsonb_build_object('result', 'event_closed');
  end if;

  select * into v_pass from public.passes
   where id = p_pass_id and event_id = p_event_id and token_hash = p_token_hash;
  if v_pass.id is null then
    v_reason := 'pass unknown for this event';
  elsif v_pass.status <> 'issued' then
    v_reason := 'pass revoked';
  end if;
  if v_reason is not null then
    insert into public.scan_log (org_id, event_id, device_id, outcome, reason)
    values (v_event.org_id, p_event_id, p_device_id,
      case when v_pass.id is null then 'pass_not_found' else 'pass_revoked' end,
      v_reason);
    return jsonb_build_object('result',
      case when v_pass.id is null then 'pass_not_found' else 'pass_revoked' end);
  end if;

  select * into v_reg from public.registrations
   where id = v_pass.registration_id and event_id = p_event_id;
  if v_reg.id is null or v_reg.status <> 'confirmed' then
    insert into public.scan_log (org_id, event_id, device_id, registration_id,
      outcome, reason)
    values (v_event.org_id, p_event_id, p_device_id, v_pass.registration_id,
      'registration_not_confirmed',
      case when v_reg.id is null then 'registration missing'
           else 'status ' || v_reg.status end);
    return jsonb_build_object('result', 'registration_not_confirmed');
  end if;

  insert into public.check_ins (org_id, event_id, registration_id, pass_id,
    device_id, event_day, method, created_by)
  values (v_event.org_id, p_event_id, v_reg.id, v_pass.id, p_device_id,
    v_day, 'qr', v_device.created_by)
  on conflict (event_id, registration_id, event_day) do nothing;
  if not found then
    insert into public.scan_log (org_id, event_id, device_id, registration_id,
      outcome, reason)
    values (v_event.org_id, p_event_id, p_device_id, v_reg.id,
      'already_checked_in', 'first scan of the day kept');
    return jsonb_build_object('result', 'already_checked_in',
      'registration_code', v_reg.code);
  end if;

  insert into public.scan_log (org_id, event_id, device_id, registration_id,
    outcome)
  values (v_event.org_id, p_event_id, p_device_id, v_reg.id, 'checked_in');
  return jsonb_build_object('result', 'checked_in',
    'registration_code', v_reg.code,
    'name', v_reg.first_name || ' ' || v_reg.last_name);
end;
$$;

-- Manual fallback (§9.2) for the workspace's search-by-name flow.
create or replace function public.record_manual_check_in(
  p_event_id uuid, p_registration_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reg public.registrations;
  v_day date;
begin
  if not app.has_event_permission(p_event_id, 'checkin.scan') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_event from public.events where id = p_event_id;
  select * into v_reg from public.registrations
   where id = p_registration_id and event_id = p_event_id;
  if v_reg.id is null or v_reg.status <> 'confirmed' then
    return jsonb_build_object('result', 'registration_not_confirmed');
  end if;
  v_day := coalesce((now() at time zone v_event.timezone)::date, current_date);
  insert into public.check_ins (org_id, event_id, registration_id, event_day,
    method, created_by)
  values (v_event.org_id, p_event_id, v_reg.id, v_day, 'manual', auth.uid())
  on conflict (event_id, registration_id, event_day) do nothing;
  return jsonb_build_object('result',
    case when found then 'checked_in' else 'already_checked_in' end,
    'registration_code', v_reg.code);
end;
$$;

revoke execute on function public.issue_pass(uuid, uuid, bytea, text, integer),
  public.record_check_in(uuid, uuid, text, uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.issue_pass(uuid, uuid, bytea, text, integer)
  to service_role;
-- record_check_in is callable by a signed-in scanner (eventRoute checks
-- checkin.scan for the event); the device secret is re-checked inside.
grant execute on function public.record_check_in(uuid, uuid, text, uuid, bytea)
  to authenticated;

revoke execute on function public.revoke_pass(uuid, uuid),
  public.create_checkin_device(uuid, text, bytea, integer),
  public.revoke_checkin_device(uuid, uuid),
  public.record_manual_check_in(uuid, uuid)
  from public, anon;
grant execute on function public.revoke_pass(uuid, uuid),
  public.create_checkin_device(uuid, text, bytea, integer),
  public.revoke_checkin_device(uuid, uuid),
  public.record_manual_check_in(uuid, uuid)
  to authenticated;
