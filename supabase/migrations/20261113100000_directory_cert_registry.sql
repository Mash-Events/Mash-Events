-- 0022 platform directory + permanent certificate registry
-- (docs/system-design.md §13, §16.4).
--
-- events.listed: opt-in to the public directory on the platform's main
-- domain. Off by default — private events never appear.
--
-- event_certificate_registry: a slim, non-PII record of every issued
-- certificate (name as printed on the certificate, event name, dates,
-- status) that SURVIVES the retention purge — the live certificate rows
-- cascade away with their registrations, but the public verify page keeps
-- answering. No FK to registrations/events on purpose.

alter table public.events
  add column listed boolean not null default false;

-- update_event is redefined (the original in 20261109140000 is deployed) to
-- accept 'listed'.
create or replace function public.update_event(p_event_id uuid, p_changes jsonb)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.events;
begin
  if not app.has_event_permission(p_event_id, 'events.manage') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  update public.events e set
    name = coalesce(nullif(trim(p_changes ->> 'name'), ''), e.name),
    status = coalesce(p_changes ->> 'status', e.status),
    starts_at = case when p_changes ? 'starts_at' then (p_changes ->> 'starts_at')::timestamptz else e.starts_at end,
    ends_at = case when p_changes ? 'ends_at' then (p_changes ->> 'ends_at')::timestamptz else e.ends_at end,
    timezone = coalesce(p_changes ->> 'timezone', e.timezone),
    registration_opens_at = case when p_changes ? 'registration_opens_at'
      then (p_changes ->> 'registration_opens_at')::timestamptz else e.registration_opens_at end,
    registration_closes_at = case when p_changes ? 'registration_closes_at'
      then (p_changes ->> 'registration_closes_at')::timestamptz else e.registration_closes_at end,
    capacity = case when p_changes ? 'capacity' then (p_changes ->> 'capacity')::integer else e.capacity end,
    waitlist_enabled = coalesce((p_changes ->> 'waitlist_enabled')::boolean, e.waitlist_enabled),
    review_mode = coalesce(p_changes ->> 'review_mode', e.review_mode),
    listed = coalesce((p_changes ->> 'listed')::boolean, e.listed)
  where e.id = p_event_id
  returning * into v_row;

  if not found then
    raise exception 'event not found' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_row.org_id, v_row.id, auth.uid(), 'user', 'event.updated', 'events',
    v_row.id::text, p_changes);
  return v_row;
end;
$$;

revoke execute on function public.update_event(uuid, jsonb)
  from public, anon;
grant execute on function public.update_event(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Permanent certificate registry (survives the retention purge).

create table public.event_certificate_registry (
  event_id uuid not null,
  org_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9]{8}$'),
  name text not null check (length(name) between 1 and 200),
  event_name text not null check (length(event_name) between 1 and 200),
  event_dates text check (length(event_dates) <= 120),
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  issued_at timestamptz not null default now(),
  primary key (event_id, code)
);
create index event_certificate_registry_code_idx
  on public.event_certificate_registry (code);

alter table public.event_certificate_registry enable row level security;
alter table public.event_certificate_registry force row level security;
revoke all on public.event_certificate_registry
  from anon, authenticated;

-- issue_certificates / revoke_certificate are redefined (the originals in
-- 20261112100000 are in the repo but not applied to any production database)
-- to maintain the registry alongside the live rows.
create or replace function public.issue_certificates(
  p_event_id uuid,
  p_audience text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reg record;
  v_id uuid;
  v_issued integer := 0;
  v_skipped integer := 0;
  v_dates text;
begin
  if not app.has_event_permission(p_event_id, 'certificates.manage') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_audience not in ('attended', 'confirmed') then
    raise exception 'audience must be attended or confirmed'
      using errcode = 'check_violation';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status in ('draft', 'archived') then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_dates := coalesce(
    to_char(v_event.starts_at, 'DD Mon YYYY'),
    to_char(now(), 'DD Mon YYYY'));

  for v_reg in
    select r.id, r.first_name, r.last_name, r.code
      from public.registrations r
     where r.event_id = p_event_id
       and r.status = 'confirmed'
       and (
         p_audience = 'confirmed'
         or exists (
           select 1 from public.check_ins c
            where c.event_id = p_event_id
              and c.registration_id = r.id
         )
       )
     order by r.created_at
  loop
    -- The certificate code IS the registration code: one code per person,
    -- used on the badge, the claim page and the public verify page.
    insert into public.event_certificates (event_id, registration_id, code, created_by)
    values (p_event_id, v_reg.id, v_reg.code, auth.uid())
    on conflict (event_id, registration_id) do nothing
    returning id into v_id;

    if v_id is null then
      v_skipped := v_skipped + 1;
    else
      v_issued := v_issued + 1;
      perform app.enqueue_registration_email(
        p_event_id, v_reg.id, 'certificate_issued', 'cert:' || v_id
      );
      insert into public.event_certificate_registry (event_id, org_id, code,
        name, event_name, event_dates)
      values (p_event_id, v_event.org_id, v_reg.code,
        trim(v_reg.first_name || ' ' || v_reg.last_name),
        v_event.name, v_dates)
      on conflict (event_id, code) do nothing;
      v_id := null;
    end if;
  end loop;

  if v_issued > 0 then
    insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
      action, target_table, target_id, summary)
    values (v_event.org_id, p_event_id, auth.uid(), 'user',
      'certificate.issued', 'event_certificates', p_event_id::text,
      jsonb_build_object('audience', p_audience, 'issued', v_issued,
        'skipped', v_skipped));
  end if;

  return jsonb_build_object('result', 'issued', 'issued', v_issued,
    'skipped', v_skipped);
end;
$$;

revoke execute on function public.issue_certificates(uuid, text)
  from public, anon;
grant execute on function public.issue_certificates(uuid, text)
  to authenticated;

create or replace function public.revoke_certificate(
  p_event_id uuid,
  p_certificate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_code text;
begin
  if not app.has_event_permission(p_event_id, 'certificates.manage') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  update public.event_certificates
     set status = 'revoked', revoked_at = now()
   where id = p_certificate_id
     and event_id = p_event_id
     and status = 'issued'
  returning org_id, code into v_org, v_code;

  if v_org is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  update public.event_certificate_registry
     set status = 'revoked'
   where event_id = p_event_id
     and code = v_code;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_org, p_event_id, auth.uid(), 'user',
    'certificate.revoked', 'event_certificates', p_certificate_id::text,
    '{}'::jsonb);

  return jsonb_build_object('result', 'revoked');
end;
$$;

revoke execute on function public.revoke_certificate(uuid, uuid)
  from public, anon;
grant execute on function public.revoke_certificate(uuid, uuid)
  to authenticated;
