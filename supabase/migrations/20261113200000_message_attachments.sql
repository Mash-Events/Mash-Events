-- 0023 message attachments (docs/system-design.md §8, the seed's
-- reminder_attachments adapted to the unified job model): reminder and bulk
-- emails can carry generated PDF attachments (the agenda); confirmation and
-- certificate emails attach the attendee's own badge/certificate PDF.
-- Attachments are GENERATED at drain time (nothing stored), so the column
-- just names the kinds.

alter table public.bulk_action_intents
  add column attachments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(attachments) = 'array'
           and jsonb_array_length(attachments) <= 4
           and attachments <@ '["agenda_pdf"]'::jsonb);

alter table public.message_jobs
  add column attachments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(attachments) = 'array'
           and jsonb_array_length(attachments) <= 4
           and attachments <@ '["agenda_pdf"]'::jsonb);

-- create_message_intent is redefined (the original in 20261109170000 is
-- deployed) to accept the attachment kinds. The old 6-param signature is
-- dropped first: leaving both would make positional calls ambiguous.
drop function public.create_message_intent(uuid, text[], text, text, boolean, timestamptz);
create or replace function public.create_message_intent(
  p_event_id uuid,
  p_audience text[],
  p_subject text,
  p_body text,
  p_include_join_link boolean default false,
  p_send_at timestamptz default null,
  p_attachments jsonb default '[]'::jsonb
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
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array'
     or jsonb_array_length(p_attachments) > 4
     or not (p_attachments <@ '["agenda_pdf"]'::jsonb) then
    raise exception 'invalid attachments' using errcode = 'check_violation';
  end if;

  select count(*), coalesce(md5(string_agg(r.id::text, ',' order by r.id)), md5(''))
    into v_count, v_hash
    from public.registrations r
    where r.event_id = p_event_id and r.status = any (p_audience);

  insert into public.bulk_action_intents (org_id, event_id, action, audience, subject, body,
    include_join_link, send_at, count, selection_hash, created_by, attachments)
  values (v_event.org_id, p_event_id, 'message', p_audience, trim(p_subject), trim(p_body),
    p_include_join_link, p_send_at, v_count, v_hash, auth.uid(), p_attachments)
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

revoke execute on function public.create_message_intent(uuid, text[], text, text, boolean, timestamptz, jsonb)
  from public, anon;
grant execute on function public.create_message_intent(uuid, text[], text, text, boolean, timestamptz, jsonb)
  to authenticated;

-- execute_message_intent is redefined to carry the attachments into the job.
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
    body, include_join_link, intent_id, created_by, attachments)
  values (v_intent.org_id, v_intent.event_id, 'email', 'custom',
    case when v_intent.send_at is null then 'bulk' else 'reminder' end,
    v_intent.subject, v_intent.body, v_intent.include_join_link, v_intent.id,
    v_intent.confirmed_by, v_intent.attachments)
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
      where ii.intent_id = v_intent.id and ii.registration_id = r.id
    ))
  on conflict (event_id, idempotency_key) do nothing;

  update public.bulk_action_intents
     set status = 'executed', executed_at = now(), job_id = v_job
   where id = v_intent.id;
  return v_job;
end;
$$;

revoke execute on function app.execute_message_intent(uuid, boolean)
  from public, anon;

-- claim_message_items is redefined (see 20261109170000 for the original)
-- to also return the job's attachment kinds so the drainer can build them.
-- The OUT row type changes, so drop + create (grants are re-issued below).
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
  job_subject text, job_body text, include_join_link boolean, attachments jsonb
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
         j.subject, j.body, j.include_join_link, j.attachments
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

revoke execute on function public.claim_message_items(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_message_items(uuid, text, integer, integer)
  to service_role;
