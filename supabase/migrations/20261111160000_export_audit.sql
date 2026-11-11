-- 0016 export audit (docs/system-design.md §12.11, §12.12): every roster
-- export of personal data is recorded in the append-only audit log.

create or replace function app.record_export(
  p_event_id uuid,
  p_format text,
  p_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_event_permission(p_event_id, 'exports.pii') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (org_id, event_id, actor_user_id, actor_kind,
    action, target_table, target_id, summary)
  select e.org_id, e.id, auth.uid(), 'user', 'export.roster',
    'registrations', e.id::text,
    jsonb_build_object('format', p_format, 'count', p_count)
  from public.events e where e.id = p_event_id;
end;
$$;
revoke execute on function app.record_export(uuid, text, integer)
  from public, anon;
grant execute on function app.record_export(uuid, text, integer)
  to authenticated;
