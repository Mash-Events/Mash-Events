-- 0019 submissions inbox (docs/system-design.md §16.4 phase 3: generic
-- per-event forms). One table for contact, speaker application, volunteer
-- application and media accreditation submissions. Public inserts go through
-- the submit_submission RPC (called by the public route after proxy-marker,
-- rate-limit and schema checks); staff with submissions.review triage the
-- inbox. Everything is event-scoped and archived read-only.

insert into public.role_permissions (role, permission) values
  ('super_admin', 'submissions.review'),
  ('org_admin', 'submissions.review'),
  ('reviewer', 'submissions.review');

create table public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  kind text not null check (kind in
    ('contact', 'speaker_application', 'volunteer_application',
     'media_accreditation')),
  name text not null check (length(name) between 1 and 100),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                             and length(email) <= 320),
  message text not null check (length(message) between 1 and 4000),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'in_review', 'done')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index event_submissions_inbox_idx
  on public.event_submissions (event_id, status, created_at desc);

create trigger event_submissions_org before insert
  on public.event_submissions
  for each row execute function app.fill_org_from_event();
create trigger event_submissions_tenancy before update
  on public.event_submissions
  for each row execute function app.prevent_tenancy_change();
create trigger event_submissions_archived before insert or update or delete
  on public.event_submissions
  for each row execute function app.prevent_archived_write();
create trigger event_submissions_updated_at before update
  on public.event_submissions
  for each row execute function app.set_updated_at();

alter table public.event_submissions enable row level security;
alter table public.event_submissions force row level security;
revoke all on public.event_submissions from anon, authenticated;
grant select on public.event_submissions to authenticated;
create policy event_submissions_select on public.event_submissions
  for select to authenticated
  using (
    event_id = (select app.pinned_event())
    and (select app.has_event_permission(app.pinned_event(), 'submissions.review'))
  );

-- Public submission intake. The route (not the caller) has already checked
-- the proxy marker, rate limits and the body schema; the RPC re-validates
-- the shapes that matter and blocks draft/archived events.
create or replace function public.submit_submission(
  p_event_id uuid,
  p_kind text,
  p_name text,
  p_email text,
  p_message text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_org uuid;
begin
  select e.status, e.org_id into v_status, v_org
    from public.events e where e.id = p_event_id;
  if not found or v_status in ('draft', 'archived') then
    return jsonb_build_object('result', 'not_found');
  end if;

  if p_kind not in ('contact', 'speaker_application',
                    'volunteer_application', 'media_accreditation') then
    raise exception 'invalid kind' using errcode = 'check_violation';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 100 then
    raise exception 'invalid name' using errcode = 'check_violation';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or length(p_email) > 320 then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;
  if p_message is null or length(trim(p_message)) < 1
     or length(p_message) > 4000 then
    raise exception 'invalid message' using errcode = 'check_violation';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    p_payload := '{}'::jsonb;
  end if;

  insert into public.event_submissions (event_id, kind, name, email,
    message, payload)
  values (p_event_id, p_kind, trim(p_name), lower(p_email),
          trim(p_message), p_payload);

  return jsonb_build_object('result', 'received');
end;
$$;

revoke execute on function public.submit_submission(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;

-- Triage transitions for staff. Only the inbox states move; the content and
-- tenancy never change.
create or replace function public.review_submission(
  p_event_id uuid,
  p_submission_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not app.has_event_permission(p_event_id, 'submissions.review') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('new', 'in_review', 'done') then
    raise exception 'invalid status' using errcode = 'check_violation';
  end if;

  update public.event_submissions
     set status = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission_id
     and event_id = p_event_id
   returning org_id into v_org;

  if v_org is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_org, p_event_id, auth.uid(), 'user',
    'submission.reviewed', 'event_submissions', p_submission_id::text,
    jsonb_build_object('status', p_status));

  return jsonb_build_object('result', 'updated');
end;
$$;

revoke execute on function public.review_submission(uuid, uuid, text)
  from public, anon;
grant execute on function public.review_submission(uuid, uuid, text)
  to authenticated;
