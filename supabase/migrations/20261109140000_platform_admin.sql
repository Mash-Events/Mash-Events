-- 0006 platform administration RPCs (docs/system-design.md §6.5, §14)
-- Create organisations and events, update event settings. Super admin only
-- (events.manage), audited. Event slugs and orgs never change after creation.

create or replace function public.create_organization(p_slug text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  insert into public.organizations (slug, name)
  values (lower(trim(p_slug)), trim(p_name))
  returning id into v_id;
  insert into public.audit_log (org_id, actor_user_id, actor_kind, action,
    target_table, target_id, summary)
  values (v_id, auth.uid(), 'user', 'organization.created', 'organizations',
    v_id::text, jsonb_build_object('slug', lower(trim(p_slug))));
  return v_id;
end;
$$;

create or replace function public.create_event(
  p_org_id uuid,
  p_slug text,
  p_name text,
  p_kind text,
  p_timezone text default 'Asia/Kolkata',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone using errcode = 'check_violation';
  end if;
  insert into public.events (org_id, slug, name, kind, timezone, starts_at, ends_at)
  values (p_org_id, lower(trim(p_slug)), trim(p_name), p_kind, p_timezone,
    p_starts_at, p_ends_at)
  returning id into v_id;
  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind, action,
    target_table, target_id, summary)
  values (p_org_id, v_id, auth.uid(), 'user', 'event.created', 'events', v_id::text,
    jsonb_build_object('slug', lower(trim(p_slug)), 'kind', p_kind));
  return v_id;
end;
$$;

-- Partial update of the settings an operator edits. Unknown keys are ignored;
-- slug, org and ids are never editable.
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
    review_mode = coalesce(p_changes ->> 'review_mode', e.review_mode)
  where e.id = p_event_id
  returning * into v_row;

  if not found then
    raise exception 'event not found' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind, action,
    target_table, target_id, summary)
  values (v_row.org_id, v_row.id, auth.uid(), 'user', 'event.updated', 'events',
    v_row.id::text, p_changes);
  return v_row;
end;
$$;

revoke execute on function public.create_organization(text, text),
  public.create_event(uuid, text, text, text, text, timestamptz, timestamptz),
  public.update_event(uuid, jsonb) from public, anon;
grant execute on function public.create_organization(text, text),
  public.create_event(uuid, text, text, text, text, timestamptz, timestamptz),
  public.update_event(uuid, jsonb) to authenticated;
