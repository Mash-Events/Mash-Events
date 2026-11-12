-- 0018 certificates (docs/system-design.md §9.1 phase 3, §16.4): event-scoped
-- certificates of participation. One certificate per registration, issued by
-- staff with certificates.manage during/after the event (event status live
-- or completed; the archived guard blocks everything later). Delivery rides
-- the existing message pipeline: issue_certificates enqueues a
-- 'certificate_issued' email per new certificate; the claim link is a
-- deterministic HKDF token (core/certificates/cert-token.ts) — nothing
-- secret is stored beyond the row itself.

-- Permission for the admin tab and the RPCs.
insert into public.role_permissions (role, permission) values
  ('super_admin', 'certificates.manage'),
  ('org_admin', 'certificates.manage');

create table public.event_certificates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null default app.pinned_event(),
  registration_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9]{8}$'),
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  created_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, registration_id),
  unique (event_id, code),
  unique (id, event_id),
  foreign key (registration_id, event_id)
    references public.registrations (id, event_id) on delete cascade,
  foreign key (event_id, org_id) references public.events (id, org_id)
);
create index event_certificates_event_idx
  on public.event_certificates (event_id, status);

-- Standard treatment: org fill, updated_at, immutable tenancy, archived
-- read-only, RLS on and forced, select-only for authenticated.
create trigger event_certificates_org before insert
  on public.event_certificates
  for each row execute function app.fill_org_from_event();
create trigger event_certificates_tenancy before update
  on public.event_certificates
  for each row execute function app.prevent_tenancy_change();
create trigger event_certificates_archived before insert or update or delete
  on public.event_certificates
  for each row execute function app.prevent_archived_write();
create trigger event_certificates_updated_at before update
  on public.event_certificates
  for each row execute function app.set_updated_at();

alter table public.event_certificates enable row level security;
alter table public.event_certificates force row level security;
revoke all on public.event_certificates from anon, authenticated;
grant select on public.event_certificates to authenticated;
create policy event_certificates_select on public.event_certificates
  for select to authenticated
  using (
    event_id = (select app.pinned_event())
    and (select app.has_event_permission(app.pinned_event(), 'certificates.manage'))
  );

-- Issue certificates for an audience (docs §16.4). Idempotent: registrations
-- that already have a certificate are skipped, never duplicated. Every new
-- certificate queues its 'certificate_issued' email through the standard
-- pipeline (skipped when the event has that template disabled). One audit
-- row per call, not per certificate.
create or replace function public.issue_certificates(
  p_event_id uuid,
  p_audience text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reg record;
  v_id uuid;
  v_issued integer := 0;
  v_skipped integer := 0;
begin
  if not app.has_event_permission(p_event_id, 'certificates.manage') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_audience not in ('attended', 'confirmed') then
    raise exception 'audience must be attended or confirmed'
      using errcode = 'check_violation';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status in ('draft', 'archived') then
    return jsonb_build_object('result', 'not_found');
  end if;

  for v_reg in
    select r.id, r.first_name, r.code
      from public.registrations r
     where r.event_id = p_event_id
       and r.status = 'confirmed'
       and (
         p_audience = 'confirmed'
         or exists (
           select 1 from public.check_ins c
            where c.event_id = p_event_id
              and c.registration_id = r.id
         )
       )
     order by r.created_at
  loop
    -- The certificate code IS the registration code: one code per person,
    -- used on the badge, the claim page and the public verify page.
    insert into public.event_certificates (event_id, registration_id, code, created_by)
    values (p_event_id, v_reg.id, v_reg.code, auth.uid())
    on conflict (event_id, registration_id) do nothing
    returning id into v_id;

    if v_id is null then
      v_skipped := v_skipped + 1;
    else
      v_issued := v_issued + 1;
      perform app.enqueue_registration_email(
        p_event_id, v_reg.id, 'certificate_issued', 'cert:' || v_id
      );
      v_id := null;
    end if;
  end loop;

  if v_issued > 0 then
    insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
      action, target_table, target_id, summary)
    values (v_event.org_id, p_event_id, auth.uid(), 'user',
      'certificate.issued', 'event_certificates', p_event_id::text,
      jsonb_build_object('audience', p_audience, 'issued', v_issued,
        'skipped', v_skipped));
  end if;

  return jsonb_build_object('result', 'issued', 'issued', v_issued,
    'skipped', v_skipped);
end;
$$;

revoke execute on function public.issue_certificates(uuid, text)
  from public, anon;
grant execute on function public.issue_certificates(uuid, text)
  to authenticated;

-- Revoke: the certificate's claim link and verify page stop working, the
-- row stays (append-only style; purge takes it with the registration).
create or replace function public.revoke_certificate(
  p_event_id uuid,
  p_certificate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not app.has_event_permission(p_event_id, 'certificates.manage') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  update public.event_certificates
     set status = 'revoked', revoked_at = now()
   where id = p_certificate_id
     and event_id = p_event_id
     and status = 'issued'
  returning org_id into v_org;

  if v_org is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  values (v_org, p_event_id, auth.uid(), 'user',
    'certificate.revoked', 'event_certificates', p_certificate_id::text,
    '{}'::jsonb);

  return jsonb_build_object('result', 'revoked');
end;
$$;

revoke execute on function public.revoke_certificate(uuid, uuid)
  from public, anon;
grant execute on function public.revoke_certificate(uuid, uuid)
  to authenticated;
