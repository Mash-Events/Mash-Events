-- 0015 WhatsApp queue (docs/system-design.md §8.1): registrations with an
-- explicit opt-in and a phone number also receive the confirmation on
-- WhatsApp. Items are queued exactly like email — same jobs/items tables,
-- channel 'whatsapp' — and are claimed per event by the WhatsApp drainer.
-- Sends happen only when the Azure channel is configured (transport gates).

create or replace function app.enqueue_registration_whatsapp(
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
             where t.event_id = p_event_id and t.channel = 'whatsapp'
               and t.template_key = p_template and not t.enabled) then
    return;
  end if;

  select * into v_reg from public.registrations
   where id = p_registration_id and event_id = p_event_id;
  -- Explicit opt-in with a number recorded; anything else is a no-op.
  if not found or v_reg.whatsapp_opt_in_at is null
     or v_reg.phone_e164 is null then
    return;
  end if;

  if exists (select 1 from public.message_job_items i
             where i.event_id = p_event_id and i.idempotency_key = p_key) then
    return;
  end if;

  insert into public.message_jobs (org_id, event_id, channel, template_key, kind)
  values (v_reg.org_id, p_event_id, 'whatsapp', p_template, 'transactional')
  returning id into v_job;

  insert into public.message_job_items (org_id, event_id, job_id,
    registration_id, channel, template_key, recipient, idempotency_key, priority)
  values (v_reg.org_id, p_event_id, v_job, v_reg.id, 'whatsapp', p_template,
    v_reg.phone_e164, p_key, 5);
end;
$$;
revoke execute on function app.enqueue_registration_whatsapp(uuid, uuid, text, text)
  from public, anon, authenticated;

-- Extend the history trigger: a confirmation also queues WhatsApp for
-- opted-in registrations (email remains the primary channel).
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
    if v_template = 'confirmed' then
      perform app.enqueue_registration_whatsapp(new.event_id, new.registration_id,
        'confirmed', 'wa:confirmed:' || new.registration_id || ':' || new.id);
    end if;
  end if;
  return new;
end;
$$;
