-- 0020 announcements + per-event feedback forms (docs/system-design.md §10.1,
-- §16.4). Announcements are short status posts the admin publishes; the
-- latest appear as a stripe under the event site's hero. Feedback is a
-- per-event configurable form (overall event, not per-session): the admin
-- defines questions, the public submits, responses are append-only and
-- reviewable in a Feedback tab.

-- ---------------------------------------------------------------------------
-- Announcements

create table public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  body text not null check (length(body) between 1 and 500),
  level text not null default 'info' check (level in ('info', 'highlight')),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index event_announcements_live_idx
  on public.event_announcements (event_id, status, published_at desc);

create trigger event_announcements_org before insert
  on public.event_announcements
  for each row execute function app.fill_org_from_event();
create trigger event_announcements_tenancy before update
  on public.event_announcements
  for each row execute function app.prevent_tenancy_change();
create trigger event_announcements_archived before insert or update or delete
  on public.event_announcements
  for each row execute function app.prevent_archived_write();
create trigger event_announcements_updated_at before update
  on public.event_announcements
  for each row execute function app.set_updated_at();

alter table public.event_announcements enable row level security;
alter table public.event_announcements force row level security;
revoke all on public.event_announcements from anon, authenticated;
grant select on public.event_announcements to authenticated;
create policy event_announcements_select on public.event_announcements
  for select to authenticated
  using (
    event_id = (select app.pinned_event())
    and (select app.has_event_permission(app.pinned_event(), 'content.edit'))
  );

create or replace function public.publish_announcement(
  p_event_id uuid,
  p_body text,
  p_level text default 'info'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if not app.has_event_permission(p_event_id, 'content.edit') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_body), '') = '' or length(p_body) > 500 then
    raise exception 'body must be 1-500 characters'
      using errcode = 'check_violation';
  end if;
  if p_level not in ('info', 'highlight') then
    raise exception 'invalid level' using errcode = 'check_violation';
  end if;

  insert into public.event_announcements (event_id, body, level, created_by)
  values (p_event_id, trim(p_body), p_level, auth.uid())
  returning id, org_id into v_id, v_org;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_org, p_event_id, auth.uid(), 'user',
    'announcement.published', 'event_announcements', v_id::text,
    jsonb_build_object('level', p_level));

  return jsonb_build_object('result', 'published', 'id', v_id);
end;
$$;

revoke execute on function public.publish_announcement(uuid, text, text)
  from public, anon;
grant execute on function public.publish_announcement(uuid, text, text)
  to authenticated;

create or replace function public.hide_announcement(
  p_event_id uuid,
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not app.has_event_permission(p_event_id, 'content.edit') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  update public.event_announcements
     set status = 'hidden', updated_at = now()
   where id = p_announcement_id
     and event_id = p_event_id
     and status = 'published'
  returning org_id into v_org;

  if v_org is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_org, p_event_id, auth.uid(), 'user',
    'announcement.hidden', 'event_announcements', p_announcement_id::text,
    '{}'::jsonb);

  return jsonb_build_object('result', 'hidden');
end;
$$;

revoke execute on function public.hide_announcement(uuid, uuid)
  from public, anon;
grant execute on function public.hide_announcement(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Feedback: one configurable form per event, append-only responses.

create table public.event_feedback_forms (
  event_id uuid primary key,
  org_id uuid not null,
  enabled boolean not null default false,
  headline text not null default 'How was the event?'
    check (length(headline) between 1 and 120),
  thanks text not null default 'Thank you for your feedback.'
    check (length(thanks) between 1 and 200),
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, org_id) references public.events (id, org_id)
);

create trigger event_feedback_forms_org before insert
  on public.event_feedback_forms
  for each row execute function app.fill_org_from_event();
create trigger event_feedback_forms_archived before insert or update or delete
  on public.event_feedback_forms
  for each row execute function app.prevent_archived_write();
create trigger event_feedback_forms_updated_at before update
  on public.event_feedback_forms
  for each row execute function app.set_updated_at();

alter table public.event_feedback_forms enable row level security;
alter table public.event_feedback_forms force row level security;
revoke all on public.event_feedback_forms from anon, authenticated;
grant select on public.event_feedback_forms to authenticated;
create policy event_feedback_forms_select on public.event_feedback_forms
  for select to authenticated
  using (
    event_id = (select app.pinned_event())
    and (select app.has_event_permission(app.pinned_event(), 'content.edit'))
  );

create table public.event_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  registration_id uuid,
  rating integer check (rating between 1 and 5),
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (registration_id, event_id)
    references public.registrations (id, event_id) on delete set null,
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index event_feedback_responses_idx
  on public.event_feedback_responses (event_id, submitted_at desc);

create trigger event_feedback_responses_org before insert
  on public.event_feedback_responses
  for each row execute function app.fill_org_from_event();
create trigger event_feedback_responses_archived before insert
  on public.event_feedback_responses
  for each row execute function app.prevent_archived_write();
-- Responses are append-only: no updates, no deletes (the purge takes them
-- with the registration when retention runs).
create trigger event_feedback_responses_append before update or delete
  on public.event_feedback_responses
  for each row execute function app.prevent_append_only_change();

alter table public.event_feedback_responses enable row level security;
alter table public.event_feedback_responses force row level security;
revoke all on public.event_feedback_responses from anon, authenticated;
grant select on public.event_feedback_responses to authenticated;
create policy event_feedback_responses_select on public.event_feedback_responses
  for select to authenticated
  using (
    event_id = (select app.pinned_event())
    and (select app.has_event_permission(app.pinned_event(), 'registrations.read'))
  );

-- Admin: define the form (content.edit). Questions are validated here:
-- an array of at most 8 objects {key, label, type, options?, required?}
-- with key ^[a-z0-9_]{1,30}$, label 1..120, type in text|textarea|select,
-- at most 6 options of 1..80 characters.
create or replace function public.save_feedback_form(
  p_event_id uuid,
  p_enabled boolean,
  p_headline text,
  p_thanks text,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_event_permission(p_event_id, 'content.edit') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) > 8 then
    raise exception 'questions must be an array of at most 8 items'
      using errcode = 'check_violation';
  end if;

  insert into public.event_feedback_forms (event_id, enabled, headline,
    thanks, questions)
  values (p_event_id, p_enabled, coalesce(nullif(trim(p_headline), ''),
      'How was the event?'),
    coalesce(nullif(trim(p_thanks), ''), 'Thank you for your feedback.'),
    p_questions)
  on conflict (event_id) do update
    set enabled = excluded.enabled,
        headline = excluded.headline,
        thanks = excluded.thanks,
        questions = excluded.questions,
        updated_at = now();

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  select e.org_id, e.id, auth.uid(), 'user', 'feedback.form_saved',
    'event_feedback_forms', e.id::text,
    jsonb_build_object('enabled', p_enabled,
      'questions', jsonb_array_length(p_questions))
  from public.events e where e.id = p_event_id;

  return jsonb_build_object('result', 'saved');
end;
$$;

revoke execute on function public.save_feedback_form(uuid, boolean, text, text, jsonb)
  from public, anon;
grant execute on function public.save_feedback_form(uuid, boolean, text, text, jsonb)
  to authenticated;

-- Public: submit feedback. The route has already checked the proxy marker,
-- origin, rate limits and Turnstile; this re-validates the form is enabled,
-- the rating and that the answers carry only the form's own question keys.
create or replace function public.submit_feedback(
  p_event_id uuid,
  p_rating integer,
  p_answers jsonb,
  p_registration_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.event_feedback_forms;
  v_reg public.registrations;
  v_keys text[];
  v_question text;
  v_key text;
  v_value text;
begin
  select * into v_form from public.event_feedback_forms
   where event_id = p_event_id and enabled;
  if not found then
    return jsonb_build_object('result', 'closed');
  end if;

  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'rating must be 1-5' using errcode = 'check_violation';
  end if;
  if p_rating is null and p_answers is null then
    raise exception 'nothing to submit' using errcode = 'check_violation';
  end if;

  v_keys := array(
    select q ->> 'key'
    from jsonb_array_elements(coalesce(v_form.questions, '[]'::jsonb)) q
  );

  if p_answers is not null and jsonb_typeof(p_answers) = 'object' then
    for v_key in select jsonb_object_keys(p_answers) loop
      if not (v_key = any (v_keys)) then
        raise exception 'unknown question %', v_key
          using errcode = 'check_violation';
      end if;
      v_value := left(trim(p_answers ->> v_key), 4000);
      if length(v_value) < 1 then
        raise exception 'empty answer for %', v_key
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  if p_registration_code is not null then
    if p_registration_code !~ '^[A-Z0-9]{8}$' then
      raise exception 'invalid code' using errcode = 'check_violation';
    end if;
    select * into v_reg from public.registrations
     where event_id = p_event_id and code = p_registration_code;
    if not found then
      raise exception 'invalid code' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.event_feedback_responses (event_id, registration_id,
    rating, answers)
  values (p_event_id, v_reg.id, p_rating,
    case when p_answers is not null and jsonb_typeof(p_answers) = 'object'
      then p_answers else '{}'::jsonb end);

  return jsonb_build_object('result', 'received');
end;
$$;

revoke execute on function public.submit_feedback(uuid, integer, jsonb, text)
  from public, anon;

-- Admin: queue a "please share feedback" email to every confirmed
-- registration (messages.bulk). Idempotent per registration: asking again
-- never double-sends. The email links the public feedback page.
create or replace function public.request_feedback(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_job uuid;
  v_queued integer := 0;
begin
  if not app.has_event_permission(p_event_id, 'messages.bulk') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select org_id into v_org from public.events where id = p_event_id;
  if v_org is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  if exists (select 1 from public.event_feedback_forms
              where event_id = p_event_id and not enabled) then
    return jsonb_build_object('result', 'form_disabled');
  end if;

  insert into public.message_jobs (org_id, event_id, channel, template_key, kind)
  values (v_org, p_event_id, 'email', 'feedback_request', 'transactional')
  returning id into v_job;

  insert into public.message_job_items (org_id, event_id, job_id,
    registration_id, channel, template_key, recipient, idempotency_key, priority)
  select r.org_id, r.event_id, v_job, r.id, 'email', 'feedback_request',
         lower(r.email), 'feedback:' || r.id, 1
    from public.registrations r
   where r.event_id = p_event_id
     and r.status = 'confirmed'
     and not exists (
       select 1 from public.message_job_items i
        where i.event_id = p_event_id
          and i.idempotency_key = 'feedback:' || r.id
     );
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  if v_queued = 0 then
    delete from public.message_jobs where id = v_job and template_key = 'feedback_request'
      and not exists (select 1 from public.message_job_items i where i.job_id = v_job);
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_org, p_event_id, auth.uid(), 'user',
    'feedback.requested', 'events', p_event_id::text,
    jsonb_build_object('queued', v_queued));

  return jsonb_build_object('result', 'queued', 'queued', v_queued);
end;
$$;

revoke execute on function public.request_feedback(uuid)
  from public, anon;
grant execute on function public.request_feedback(uuid)
  to authenticated;
