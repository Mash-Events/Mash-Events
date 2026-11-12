-- 0021 public content carries announcements and the feedback form
-- (extends public_event_content from 20261109150000, which is already
-- deployed, so it is redefined here rather than amended).

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
      from public.event_sponsors p where p.event_id = e.id and p.visible), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body,
        'level', a.level, 'published_at', a.published_at)
        order by a.published_at desc)
      from public.event_announcements a
      where a.event_id = e.id and a.status = 'published'
      limit 10), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_build_object('enabled', f.enabled, 'headline', f.headline,
        'thanks', f.thanks, 'questions', f.questions)
      from public.event_feedback_forms f
      where f.event_id = e.id and f.enabled), null)
  )
  from public.events e
  join public.organizations o on o.id = e.org_id
  where e.id = p_event_id
    and e.status not in ('draft', 'archived')
    and o.status = 'active'
$$;

revoke execute on function public.public_event_content(uuid) from public;
grant execute on function public.public_event_content(uuid)
  to anon, authenticated, service_role;
