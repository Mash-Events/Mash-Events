-- 0017 spot (walk-up) registration at the gate (docs/system-design.md §5.4,
-- §7, §16.4: spot registration = registrations.source='spot'). Created by
-- staff with registrations.review for THIS event; confirmed immediately and
-- checked in for today in one action. Audited; no emails are queued.

create or replace function public.create_spot_registration(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_organisation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_id uuid;
  v_code text;
  v_day date;
begin
  if not app.has_event_permission(p_event_id, 'registrations.review') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status = 'archived' then
    return jsonb_build_object('result', 'not_found');
  end if;

  if coalesce(trim(p_first_name), '') = '' or length(p_first_name) > 100 then
    raise exception 'first name is required' using errcode = 'check_violation';
  end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.registrations (org_id, event_id, code, email,
    first_name, last_name, organisation, status, consent_at, consent_version,
    source)
  values (v_event.org_id, p_event_id, v_code, lower(nullif(p_email, '')),
    trim(p_first_name), coalesce(trim(p_last_name), ''),
    nullif(trim(p_organisation), ''), 'confirmed', now(), 'spot', 'spot')
  returning id into v_id;

  v_day := coalesce((now() at time zone v_event.timezone)::date, current_date);
  insert into public.check_ins (org_id, event_id, registration_id, event_day,
    method, created_by)
  values (v_event.org_id, p_event_id, v_id, v_day, 'spot', auth.uid())
  on conflict (event_id, registration_id, event_day) do nothing;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_event.org_id, p_event_id, auth.uid(), 'user',
    'registration.spot', 'registrations', v_id::text,
    jsonb_build_object('code', v_code, 'checked_in', found));

  return jsonb_build_object('result', 'created', 'registration_id', v_id,
    'code', v_code);
end;
$$;

revoke execute on function public.create_spot_registration(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_spot_registration(uuid, text, text, text, text)
  to authenticated;
