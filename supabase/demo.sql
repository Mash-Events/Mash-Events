-- Local demo data for sites/demo/launch-webinar (never applied to production).
-- Load into the local stack:
--   docker exec -i supabase_db_Mash-Events psql -U postgres < supabase/demo.sql
-- Then open http://demo.localhost:3000/launch-webinar with `npm run dev`.

insert into public.organizations (id, slug, name)
values ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', 'demo', 'Demo Org')
on conflict (id) do nothing;

insert into public.events (id, org_id, slug, name, kind, timezone, status,
  starts_at, ends_at, review_mode)
values ('5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
  'launch-webinar', 'Launch Webinar', 'webinar', 'Asia/Kolkata', 'registration_open',
  now() + interval '14 days', now() + interval '14 days 1 hour', 'manual')
on conflict (id) do nothing;

insert into public.event_speakers (id, org_id, event_id, name, title, affiliation, bio, sort)
values
  ('6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c41', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35', 'Asha Rao', 'Head of Product', 'Example Labs',
   'Asha leads product at Example Labs and has shipped tools used by millions.', 1),
  ('6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c42', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35', 'Ravi Menon', 'Principal Engineer', 'Sample Co',
   'Ravi builds the systems behind large consumer apps.', 2)
on conflict (id) do nothing;

insert into public.event_sessions (id, org_id, event_id, title, description, starts_at, ends_at, sort)
values
  ('7b2e3d4c-5f6a-4b7c-9d8e-0f1a2b3c4d51', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35', 'Welcome', 'Why trust is a product feature.',
   now() + interval '14 days', now() + interval '14 days 10 minutes', 1),
  ('7b2e3d4c-5f6a-4b7c-9d8e-0f1a2b3c4d52', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35', 'Fireside chat', 'Shipping fast without breaking trust.',
   now() + interval '14 days 10 minutes', now() + interval '14 days 50 minutes', 2),
  ('7b2e3d4c-5f6a-4b7c-9d8e-0f1a2b3c4d53', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35', 'Q&A', null,
   now() + interval '14 days 50 minutes', now() + interval '14 days 1 hour', 3)
on conflict (id) do nothing;

insert into public.event_session_speakers (org_id, event_id, session_id, speaker_id, sort)
values
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35',
   '7b2e3d4c-5f6a-4b7c-9d8e-0f1a2b3c4d52', '6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c41', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35',
   '7b2e3d4c-5f6a-4b7c-9d8e-0f1a2b3c4d52', '6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c42', 2)
on conflict do nothing;

insert into public.event_sponsors (id, org_id, event_id, name, tier, url, sort)
values ('8c3f4e5d-6a7b-4c8d-ae9f-1a2b3c4d5e61', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
  '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35', 'Example Partner', 'Partner', 'https://example.org', 1)
on conflict (id) do nothing;
