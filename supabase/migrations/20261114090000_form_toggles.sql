-- 0024 form toggles (the TASI admin settings pattern, ported per-event):
-- an admin can close the public submissions form and set the notification
-- inbox from the Settings screen. Fail-open: an event with no
-- submissions_open key behaves exactly as before.

-- update_event is redefined (originals: 20261109140000, redefined in
-- 20261109170000 for the webinar settings merge) to also accept
-- submissions_open and submission_inbox_email in the settings merge.
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

  if p_changes ? 'join_url' and p_changes ->> 'join_url' is not null
     and p_changes ->> 'join_url' !~ '^https://[^\s]{4,500}$' then
    raise exception 'join_url must be an https URL' using errcode = 'check_violation';
  end if;
  if p_changes ? 'submission_inbox_email' and p_changes ->> 'submission_inbox_email' is not null
     and btrim(p_changes ->> 'submission_inbox_email') <> ''
     and btrim(p_changes ->> 'submission_inbox_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'submission_inbox_email must be an email address' using errcode = 'check_violation';
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
    listed = coalesce((p_changes ->> 'listed')::boolean, e.listed),
    settings = e.settings
      || case when p_changes ? 'join_url' then jsonb_build_object('join_url', p_changes -> 'join_url') else '{}'::jsonb end
      || case when p_changes ? 'join_window_minutes'
              then jsonb_build_object('join_window_minutes',
                     least(240, greatest(0, (p_changes ->> 'join_window_minutes')::integer)))
              else '{}'::jsonb end
      || case when p_changes ? 'submissions_open'
              then jsonb_build_object('submissions_open', (p_changes ->> 'submissions_open')::boolean)
              else '{}'::jsonb end
      || case when p_changes ? 'submission_inbox_email'
              then jsonb_build_object('submission_inbox_email',
                     nullif(btrim(p_changes ->> 'submission_inbox_email'), ''))
              else '{}'::jsonb end
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

revoke execute on function public.update_event(uuid, jsonb) from public, anon;
grant execute on function public.update_event(uuid, jsonb) to authenticated;

-- public_event_content is redefined (original: 20261109150000) so sites can
-- show a closed notice. Only the boolean is exposed publicly — never the
-- inbox address. Absent or non-boolean key means open (fail-open).
create or replace function public.public_event_content(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'name', e.name, 'short_name', e.short_name,
      'kind', e.kind, 'timezone', e.timezone, 'starts_at', e.starts_at,
      'ends_at', e.ends_at, 'status', e.status,
      'registration_open', e.status = 'registration_open'
        and (e.registration_opens_at is null or now() >= e.registration_opens_at)
        and (e.registration_closes_at is null or now() <= e.registration_closes_at),
      'registration_opens_at', e.registration_opens_at,
      'registration_closes_at', e.registration_closes_at,
      'submissions_open', coalesce((e.settings ->> 'submissions_open')::boolean, true),
      'org', jsonb_build_object('slug', o.slug, 'name', o.name)
    ),
    'speakers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'title', s.title,
        'affiliation', s.affiliation, 'bio', s.bio, 'photo_path', s.photo_path)
        order by s.sort, s.name)
      from public.event_speakers s where s.event_id = e.id and s.visible), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title,
        'description', x.description, 'starts_at', x.starts_at, 'ends_at', x.ends_at,
        'track', x.track, 'room', x.room,
        'speaker_ids', coalesce((select jsonb_agg(ss.speaker_id order by ss.sort)
                                 from public.event_session_speakers ss
                                 join public.event_speakers sp
                                   on sp.id = ss.speaker_id and sp.visible
                                 where ss.session_id = x.id), '[]'::jsonb))
        order by x.starts_at nulls last, x.sort)
      from public.event_sessions x where x.event_id = e.id and x.visible), '[]'::jsonb),
    'sponsors', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'tier', p.tier,
        'logo_path', p.logo_path, 'url', p.url) order by p.sort, p.name)
      from public.event_sponsors p where p.event_id = e.id and p.visible), '[]'::jsonb)
  )
  from public.events e
  join public.organizations o on o.id = e.org_id
  where e.id = p_event_id
    and e.status not in ('draft', 'archived')
    and o.status = 'active'
$$;

revoke execute on function public.public_event_content(uuid) from public;
grant execute on function public.public_event_content(uuid) to anon, authenticated, service_role;
