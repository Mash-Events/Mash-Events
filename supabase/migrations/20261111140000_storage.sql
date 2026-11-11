-- 0014 storage buckets and policies (docs/system-design.md §10.3, §12.3,
-- §12.11, S11). Writes always happen server-side with the service role after
-- the route checked permissions and built the path from ITS event id; the
-- policies below only guard direct reads.

insert into storage.buckets (id, name, public)
values ('event-assets', 'event-assets', true),
       ('event-private', 'event-private', false)
on conflict (id) do nothing;

-- Public event content: speaker/sponsor photos under event-assets/<event_id>/…
-- Nothing sensitive lives here and object names are random (S11).
create policy event_assets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'event-assets');

-- Private event data: exports, PDFs, attachments under
-- event-private/<event_id>/… . Operators download through short-TTL signed
-- URLs created server-side for the workspace event; the pinned-event policy
-- below only allows listing inside a workspace that holds exports.pii.
create policy event_private_pinned_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-private'
    and split_part(name, '/', 1) = (select app.pinned_event())::text
    and (select app.has_event_permission(app.pinned_event(), 'exports.pii'))
  );
