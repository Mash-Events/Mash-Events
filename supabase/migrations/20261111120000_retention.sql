-- 0011 retention purge (docs/system-design.md §13): attendee personal data is
-- deleted `retention_months` after the event ends. The audit log is
-- append-only and stays; message content and intent rows go with the
-- registrations. Runs from the retention-purge cron (service role only).

alter table public.events add column purged_at timestamptz;

-- Transaction-scoped escape hatch, used only inside purge_due_event_data:
-- everything else still gets the archived read-only and append-only guards.
create or replace function app.prevent_archived_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
begin
  if coalesce(current_setting('app.allow_purge', true), '') = '1' then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.events e where e.id = v_event and e.status = 'archived') then
    raise exception 'event % is archived (read-only)', v_event
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function app.prevent_append_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_purge', true), '') = '1' then
    return coalesce(new, old);
  end if;
  raise exception '% is append-only', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create or replace function public.purge_due_event_data(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_regs integer;
  v_purged integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500'
      using errcode = 'check_violation';
  end if;

  -- Only this transaction; the guards stay on for everyone else.
  perform set_config('app.allow_purge', '1', true);

  for v_event in
    select id, org_id from public.events
     where purged_at is null
       and ends_at is not null
       and ends_at + make_interval(months => retention_months) < now()
     order by ends_at
     limit p_limit
  loop
    select count(*) into v_regs
      from public.registrations where event_id = v_event.id;

    -- Items first: their FK to message_jobs has no cascade (job-level
    -- idempotency keys belong to items), and some items have no registration.
    delete from public.message_job_items where event_id = v_event.id;
    delete from public.message_jobs where event_id = v_event.id;
    -- Intent items cascade with the intent row (and with registrations).
    delete from public.bulk_action_intents where event_id = v_event.id;
    -- Cascades: status history, review notes, message items, intent items,
    -- webinar attendance, check-ins, passes.
    delete from public.registrations where event_id = v_event.id;

    update public.events
       set purged_at = now(), updated_at = now()
     where id = v_event.id;

    insert into public.audit_log (org_id, event_id, actor_kind, action,
      target_table, target_id, summary)
    values (v_event.org_id, v_event.id, 'system', 'event.data_purged',
      'events', v_event.id::text,
      jsonb_build_object('registrations_purged', v_regs));

    v_purged := v_purged + 1;
  end loop;

  -- Scope the bypass to this function call, even inside a longer
  -- transaction (pgTAP runs whole files in one transaction).
  perform set_config('app.allow_purge', '', true);

  return jsonb_build_object('events_purged', v_purged);
end;
$$;

revoke execute on function public.purge_due_event_data(integer)
  from public, anon, authenticated;
grant execute on function public.purge_due_event_data(integer) to service_role;
