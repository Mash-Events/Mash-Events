-- Local demo data for sites/demo (never applied to production).
-- Load into the local stack:
--   docker exec -i supabase_db_Mash-Events psql -U postgres < supabase/demo.sql
-- Then open http://demo.localhost:3000/<event-slug> with `npm run dev`.

insert into public.organizations (id, slug, name)
values ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', 'demo', 'Demo Org')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Event 1: minimal webinar example (sites/demo/launch-webinar)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Event 2: Orbit Summit 2026 — a full fake client event
-- (sites/demo/orbit-summit). One day, two tracks, hybrid; exercises
-- speakers, tracks, rooms, session_speakers and sponsor tiers.
-- ---------------------------------------------------------------------------

insert into public.events (id, org_id, slug, name, short_name, kind, timezone,
  status, starts_at, ends_at, registration_opens_at, registration_closes_at,
  capacity, waitlist_enabled, review_mode)
values ('9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
  'orbit-summit', 'Orbit Summit 2026', 'Orbit Summit', 'hybrid', 'Asia/Kolkata',
  'registration_open',
  '2026-12-18 09:00:00+05:30', '2026-12-18 16:30:00+05:30',
  now() - interval '2 days', '2026-12-16 23:59:00+05:30',
  300, true, 'manual')
on conflict (id) do nothing;

insert into public.event_speakers (id, org_id, event_id, name, title, affiliation, bio, sort)
values
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4001', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Arjun Malhotra', 'Founder & CEO', 'Orbit',
   'Arjun has spent twelve years shipping developer tools and now runs Orbit, a Bengaluru infrastructure company.', 1),
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4002', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Meera Krishnan', 'VP Engineering', 'Northwind Labs',
   'Meera scaled Northwind''s payments platform from one million to a hundred million daily events without a single all-hands-on-deck weekend.', 2),
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4003', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Dr. Nandini Iyer', 'Principal Researcher', 'Example Institute',
   'Nandini studies how engineering teams actually make decisions. Her field research covers forty companies across India and South-East Asia.', 3),
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4004', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Rahul Deshpande', 'Head of Design', 'Sample Studio',
   'Rahul built Sample Studio''s design system from a two-person side project into the backbone of nine products.', 4),
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4005', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Priya Nair', 'Staff Engineer', 'Example Cloud',
   'Priya keeps Example Cloud''s managed Postgres fleet alive across three regions and writes about failure modes so you do not have to meet them personally.', 5),
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4006', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Vikram Singh', 'CTO', 'Example Labs',
   'Vikram moved Example Labs from a service mesh he no longer understands to event-driven services he says he still does not understand, but faster.', 6),
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4007', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Sofia Alvarez', 'Director of Data', 'Sample Co',
   'Sofia''s team cut Sample Co''s analytics bill by seventy percent while doubling the questions it can answer. She keeps receipts.', 7),
  ('4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4008', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Kavya Menon', 'Developer Advocate', 'Northwind Labs',
   'Kavya teaches accessibility to teams that think it is a checkbox. Her clinics have been standing-room-only at three conferences.', 8)
on conflict (id) do nothing;

insert into public.event_sessions (id, org_id, event_id, title, description,
  starts_at, ends_at, track, room, sort)
values
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5001', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Opening keynote: The next orbit',
   'Where the industry goes next, and why this year matters more than the last five.',
   '2026-12-18 09:00:00+05:30', '2026-12-18 09:30:00+05:30', 'Main stage', 'Grand Hall', 1),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5002', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Building for a billion users',
   'Latency, cost and the humility loop: what Meera''s team learned serving users whose first smartphone is a 2G feature phone.',
   '2026-12-18 09:35:00+05:30', '2026-12-18 10:20:00+05:30', 'Main stage', 'Grand Hall', 2),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5003', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Design systems that actually ship',
   'Governance without committees: how nine product teams share one system and still release weekly.',
   '2026-12-18 10:30:00+05:30', '2026-12-18 11:15:00+05:30', 'Build', 'Hall A', 3),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5004', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Postgres, multi-region, on a budget',
   'Read replicas, logical shipping and the three alerting rules that catch most incidents before users do.',
   '2026-12-18 10:30:00+05:30', '2026-12-18 11:15:00+05:30', 'Scale', 'Hall B', 3),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5005', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Research-driven product decisions',
   'Running honest experiments when the stakes are high, the sample is small, and everyone already knows the answer.',
   '2026-12-18 11:30:00+05:30', '2026-12-18 12:15:00+05:30', 'Build', 'Hall A', 4),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5006', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Event-driven everything, safely',
   'Sagas, outboxes and poison messages: a field guide to async systems that wake you up at 3 a.m. only when it matters.',
   '2026-12-18 11:30:00+05:30', '2026-12-18 12:15:00+05:30', 'Scale', 'Hall B', 4),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5007', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Lunch and networking',
   'Street food from eleven kitchens in the Atrium. Tables are labelled by topic — sit anywhere, argue politely.',
   '2026-12-18 12:15:00+05:30', '2026-12-18 13:15:00+05:30', null, 'Atrium', 5),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5008', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Accessible by default',
   'A live audit of real products, and the twenty patterns that fix most findings without a redesign.',
   '2026-12-18 13:15:00+05:30', '2026-12-18 14:00:00+05:30', 'Build', 'Hall A', 6),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5009', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Real-time analytics without the bill',
   'Streaming, batching and the art of not recalculating what did not change.',
   '2026-12-18 13:15:00+05:30', '2026-12-18 14:00:00+05:30', 'Scale', 'Hall B', 6),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5010', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Panel: The next five years',
   'Three practitioners disagree, politely, about AI-assisted engineering, hiring and where the industry is overcorrecting.',
   '2026-12-18 14:15:00+05:30', '2026-12-18 15:15:00+05:30', 'Main stage', 'Grand Hall', 7),
  ('5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5011', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Closing: Demo night and what''s next',
   'Five-minute live demos from the community, judged by the speakers, then the closing note.',
   '2026-12-18 15:30:00+05:30', '2026-12-18 16:30:00+05:30', 'Main stage', 'Grand Hall', 8)
on conflict (id) do nothing;

insert into public.event_session_speakers (org_id, event_id, session_id, speaker_id, sort)
values
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5001', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4001', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5002', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4002', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5003', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4004', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5004', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4005', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5005', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4003', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5006', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4006', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5008', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4008', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5009', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4007', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5010', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4003', 1),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5010', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4002', 2),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5010', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4004', 3),
  ('0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10', '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f',
   '5f6a7b8c-9d0e-4f1a-8b2c-0d1e2f3a5011', '4e5f6a7b-8c9d-4e0f-9a1b-0c1d2e3f4001', 1)
on conflict do nothing;

insert into public.event_sponsors (id, org_id, event_id, name, tier, url, sort)
values
  ('6a7b8c9d-0e1f-4a2b-9c3d-0e1f2a3b6001', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Example Cloud', 'Title', 'https://example.org', 1),
  ('6a7b8c9d-0e1f-4a2b-9c3d-0e1f2a3b6002', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Northwind Labs', 'Platinum', 'https://example.org/northwind', 2),
  ('6a7b8c9d-0e1f-4a2b-9c3d-0e1f2a3b6003', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Sample Co', 'Gold', 'https://example.org/sample', 3),
  ('6a7b8c9d-0e1f-4a2b-9c3d-0e1f2a3b6004', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Example Institute', 'Gold', 'https://example.org/institute', 4),
  ('6a7b8c9d-0e1f-4a2b-9c3d-0e1f2a3b6005', '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10',
   '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f', 'Bengaluru Builders Community', 'Community', 'https://example.org/community', 5)
on conflict (id) do nothing;
