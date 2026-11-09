-- 0003 access: event pin, permission checks, platform policies, membership RPCs
-- (docs/system-design.md §6.2, §6.5, §12.3)

-- The event pinned for this request by createEventClient (x-mash-event).
-- A bug-catcher, not the security boundary: permissions are (§12.3).
create or replace function app.pinned_event()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(
    (current_setting('request.headers', true)::json ->> 'x-mash-event'),
    ''
  )::uuid
$$;

-- MFA level of the caller's JWT.
create or replace function app.is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;

-- Does the caller hold `p_perm` on event `p_event`? Union of live event, org
-- and platform memberships; requires aal2. Definer so it can read
-- memberships/events without recursive RLS.
create or replace function app.has_event_permission(p_event uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_aal2()
     and exists (
       select 1
       from public.memberships m
       join public.role_permissions rp
         on rp.role = m.role and rp.permission = p_perm
       join public.events e on e.id = p_event
       where m.user_id = (select auth.uid())
         and m.revoked_at is null
         and (
           m.scope = 'platform'
           or (m.scope = 'org' and m.org_id = e.org_id)
           or (m.scope = 'event' and m.event_id = e.id and m.org_id = e.org_id)
         )
     )
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_aal2()
     and exists (
       select 1 from public.memberships m
       where m.user_id = (select auth.uid())
         and m.revoked_at is null
         and m.scope = 'platform'
         and m.role = 'super_admin'
     )
$$;

-- Event ids the caller may see in the event picker.
create or replace function app.visible_event_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.events e
  where app.is_aal2()
    and exists (
      select 1 from public.memberships m
      where m.user_id = (select auth.uid())
        and m.revoked_at is null
        and (
          m.scope = 'platform'
          or (m.scope = 'org' and m.org_id = e.org_id)
          or (m.scope = 'event' and m.event_id = e.id)
        )
    )
$$;

revoke execute on function app.pinned_event(), app.is_aal2(),
  app.has_event_permission(uuid, text), app.is_platform_admin(),
  app.visible_event_ids() from public, anon;
grant execute on function app.pinned_event(), app.is_aal2(),
  app.has_event_permission(uuid, text), app.is_platform_admin(),
  app.visible_event_ids() to authenticated;

-- Platform policies (no event pin; §12.3 "Platform tables").
grant select on public.events, public.organizations, public.role_permissions,
  public.memberships, public.member_invites, public.audit_log to authenticated;

create policy events_select on public.events for select to authenticated
  using (id in (select app.visible_event_ids()));

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select e.org_id from public.events e
                where e.id in (select app.visible_event_ids()))
         or (select app.is_platform_admin())
         or exists (select 1 from public.memberships m
                    where m.user_id = (select auth.uid()) and m.revoked_at is null
                      and m.scope = 'org' and m.org_id = organizations.id
                      and (select app.is_aal2())));

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (true);

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));

create policy member_invites_select on public.member_invites for select to authenticated
  using ((select app.is_platform_admin()));

create policy audit_log_select on public.audit_log for select to authenticated
  using (
    (event_id = (select app.pinned_event())
     and (select app.has_event_permission(app.pinned_event(), 'audit.read')))
    or (select app.is_platform_admin())
  );

-- Membership changes only through these RPCs (super admin in phase 1).
create or replace function public.grant_membership(
  p_user_id uuid,
  p_scope text,
  p_role text,
  p_org_id uuid default null,
  p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  insert into public.memberships (user_id, scope, role, org_id, event_id, created_by)
  values (p_user_id, p_scope, p_role, p_org_id, p_event_id, auth.uid())
  returning id into v_id;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (p_org_id, p_event_id, auth.uid(), 'user', 'membership.granted',
    'memberships', v_id::text,
    jsonb_build_object('scope', p_scope, 'role', p_role, 'user_id', p_user_id));
  return v_id;
end;
$$;

create or replace function public.revoke_membership(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.memberships;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  update public.memberships
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_membership_id and revoked_at is null
  returning * into v_row;
  if not found then
    raise exception 'membership not found or already revoked'
      using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_row.org_id, v_row.event_id, auth.uid(), 'user', 'membership.revoked',
    'memberships', v_row.id::text,
    jsonb_build_object('scope', v_row.scope, 'role', v_row.role, 'user_id', v_row.user_id));
end;
$$;

revoke execute on function public.grant_membership(uuid, text, text, uuid, uuid),
  public.revoke_membership(uuid) from public, anon;
grant execute on function public.grant_membership(uuid, text, text, uuid, uuid),
  public.revoke_membership(uuid) to authenticated;

-- One-time bootstrap of the first super admin per environment (§6.2). Runs
-- only from the SQL editor as postgres, and only while no platform admin
-- exists. No email or id is ever committed to the (public) repo.
create or replace function app.bootstrap_super_admin(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.memberships
             where scope = 'platform' and revoked_at is null) then
    raise exception 'a platform admin already exists';
  end if;

  insert into public.memberships (user_id, scope, role)
  values (p_user_id, 'platform', 'super_admin')
  returning id into v_id;

  insert into public.audit_log (actor_kind, action, target_table, target_id, summary)
  values ('system', 'membership.bootstrap', 'memberships', v_id::text,
    jsonb_build_object('user_id', p_user_id));
  return v_id;
end;
$$;
revoke execute on function app.bootstrap_super_admin(uuid)
  from public, anon, authenticated, service_role;
