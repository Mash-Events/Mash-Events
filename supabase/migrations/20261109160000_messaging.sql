-- 0008 messaging queue (docs/system-design.md §5.5, §8, §12.5, §12.8)
-- Email now, WhatsApp later on the same tables (channel). Items are
-- enqueued inside the registration RPCs, claimed one event at a time with a
-- lease, re-verified at claim time, finished only by the lease holder.

-- Per-event sender identity (optional; default sender is used otherwise).
create table public.event_email_settings (
  event_id uuid primary key,
  org_id uuid not null,
  from_name text check (length(from_name) between 1 and 100),
  reply_to text check (reply_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(reply_to) <= 320),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

-- Per-event toggles and subject overrides; bodies live in code.
create table public.event_message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  template_key text not null check (template_key ~ '^[a-z_]{1,40}$'),
  enabled boolean not null default true,
  subject_override text check (length(subject_override) <= 200),
  updated_at timestamptz not null default now(),
  unique (event_id, channel, template_key),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.message_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  template_key text not null,
  kind text not null check (kind in ('transactional', 'bulk', 'reminder', 'pass')),
  status text not null default 'queued'
    check (status in ('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create table public.message_job_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  job_id uuid not null,
  registration_id uuid not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  template_key text not null,
  recipient text not null,
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed', 'retrying', 'skipped')),
  priority smallint not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  locked_until timestamptz,
  batch_id uuid,
  payload_hash text,
  last_error text check (length(last_error) <= 500),
  provider_message_id text,
  delivery_status text check (delivery_status in ('delivered', 'bounced', 'complained', 'delayed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, idempotency_key),
  unique (id, event_id),
  foreign key (job_id, event_id) references public.message_jobs (id, event_id),
  foreign key (registration_id, event_id) references public.registrations (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index message_job_items_due_idx
  on public.message_job_items (channel, status, priority, next_attempt_at, event_id);
create index message_job_items_reg_idx
  on public.message_job_items (event_id, registration_id, created_at desc);
create unique index message_job_items_provider_uq
  on public.message_job_items (provider_message_id) where provider_message_id is not null;

create table public.message_deliveries (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  event_id uuid not null,
  job_item_id uuid not null,
  provider text not null check (provider in ('resend', 'azure_acs')),
  provider_message_id text not null,
  status text not null,
  at timestamptz not null default now(),
  foreign key (job_item_id, event_id) references public.message_job_items (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);

-- Email: hard bounces/complaints per org. WhatsApp opt-outs are platform-wide
-- (one sender number), so org_id is nullable here only.
create table public.message_suppressions (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id),
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient_normalised text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create unique index message_suppressions_uq on public.message_suppressions
  (channel, coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), recipient_normalised);

-- Triggers and RLS.
create trigger message_job_items_updated_at before update on public.message_job_items
  for each row execute function app.set_updated_at();
create trigger event_email_settings_updated_at before update on public.event_email_settings
  for each row execute function app.set_updated_at();
create trigger event_message_templates_updated_at before update on public.event_message_templates
  for each row execute function app.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['event_email_settings', 'event_message_templates', 'message_jobs',
                           'message_job_items', 'message_deliveries'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.prevent_tenancy_change()', t || '_tenancy', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function app.prevent_archived_write()', t || '_archived', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (event_id = (select app.pinned_event()) and (select app.has_event_permission(app.pinned_event(), %L)))',
      t || '_select', t, 'registrations.read');
  end loop;
end;
$$;

alter table public.message_suppressions enable row level security;
alter table public.message_suppressions force row level security;
revoke all on public.message_suppressions from anon, authenticated;

-- Templates that need a particular registration status at send time.
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

-- Enqueue one transactional email for a registration (internal; called by
-- the registration RPCs in the same transaction). Idempotent per key.
create or replace function app.enqueue_registration_email(
  p_event_id uuid,
  p_registration_id uuid,
  p_template text,
  p_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_job uuid;
begin
  if exists (select 1 from public.event_message_templates t
             where t.event_id = p_event_id and t.channel = 'email'
               and t.template_key = p_template and not t.enabled) then
    return;
  end if;

  select * into v_reg from public.registrations
   where id = p_registration_id and event_id = p_event_id;
  if not found then return; end if;

  if exists (select 1 from public.message_job_items i
             where i.event_id = p_event_id and i.idempotency_key = p_key) then
    return;
  end if;

  insert into public.message_jobs (org_id, event_id, channel, template_key, kind)
  values (v_reg.org_id, p_event_id, 'email', p_template, 'transactional')
  returning id into v_job;

  insert into public.message_job_items (org_id, event_id, job_id, registration_id, channel,
    template_key, recipient, idempotency_key, priority)
  values (v_reg.org_id, p_event_id, v_job, v_reg.id, 'email', p_template,
    lower(v_reg.email), p_key, 0);
end;
$$;
revoke execute on function app.enqueue_registration_email(uuid, uuid, text, text)
  from public, anon, authenticated;

-- Enqueue from the history row: every new registration and every review
-- decision gets the matching email (keyed by the history id, so a later
-- re-confirmation sends again but a retry of the same change never does).
create or replace function app.enqueue_on_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template text;
begin
  v_template := case
    when new.from_status is null then 'acknowledgement'
    when new.to_status in ('confirmed', 'waitlisted', 'rejected') then new.to_status
    else null
  end;
  -- Auto-confirmed/waitlisted on submit: send the decision, not "received".
  if new.from_status is null and new.to_status in ('confirmed', 'waitlisted') then
    v_template := new.to_status;
  end if;
  if v_template is not null then
    perform app.enqueue_registration_email(new.event_id, new.registration_id,
      v_template, v_template || ':' || new.registration_id || ':' || new.id);
  end if;
  return new;
end;
$$;

create trigger registration_status_history_enqueue
  after insert on public.registration_status_history
  for each row execute function app.enqueue_on_status_history();

-- Events with due email work (drainer iterates events explicitly).
create or replace function public.message_events_due(p_channel text, p_limit integer default 20)
returns table (event_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct i.event_id
  from public.message_job_items i
  where i.channel = p_channel
    and ((i.status in ('queued', 'retrying') and i.next_attempt_at <= now())
      or (i.status = 'processing' and i.locked_until < now()))
  limit p_limit
$$;

-- Claim up to p_limit items of ONE event. Every item is re-verified in the
-- same transaction (§12.5); failures are skipped with a reason and not
-- returned. Returns the render context built from that event only.
create or replace function public.claim_message_items(
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
  from_name text, reply_to text, subject_override text
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
    select i.id, i.template_key, i.recipient, i.registration_id
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
      when app.template_requires_status(v_item.template_key) is not null
           and r.status <> app.template_requires_status(v_item.template_key) then 'status_changed'
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
         s.from_name, s.reply_to, t.subject_override
  from public.message_job_items i
  join public.registrations r on r.id = i.registration_id and r.event_id = i.event_id
  join public.events e on e.id = i.event_id
  join public.organizations o on o.id = e.org_id
  left join public.event_email_settings s on s.event_id = e.id
  left join public.event_message_templates t
    on t.event_id = e.id and t.channel = i.channel and t.template_key = i.template_key
  where i.event_id = p_event_id and i.lease_id = v_lease and i.status = 'processing';
end;
$$;

-- Record the outcome. Only the current lease holder can finish an item.
create or replace function public.finish_message_item(
  p_event_id uuid,
  p_item_id uuid,
  p_lease_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.message_job_items;
begin
  select * into v_item from public.message_job_items
   where id = p_item_id and event_id = p_event_id and lease_id = p_lease_id
     and status = 'processing'
   for update;
  if not found then
    return false;
  end if;

  if p_outcome = 'sent' then
    update public.message_job_items
       set status = 'sent', provider_message_id = p_provider_message_id,
           lease_id = null, locked_until = null, last_error = null
     where id = p_item_id;
  elsif p_outcome = 'retry' and v_item.attempts < v_item.max_attempts then
    update public.message_job_items
       set status = 'retrying', lease_id = null, locked_until = null,
           last_error = left(p_error, 500),
           next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, v_item.attempts)::integer))
     where id = p_item_id;
  else
    update public.message_job_items
       set status = 'failed', lease_id = null, locked_until = null,
           last_error = left(coalesce(p_error, 'failed'), 500)
     where id = p_item_id;
  end if;

  update public.message_jobs j
     set status = 'completed', completed_at = now()
   where j.id = v_item.job_id and j.event_id = p_event_id and j.status <> 'completed'
     and not exists (select 1 from public.message_job_items i
                     where i.job_id = j.id and i.event_id = p_event_id
                       and i.status in ('queued', 'processing', 'retrying'));
  return true;
end;
$$;

-- Provider webhook: matched by provider message id; the event id from the
-- provider's tags must equal the stored row's event (§12.5).
create or replace function public.record_message_delivery(
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_tag_event_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.message_job_items;
begin
  select * into v_item from public.message_job_items
   where provider_message_id = p_provider_message_id;
  if not found then
    return 'unknown';
  end if;
  if p_tag_event_id is distinct from v_item.event_id then
    return 'event_mismatch';
  end if;

  insert into public.message_deliveries (org_id, event_id, job_item_id, provider,
    provider_message_id, status)
  values (v_item.org_id, v_item.event_id, v_item.id, p_provider, p_provider_message_id, p_status);

  if p_status in ('delivered', 'bounced', 'complained', 'delayed') then
    update public.message_job_items set delivery_status = p_status where id = v_item.id;
  end if;
  if p_status in ('bounced', 'complained') then
    insert into public.message_suppressions (org_id, channel, recipient_normalised, reason)
    values (v_item.org_id, v_item.channel, v_item.recipient, p_status)
    on conflict do nothing;
  end if;
  return 'recorded';
end;
$$;

revoke execute on function public.message_events_due(text, integer),
  public.claim_message_items(uuid, text, integer, integer),
  public.finish_message_item(uuid, uuid, uuid, text, text, text),
  public.record_message_delivery(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.message_events_due(text, integer),
  public.claim_message_items(uuid, text, integer, integer),
  public.finish_message_item(uuid, uuid, uuid, text, text, text),
  public.record_message_delivery(text, text, text, uuid)
  to service_role;
