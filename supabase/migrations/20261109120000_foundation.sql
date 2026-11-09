-- 0001 foundation (docs/system-design.md §12.3, §16.5)
-- Private helper schema, closed-by-default privileges, generic triggers.

create extension if not exists pgcrypto with schema extensions;

-- Helpers live in `app`, which is NOT exposed through the Data API.
create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- New tables, sequences and functions in `public` start closed: grants are
-- always explicit (Supabase's defaults would give anon/authenticated access).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema app
  revoke execute on functions from public, anon;

-- updated_at maintenance.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Tenancy columns never change after insert (§12.2 rule 5).
create or replace function app.prevent_tenancy_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id
     or new.event_id is distinct from old.event_id then
    raise exception 'org_id/event_id are immutable on %', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Append-only tables reject UPDATE and DELETE for every role (§12.12).
create or replace function app.prevent_append_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
