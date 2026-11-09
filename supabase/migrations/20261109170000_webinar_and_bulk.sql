-- 0009 webinar join + bulk/scheduled messages (docs/system-design.md §9.3, §12.11)

-- ---------------------------------------------------------------------------
-- Webinar settings live in events.settings: join_url (https), join_window_minutes.
-- update_event learns to set them (the rest of the function is unchanged).
create or replace function public.update_event(p_event_id uuid, p_changes jsonb)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.events;
  v_settings jsonb;
begin
  if not app.has_event_permission(p_event_id, 'events.manage') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if p_changes ? 'join_url' and p_changes ->> 'join_url' is not null
     and p_changes ->> 'join_url' !~ '^https://[^\s]{4,500}$' then
    raise exception 'join_url must be an https URL' using errcode = 'check_violation';
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
    settings = e.settings
      || case when p_changes ? 'join_url' then jsonb_build_object('join_url', p_changes -> 'join_url') else '{}'::jsonb end
      || case when p_changes ? 'join_window_minutes'
              then jsonb_build_object('join_window_minutes',
                     least(240, greatest(0, (p_changes ->> 'join_window_minutes')::integer)))
              else '{}'::jsonb end
  where e.id = p_event_id
  returning * into v_row;

  if not found then
    raise exception 'event not found' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind, action,
    target_table, target_id, summary)
  values (v_row.org_id, v_row.id, auth.uid(), 'user', 'event.updated', 'events',
    v_row.id::text, p_changes - 'join_url'
      || case when p_changes ? 'join_url' then '{"join_url":"(changed)"}'::jsonb else '{}'::jsonb end);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Webinar attendance (one row per registrant; joins counted).
create table public.webinar_attendance (
  org_id uuid not null,
  event_id uuid not null,
  registration_id uuid not null,
  first_joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  join_count integer not null default 1,
  ip_hashes text[] not null default '{}',
  primary key (event_id, registration_id),
  foreign key (registration_id, event_id) references public.registrations (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);

-- Called by the join route (service role) after the signed token verified
-- for this event. Records the join and returns what the route needs.
create or replace function public.record_webinar_join(
  p_event_id uuid,
  p_registration_id uuid,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reg public.registrations;
  v_window integer;
  v_opens timestamptz;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.kind not in ('webinar', 'hybrid') or v_event.status = 'archived' then
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into v_reg from public.registrations
   where id = p_registration_id and event_id = p_event_id;
  if not found or v_reg.status <> 'confirmed' then
    return jsonb_build_object('result', 'invalid');
  end if;

  v_window := coalesce((v_event.settings ->> 'join_window_minutes')::integer, 30);
  v_opens := v_event.starts_at - make_interval(mins => v_window);

  if v_event.starts_at is null or now() < v_opens then
    return jsonb_build_object('result', 'early', 'opens_at', v_opens,
      'starts_at', v_event.starts_at, 'timezone', v_event.timezone, 'event_name', v_event.name);
  end if;
  if v_event.ends_at is not null and now() > v_event.ends_at then
    return jsonb_build_object('result', 'ended', 'event_name', v_event.name);
  end if;
  if coalesce(v_event.settings ->> 'join_url', '') = '' then
    return jsonb_build_object('result', 'no_link', 'event_name', v_event.name);
  end if;

  insert into public.webinar_attendance (org_id, event_id, registration_id, ip_hashes)
  values (v_event.org_id, p_event_id, v_reg.id, array[p_ip_hash])
  on conflict (event_id, registration_id) do update
    set last_joined_at = now(),
        join_count = public.webinar_attendance.join_count + 1,
        ip_hashes = case
          when p_ip_hash = any (public.webinar_attendance.ip_hashes)
            or cardinality(public.webinar_attendance.ip_hashes) >= 20
          then public.webinar_attendance.ip_hashes
          else public.webinar_attendance.ip_hashes || p_ip_hash end;

  return jsonb_build_object('result', 'ok', 'join_url', v_event.settings ->> 'join_url');
end;
$$;

-- ---------------------------------------------------------------------------
-- Bulk and scheduled messages: preview → test send → typed confirm (§12.11).
create table public.bulk_action_intents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  action text not null check (action in ('message')),
  audience text[] not null check (audience <@ array['pending', 'confirmed', 'waitlisted', 'rejected', 'cancelled']
                                  and cardinality(audience) > 0),
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) between 1 and 5000),
  include_join_link boolean not null default false,
  send_at timestamptz,
  count integer not null,
  selection_hash text not null,
  tested_at timestamptz,
  status text not null default 'previewed'
    check (status in ('previewed', 'scheduled', 'executed', 'expired', 'cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  expires_at timestamptz not null default now() + interval '15 minutes',
  executed_at timestamptz,
  job_id uuid,
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.bulk_action_intent_items (
  org_id uuid not null,
  event_id uuid not null,
  intent_id uuid not null,
  registration_id uuid not null,
  primary key (intent_id, registration_id),
  foreign key (intent_id, event_id) references public.bulk_action_intents (id, event_id) on delete cascade,
  foreign key (registration_id, event_id) references public.registrations (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);

alter table public.message_jobs
  add column subject text check (length(subject) <= 200),
  add column body text check (length(body) <= 5000),
  add column include_join_link boolean not null default false,
  add column intent_id uuid,
  add constraint message_jobs_intent_fk foreign key (intent_id, event_id)
    references public.bulk_action_intents (id, event_id);
alter table public.message_job_items
  add column required_status text
    check (required_status in ('pending', 'confirmed', 'waitlisted', 'rejected', 'cancelled'));

do $$
declare
  t text;
begin
  foreach t in array array['webinar_attendance', 'bulk_action_intents', 'bulk_action_intent_items'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.prevent_tenancy_change()', t || '_tenancy', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function app.prevent_archived_write()', t || '_archived', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

create policy webinar_attendance_select on public.webinar_attendance for select to authenticated
  using (event_id = (select app.pinned_event())
         and (select app.has_event_permission(app.pinned_event(), 'registrations.read')));
create policy bulk_action_intents_select on public.bulk_action_intents for select to authenticated
  using (event_id = (select app.pinned_event())
         and (select app.has_event_permission(app.pinned_event(), 'messages.bulk')));
create policy bulk_action_intent_items_select on public.bulk_action_intent_items for select to authenticated
  using (event_id = (select app.pinned_event())
         and (select app.has_event_permission(app.pinned_event(), 'messages.bulk')));

-- Preview: freeze the selection and return a summary.
create or replace function public.create_message_intent(
  p_event_id uuid,
  p_audience text[],
  p_subject text,
  p_body text,
  p_include_join_link boolean default false,
  p_send_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_id uuid;
  v_count integer;
  v_hash text;
begin
  v_event := app.require_event_access(p_event_id, 'messages.bulk');
  if v_event.status = 'archived' then
    raise exception 'event is archived' using errcode = 'insufficient_privilege';
  end if;
  if p_send_at is not null and p_send_at < now() - interval '1 minute' then
    raise exception 'send time is in the past' using errcode = 'check_violation';
  end if;

  select count(*), coalesce(md5(string_agg(r.id::text, ',' order by r.id)), md5(''))
    into v_count, v_hash
  from public.registrations r
  where r.event_id = p_event_id and r.status = any (p_audience);

  insert into public.bulk_action_intents (org_id, event_id, action, audience, subject, body,
    include_join_link, send_at, count, selection_hash, created_by)
  values (v_event.org_id, p_event_id, 'message', p_audience, trim(p_subject), trim(p_body),
    p_include_join_link, p_send_at, v_count, v_hash, auth.uid())
  returning id into v_id;

  insert into public.bulk_action_intent_items (org_id, event_id, intent_id, registration_id)
  select v_event.org_id, p_event_id, v_id, r.id
  from public.registrations r
  where r.event_id = p_event_id and r.status = any (p_audience);

  return jsonb_build_object(
    'intent_id', v_id, 'count', v_count, 'selection_hash', v_hash,
    'event_name', v_event.name,
    'sample', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.first_name || ' ' || s.last_name, 'email', s.email))
      from (select r.first_name, r.last_name, r.email from public.registrations r
            where r.event_id = p_event_id and r.status = any (p_audience)
            order by r.created_at limit 5) s), '[]'::jsonb));
end;
$$;

create or replace function public.mark_message_intent_tested(p_event_id uuid, p_intent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_event_access(p_event_id, 'messages.bulk');
  update public.bulk_action_intents set tested_at = now()
   where id = p_intent_id and event_id = p_event_id and status = 'previewed';
  if not found then
    raise exception 'intent not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Create the job and items for an intent (internal). Scheduled intents use
-- the CURRENT audience at release time; immediate ones use the frozen list.
create or replace function app.execute_message_intent(p_intent_id uuid, p_use_frozen boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.bulk_action_intents;
  v_job uuid;
begin
  select * into v_intent from public.bulk_action_intents where id = p_intent_id for update;

  insert into public.message_jobs (org_id, event_id, channel, template_key, kind, subject,
    body, include_join_link, intent_id, created_by)
  values (v_intent.org_id, v_intent.event_id, 'email', 'custom',
    case when v_intent.send_at is null then 'bulk' else 'reminder' end,
    v_intent.subject, v_intent.body, v_intent.include_join_link, v_intent.id, v_intent.confirmed_by)
  returning id into v_job;

  insert into public.message_job_items (org_id, event_id, job_id, registration_id, channel,
    template_key, recipient, idempotency_key, priority, required_status)
  select r.org_id, r.event_id, v_job, r.id, 'email', 'custom', lower(r.email),
         'intent:' || v_intent.id || ':' || r.id,
         case when v_intent.send_at is null then 2 else 1 end, r.status
  from public.registrations r
  where r.event_id = v_intent.event_id
    and r.status = any (v_intent.audience)
    and (not p_use_frozen or exists (
      select 1 from public.bulk_action_intent_items ii
      where ii.intent_id = v_intent.id and ii.registration_id = r.id))
  on conflict (event_id, idempotency_key) do nothing;

  update public.bulk_action_intents
     set status = 'executed', executed_at = now(), job_id = v_job
   where id = v_intent.id;
  return v_job;
end;
$$;
revoke execute on function app.execute_message_intent(uuid, boolean) from public, anon, authenticated;

create or replace function public.confirm_message_intent(
  p_event_id uuid,
  p_intent_id uuid,
  p_typed_name text,
  p_selection_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_intent public.bulk_action_intents;
  v_job uuid;
begin
  v_event := app.require_event_access(p_event_id, 'messages.bulk');

  select * into v_intent from public.bulk_action_intents
   where id = p_intent_id and event_id = p_event_id
   for update;
  if not found then
    raise exception 'intent not found' using errcode = 'no_data_found';
  end if;
  if v_intent.status = 'executed' or v_intent.status = 'scheduled' then
    return jsonb_build_object('result', 'already_confirmed', 'status', v_intent.status);
  end if;
  if v_intent.status <> 'previewed' or v_intent.expires_at < now() then
    raise exception 'preview expired; preview again' using errcode = 'check_violation';
  end if;
  if v_intent.tested_at is null then
    raise exception 'send a test first' using errcode = 'check_violation';
  end if;
  if lower(regexp_replace(trim(p_typed_name), '\s+', ' ', 'g'))
     <> lower(regexp_replace(trim(v_event.name), '\s+', ' ', 'g')) then
    raise exception 'typed name does not match the event' using errcode = 'check_violation';
  end if;
  if p_selection_hash is distinct from v_intent.selection_hash then
    raise exception 'selection changed; preview again' using errcode = 'check_violation';
  end if;

  update public.bulk_action_intents
     set confirmed_by = auth.uid(), confirmed_at = now(),
         status = case when send_at is not null and send_at > now() then 'scheduled' else status end
   where id = v_intent.id
  returning * into v_intent;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind, action,
    target_table, target_id, summary)
  values (v_event.org_id, p_event_id, auth.uid(), 'user', 'message.confirmed',
    'bulk_action_intents', v_intent.id::text,
    jsonb_build_object('count', v_intent.count, 'audience', v_intent.audience,
      'send_at', v_intent.send_at));

  if v_intent.status = 'scheduled' then
    return jsonb_build_object('result', 'scheduled', 'send_at', v_intent.send_at);
  end if;
  v_job := app.execute_message_intent(v_intent.id, true);
  return jsonb_build_object('result', 'queued', 'job_id', v_job);
end;
$$;

create or replace function public.cancel_message_intent(p_event_id uuid, p_intent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  v_event := app.require_event_access(p_event_id, 'messages.bulk');
  update public.bulk_action_intents set status = 'cancelled'
   where id = p_intent_id and event_id = p_event_id and status in ('previewed', 'scheduled');
  if not found then
    raise exception 'nothing to cancel' using errcode = 'no_data_found';
  end if;
  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind, action,
    target_table, target_id)
  values (v_event.org_id, p_event_id, auth.uid(), 'user', 'message.cancelled',
    'bulk_action_intents', p_intent_id::text);
end;
$$;

-- Drainer: release scheduled messages whose time has come (service role).
create or replace function public.release_due_message_intents()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select i.id from public.bulk_action_intents i
    join public.events e on e.id = i.event_id
    where i.status = 'scheduled' and i.send_at <= now() and e.status <> 'archived'
    order by i.send_at
    for update of i skip locked
  loop
    perform app.execute_message_intent(v_id, false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Claim: custom messages carry their subject/body/join flag; an item's
-- required_status (status at selection) must still hold at send time.
create or replace function app.template_requires_status(p_template text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_template
    when 'acknowledgement' then 'pending'
    when 'confirmed' then 'confirmed'
    when 'waitlisted' then 'waitlisted'
    when 'rejected' then 'rejected'
    else null
  end
$$;

drop function public.claim_message_items(uuid, text, integer, integer);
create function public.claim_message_items(
  p_event_id uuid,
  p_channel text,
  p_limit integer,
  p_lease_seconds integer default 120
)
returns table (
  item_id uuid, lease_id uuid, template_key text, recipient text, attempts integer,
  registration_id uuid, registration_code text, first_name text, last_name text,
  registration_status text, event_id uuid, event_name text, event_slug text,
  event_kind text, event_timezone text, event_starts_at timestamptz,
  event_ends_at timestamptz, org_id uuid, org_name text, org_slug text,
  from_name text, reply_to text, subject_override text,
  job_subject text, job_body text, include_join_link boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item record;
  v_lease uuid := gen_random_uuid();
  v_reason text;
begin
  for v_item in
    select i.id, i.template_key, i.recipient, i.registration_id, i.required_status
    from public.message_job_items i
    where i.event_id = p_event_id and i.channel = p_channel
      and ((i.status in ('queued', 'retrying') and i.next_attempt_at <= now())
        or (i.status = 'processing' and i.locked_until < now()))
    order by i.priority, i.created_at
    limit p_limit
    for update skip locked
  loop
    select case
      when e.status = 'archived' then 'event_archived'
      when j.status = 'cancelled' then 'job_cancelled'
      when r.id is null then 'registration_missing'
      when coalesce(v_item.required_status, app.template_requires_status(v_item.template_key)) is not null
           and r.status <> coalesce(v_item.required_status, app.template_requires_status(v_item.template_key))
        then 'status_changed'
      when lower(r.email) <> v_item.recipient then 'recipient_changed'
      when exists (select 1 from public.event_message_templates t
                   where t.event_id = p_event_id and t.channel = p_channel
                     and t.template_key = v_item.template_key and not t.enabled) then 'template_disabled'
      when exists (select 1 from public.message_suppressions s
                   where s.channel = p_channel and s.recipient_normalised = v_item.recipient
                     and (s.org_id is null or s.org_id = e.org_id)) then 'suppressed'
      else null
    end into v_reason
    from public.message_job_items i
    join public.message_jobs j on j.id = i.job_id and j.event_id = i.event_id
    join public.events e on e.id = i.event_id
    left join public.registrations r on r.id = i.registration_id and r.event_id = i.event_id
    where i.id = v_item.id;

    if v_reason is not null then
      update public.message_job_items
         set status = 'skipped', last_error = v_reason, lease_id = null, locked_until = null
       where id = v_item.id;
      continue;
    end if;

    update public.message_job_items
       set status = 'processing', lease_id = v_lease, attempts = attempts + 1,
           locked_until = now() + make_interval(secs => p_lease_seconds)
     where id = v_item.id;
  end loop;

  return query
  select i.id, i.lease_id, i.template_key, i.recipient, i.attempts,
         r.id, r.code, r.first_name, r.last_name, r.status,
         e.id, e.name, e.slug, e.kind, e.timezone, e.starts_at, e.ends_at,
         o.id, o.name, o.slug,
         s.from_name, s.reply_to, t.subject_override,
         j.subject, j.body, j.include_join_link
  from public.message_job_items i
  join public.message_jobs j on j.id = i.job_id and j.event_id = i.event_id
  join public.registrations r on r.id = i.registration_id and r.event_id = i.event_id
  join public.events e on e.id = i.event_id
  join public.organizations o on o.id = e.org_id
  left join public.event_email_settings s on s.event_id = e.id
  left join public.event_message_templates t
    on t.event_id = e.id and t.channel = i.channel and t.template_key = i.template_key
  where i.event_id = p_event_id and i.lease_id = v_lease and i.status = 'processing';
end;
$$;

revoke execute on function public.claim_message_items(uuid, text, integer, integer),
  public.record_webinar_join(uuid, uuid, text),
  public.release_due_message_intents()
  from public, anon, authenticated;
grant execute on function public.claim_message_items(uuid, text, integer, integer),
  public.record_webinar_join(uuid, uuid, text),
  public.release_due_message_intents()
  to service_role;

revoke execute on function public.create_message_intent(uuid, text[], text, text, boolean, timestamptz),
  public.mark_message_intent_tested(uuid, uuid),
  public.confirm_message_intent(uuid, uuid, text, text),
  public.cancel_message_intent(uuid, uuid)
  from public, anon;
grant execute on function public.create_message_intent(uuid, text[], text, text, boolean, timestamptz),
  public.mark_message_intent_tested(uuid, uuid),
  public.confirm_message_intent(uuid, uuid, text, text),
  public.cancel_message_intent(uuid, uuid)
  to authenticated;
