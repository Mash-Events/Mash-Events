-- 0004 lock Supabase's auto-RLS helper.
-- Hosted projects ship `public.rls_auto_enable()` (fired by the `ensure_rls`
-- event trigger). It returns event_trigger, so it cannot run as an RPC, but
-- the security advisor flags its EXECUTE grant to anon/authenticated.
-- Revoking EXECUTE does not stop the event trigger from firing.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'rls_auto_enable'
      and pronamespace = 'public'::regnamespace
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
