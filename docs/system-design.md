# Mash Events — System Design

Status: **v3 — approved by the owner on 2026-11-09.** Implementation starts with the seed and scaffold (§16.5).
Domain: not bought yet (planned: something like `mashevents.com`, DNS on
Cloudflare). This document uses `mash.example` as the placeholder root domain.

Decisions folded into v3 (from the owner, 2026-11-09): DNS stays on Cloudflare;
Mash has its own GitHub and Supabase accounts and reuses code from an existing
open-source single-event app (the seed codebase); Supabase **Free** plan for now; default
data retention **6 months** after the event, no DPA; **first pilot is a webinar**;
**WhatsApp notifications are in scope**; admin login is **Google sign-in or email +
password** (no email OTP).

Changes since v1: admin login is **Supabase Auth only** (Clerk removed everywhere,
§6); the engine is **built on a seed codebase** with a module-by-module reuse map
and migration order (§16). A self-review pass for isolation and security gaps is
recorded in Appendix A; its fixes are already applied in the sections above.

---

## 0. Summary

Mash Events is one Next.js application that runs event websites and the
registration back office for several client organisations (2–3 events per
month: webinars, conferences, workshops). It replaces "clone a
single-event site per client".

- **One repo, one deployment, one database.** A shared engine (`core/`) does
  registration, review, email, passes, check-in, admin and security. Each event's
  public pages are custom-coded in `sites/<org>/<event>/`. There is no CMS and no
  page builder.
- **Built on a seed codebase.** An existing single-event app's registration, review,
  email-job, pass, check-in and admin code is copied in, stripped of its event
  content and Clerk, and refactored to be event-scoped (§16).
- **Tenancy is organisation → event.** Every event-scoped row carries `org_id`
  and `event_id`. The event is the unit of isolation, not the organisation.
- **Subdomain per organisation:** `flipkart.mash.example/<event-slug>`. Admin lives
  on its own host: `admin.mash.example`.
- **One admin console, always inside a locked event workspace.** The event is
  in the URL of every admin page and every admin API call. Nothing is implied by
  session state.
- **Login: Supabase Auth, admins only, invite-only.** Google sign-in or email +
  password, with TOTP MFA on top. Roles live in a `memberships` table keyed on
  `auth.uid()`. Public attendees never log in.
- **Registration lifecycle:** `pending → confirmed | waitlisted | rejected`
  with human review.
- **Event isolation is the top requirement** (§12). It is enforced in independent
  layers: database constraints, RLS pinned to one event per request, the
  application's event-scoped data access layer, per-event signing keys, event-
  scoped caches, and automated leakage tests.

Stack: Next.js 16 (App Router, `proxy.ts`) on
Vercel, Supabase Postgres + Auth + Storage (Free plan to start), Resend (email),
Azure Communication Services Advanced Messaging (WhatsApp), Upstash
Redis (rate limiting), Cloudflare DNS + Turnstile (CAPTCHA), Sentry.

---

## 1. Goals and non-goals

### Goals

1. Launch a new event site in days by writing only its pages; the engine is reused.
2. No data, email, pass, cache entry or admin action can cross between events, even
   when two events run on the same day or overlap.
3. Public event pages are fast: static, small JS, good PageSpeed on mobile.
4. Handle registration-open spikes without dropping submissions.
5. Safe to keep in a **public** repository.
6. Reuse proven code from the seed codebase rather than rewrite it.

### Non-goals (phase 1)

- No CMS, no drag-and-drop builder, no theme marketplace.
- No self-serve sign-up of any kind. Client logins are a later phase (limited roles).
- No attendee accounts. Attendees use emailed signed links.
- No payments/ticketing. (Schema leaves room; see §17.)
- No native apps. Check-in runs in the mobile browser.
- No multi-region. One Supabase project (Mumbai, `ap-south-1`), Vercel `bom1`.
- No paid Supabase features at launch (Free plan): no PITR, no session time-box
  setting, no leaked-password check; §13 lists what replaces each.

---

## 2. Architecture

```
                    ┌──────────────────────── Vercel (one Next.js app) ────────────────────────┐
 flipkart.mash.example ─┐                                                                       │
 idh.mash.example ──────┼─► proxy.ts ── host+path → (org, event) ──► /site/[org]/[event]/...     │
 admin.mash.example ────┘      │                                      (static/ISR, sites/*)      │
                               └── admin host ──► Supabase session refresh (@supabase/ssr)      │
                                                  /admin/o/[org]/e/[event]/...  (dynamic)       │
                                                  /api/admin/events/[eventId]/...               │
                    │  /api/public/events/[eventId]/...   (rewrite target only; see §4.2)       │
                    │  /api/internal/...                  (cron, job drain, webhooks)           │
                    └───────────────┬───────────────────────────┬───────────────────────────────┘
                                    │                           │
                     Supabase Postgres (RLS) + Auth     Resend · Upstash · Turnstile · Sentry
                     Supabase Storage (per-event paths)
```

### 2.1 Repository layout

```
src/
  app/
    site/[org]/[event]/[[...path]]/page.tsx   # renders a site module (internal path, see §4)
    admin/o/[org]/e/[event]/...                # admin workspace pages
    admin/(platform)/...                       # super-admin: orgs, events, members
    auth/                                      # sign-in (Google, password), callback, confirm, reset, mfa
    api/public/events/[eventId]/...            # register, magic-link actions, webinar join
    api/admin/events/[eventId]/...             # every admin API is event-scoped
    api/admin/platform/...                     # super-admin only (orgs, events, members)
    api/internal/...                           # cron drain, Resend webhooks
  proxy.ts                                     # host → org/event rewrite, auth boundary
core/
  auth/              # Supabase SSR clients, session/AAL checks, invite flow, permissions
  db/                # event-scoped data access layer (§12.4); privileged/ is the only service-role user
  registration/      # lifecycle, validation, dedupe, review
  email/             # job queue, sender, template registry, webhooks
  passes/            # token signing, PDF/QR, webinar links
  checkin/           # scanner sessions, scan handling
  admin/             # workspace shell, panels, bulk-action intents
  security/          # rate limit, Turnstile, origin checks, input schemas
  audit/
  ui/                # shared primitives sites may import (form, speaker card…)
sites/
  registry.ts        # list of orgs and events, with hosts, slugs and event UUIDs
  <org>/
    org.ts           # org metadata: slug, hosts, brand defaults
    <event>/
      site.ts        # eventId (UUID), slug, routes, metadata
      pages/         # custom-coded page components (server components)
      emails/        # optional per-event email templates (React Email)
      pass/          # optional per-event pass/badge layout
      form.ts        # registration form field schema (zod) for this event
supabase/
  migrations/        # ordered SQL migrations (source of truth, §16.4)
  tests/             # pgTAP isolation tests
tests/               # node --test unit + integration tests (seed-codebase style)
```

`core/` never imports from `sites/`. `sites/<a>/<b>` never imports from another
site. Both rules are lint-enforced (`no-restricted-imports` with path patterns,
or `eslint-plugin-boundaries`).

Language: the seed codebase is mostly `.js`/`.cjs`. Copied modules stay JS at first (with
`allowJs`, JSDoc types); new engine code and anything touched in the event-scoping
refactor is converted to TypeScript. `tsc --noEmit` runs over both.

### 2.2 What lives in code vs the database

| Code (reviewed, versioned)                             | Database (edited from admin)                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Page layout, sections, styling, copy blocks            | Event record: name, dates, venue, timezone, status, registration window, capacity, settings |
| Registration form fields (zod schema per event)        | Registrations, review history, notes                                                        |
| Email template components and default copy             | Per-event sender, reply-to, subject overrides, enabled templates                            |
| Pass/badge layout                                      | Speakers, agenda sessions, sponsors (rows + images)                                         |
| Event UUID ↔ slug ↔ host mapping (`sites/registry.ts`) | Memberships, jobs, passes, check-ins, audit                                                 |

The seed codebase kept event facts in `EVENT_CONFIG` and speakers/programme in `src/data/*`.
In Mash those become the `events` row and the `event_speakers` / `event_sessions`
/ `event_sponsors` tables, because the team edits them near the event; layout
stays in code.

---

## 3. Tenancy model

```
organizations 1───* events 1───* (registrations, speakers, jobs, passes, ...)
      │                 │
      └──* memberships ─┘   (scope = platform | org | event; user_id = auth.users.id)
```

- An **organisation** is a client (Flipkart, IDH). It owns a subdomain.
- An **event** belongs to exactly one organisation and never moves.
- **Isolation unit = event.** Two events of the same org are as isolated from each
  other as events of different orgs. The org exists for routing, branding and
  role inheritance, not as a shared data pool.
- People who register for two events are two unrelated `registrations` rows. There
  is no global "attendee" table in phase 1. (Cross-event CRM is a deliberate
  non-goal; it would be the main source of leakage.)
- Attendees are **not** Supabase Auth users. `auth.users` holds admins only.

---

## 4. Routing

### 4.1 Hosts

| Host                  | Purpose                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `<org>.mash.example`  | Public sites for that org. `/<event-slug>/...`                                         |
| `admin.mash.example`  | Admin console, auth pages and admin APIs. Only host where Supabase Auth cookies exist. |
| `mash.example`        | Studio landing page (optional)                                                         |
| custom domain (later) | e.g. `events.client.example` → mapped to one org in the registry                       |

### 4.2 Resolution (`proxy.ts`)

1. Normalise host (lowercase, strip port, reject unknown hosts with 404). The host
   comes from `request.nextUrl.hostname`/`Host`; `X-Forwarded-Host` is not trusted
   for routing.
2. Look up host in the **in-code registry** (`sites/registry.ts`, compiled into
   the proxy bundle; no DB call on the hot path).
3. Public host: the first path segment is the event slug. Look it up in that org's
   events. Unknown → 404 page for the org.
4. Rewrite to the internal path `/site/<org>/<event>/<rest>`. Public API calls use
   the same shape: the browser posts to `/<event-slug>/api/register` on the org
   host, and the proxy rewrites it to `/api/public/events/<resolvedEventId>/register`.
   **The public event id is never taken from the client**; it only ever comes from
   host + slug resolution in the proxy.
5. Requests that arrive _directly_ at `/site/...`, `/api/public/...`, `/admin/...`,
   `/auth/...` or `/api/admin/...` on a public host, or at a public path on the
   admin host, are rejected (404). This stops one org's host from serving or
   writing to another org's event by path tricks (`flipkart.mash.example/site/idh/...`).
   Route handlers under `/api/public` (dynamic anyway) additionally check a
   proxy-set marker header that clients cannot forge (stripped from incoming
   requests, step 6), so a missed proxy matcher fails closed there. Pages under
   `/site` must **not** read request headers: calling `headers()` would turn them
   into dynamic renders and lose static generation. For pages, the guarantee is
   the proxy matcher itself (it covers every path except `_next/static` and
   files), checked by the proxy tests in §12.13.
6. Strip any client-sent `x-mash-*` header before anything else, then set
   `x-mash-event-id` / `x-mash-org-id` / `x-mash-rewrite` on rewritten requests
   (`NextResponse.rewrite(url, { request: { headers } })`). The rewritten path is
   the source of truth; headers are a consistency check.
7. On the **admin host only**, run the Supabase SSR session refresh (§6.4). Public
   hosts never touch Supabase Auth, so public pages carry no auth overhead and no
   `Set-Cookie`.

The registry entry carries the event UUID. The page loader fetches the event row
by UUID and asserts `row.org_id` matches the org's UUID and `row.slug` matches the
URL slug; mismatch → 404 + Sentry alert (catches a registry typo before it shows
the wrong event's data). A CI test also asserts registry slugs/hosts are unique.

### 4.3 Dev and preview fallback

- Local: `flipkart.localhost:3000/<event>` works in modern browsers (`*.localhost`
  resolves to loopback). Admin at `admin.localhost:3000`.
- Vercel preview deployments have one hostname, so a **path fallback**
  `/_preview/<org>/<event>/...` is enabled only when `MASH_ENV !== 'production'`.
  It returns 404 in production (checked at runtime and covered by a test).
  On previews, admin is served at `/admin` on the preview hostname (auth cookies
  stay host-only to that preview URL). Preview deployments point at the staging
  Supabase project only, with its own auth users.

### 4.4 Domain/TLS with DNS on Cloudflare

A wildcard domain (`*.mashevents.com`) on Vercel needs Vercel nameservers, because
Vercel issues wildcard certificates through a DNS-01 challenge. DNS stays on
Cloudflare, so Mash does **not** use a wildcard. Instead:

- Each org host (`flipkart.mash.example`, `admin.mash.example`) is added to the
  Vercel project explicitly, and Cloudflare gets a matching `CNAME` to Vercel's
  target, **DNS only (grey cloud)**. Vercel then issues a per-host certificate by
  HTTP-01. At 2–3 events a month this is one step per new org, done in the
  "create org" runbook (scriptable via the Vercel and Cloudflare APIs later).
- Grey cloud matters: with the Cloudflare proxy on, certificate renewals,
  `Host`/IP headers and Vercel's own edge caching become unreliable. Cloudflare's
  proxy/WAF is not used for these hosts; Vercel's firewall and the app's rate
  limits cover them.
- CAA records (if any) must allow Vercel's CA (Let's Encrypt).
- Unknown hosts never reach the app because only explicitly added domains are
  routed to the project; the proxy also rejects hosts missing from the registry.

---

## 5. Supabase schema outline

Conventions:

- `id uuid primary key default gen_random_uuid()`.
- Every event-scoped table has `org_id uuid not null`, `event_id uuid not null`,
  and a **composite FK** to its parent including `event_id` (§12.2).
- `created_at`, `updated_at timestamptz`.
- Emails stored as given; uniqueness on `lower(email)`.
- RLS enabled **and forced** on every table (§12.3).
- Timestamps in UTC; each event has an IANA `timezone` used for display and
  reminders.
- Helper functions live in schema `app`, which is **not** exposed through the Data
  API. Tables live in `public` with explicit grants only (§12.3).

### 5.1 Platform tables

```sql
organizations (
  id, slug unique, name, status check in ('active','suspended'),
  brand jsonb,                         -- default colours/logo path
  created_at, updated_at
)

events (
  id, org_id references organizations(id),
  slug,                                -- unique (org_id, slug)
  name, short_name, kind check in ('in_person','webinar','hybrid'),
  timezone, starts_at, ends_at,
  status check in ('draft','published','registration_open','registration_closed',
                   'live','completed','archived'),
  registration_opens_at, registration_closes_at,
  capacity int null, waitlist_enabled bool,
  review_mode check in ('manual','auto_confirm'),
  settings jsonb,                      -- non-secret per-event settings (old EVENT_CONFIG,
                                       -- form_settings), validated by zod on write
  pass_key_version int not null default 1,
  unique (id, org_id)                  -- target for composite FKs
)

memberships (
  id,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope check in ('platform','org','event'),
  org_id null references organizations, event_id null,
  role check in ('super_admin','org_admin','reviewer','checkin_staff'),
  created_by uuid, created_at, revoked_at null, revoked_by null,
  check scope/columns consistent:
    platform → org_id null, event_id null, role = 'super_admin'
    org      → org_id not null, event_id null, role in ('org_admin','reviewer')
    event    → org_id not null, event_id not null, role in ('reviewer','checkin_staff'),
  foreign key (event_id, org_id) references events(id, org_id)
)
-- one live membership per user and scope (expression index, not a table constraint)
create unique index memberships_live_uq on memberships
  (user_id, scope, coalesce(org_id, '00000000-0000-0000-0000-000000000000'),
                   coalesce(event_id, '00000000-0000-0000-0000-000000000000'))
  where revoked_at is null;
create index on memberships (user_id) where revoked_at is null;
-- events are never hard-deleted by app roles: no DELETE grant; archive instead (§12.10)

role_permissions (role, permission, primary key (role, permission))
                                       -- seeded by migration; read-only to everyone
member_invites (id, email_lower, scope, org_id, event_id, role, invited_by,
  user_id null, status check in ('sent','accepted','expired','revoked'),
  created_at, accepted_at)              -- audit of who invited whom
```

### 5.2 Event content (edited in admin, rendered by site code)

```sql
event_speakers  (id, org_id, event_id, name, title, affiliation, bio, photo_path, sort, visible)
event_sessions  (id, org_id, event_id, title, starts_at, ends_at, track, room, description, sort, visible)
event_session_speakers (org_id, event_id, session_id, speaker_id,
                        FK (session_id, event_id) → event_sessions(id, event_id),
                        FK (speaker_id, event_id) → event_speakers(id, event_id))
event_sponsors  (id, org_id, event_id, name, tier, logo_path, url, sort, visible)
```

These replace the seed codebase's `src/data/programme-2026*.js`, `speakers-2026.json`,
`partners-2026.js` and similar static files.

### 5.3 Registration

```sql
registrations (
  id, org_id, event_id,
  code text not null,                  -- human code, unique (event_id, code)
  email text not null, first_name, last_name, organisation null,
  phone_e164 text null,                -- normalised E.164, required only if WhatsApp opt-in
  whatsapp_opt_in_at timestamptz null, whatsapp_opt_in_version text null,
                                       -- explicit, unticked-by-default checkbox (§8.1)
  category null,                       -- attendee category, optional per event
  answers jsonb not null,              -- event-specific form fields, validated by site form.ts
  status check in ('pending','confirmed','waitlisted','rejected','cancelled'),
  status_changed_at, reviewed_by uuid null,
  consent_at timestamptz not null, consent_version text not null,
  source check in ('web','admin','spot','import'),
  created_at, updated_at,
  unique (id, event_id),               -- target for child FKs
  FK (event_id, org_id) → events(id, org_id)
);
create unique index on registrations (event_id, lower(email));

registration_status_history (id, org_id, event_id, registration_id,
  from_status, to_status, reason, actor_user_id, created_at,
  FK (registration_id, event_id) → registrations(id, event_id))

review_notes (id, org_id, event_id, registration_id, body, author_user_id, created_at, FK as above)
```

The seed codebase's separate `spot_registrations` table becomes `registrations.source = 'spot'`.

### 5.4 Passes, webinar links, check-in

```sql
passes (
  id, org_id, event_id, registration_id,
  token_hash bytea not null,           -- sha256 of the token; raw token never stored
  key_version int not null,
  kind check in ('qr','webinar_link'),
  status check in ('issued','revoked'),
  issued_at, revoked_at,
  unique (event_id, token_hash),
  unique (id, event_id),
  FK (registration_id, event_id) → registrations(id, event_id)
)
create unique index on passes (event_id, registration_id, kind) where status = 'issued';

checkin_devices (id, org_id, event_id, label, created_by, expires_at, revoked_at,
  device_secret_hash bytea not null, unique (id, event_id))
                                      -- a scanner session bound to one event (§12.7)

check_ins (id, org_id, event_id, registration_id, pass_id null, device_id null,
  event_day date not null, method check in ('qr','manual','spot'),
  created_by, created_at,
  unique (event_id, registration_id, event_day),
  FK (registration_id, event_id) → registrations(id, event_id),
  FK (pass_id, event_id) → passes(id, event_id),
  FK (device_id, event_id) → checkin_devices(id, event_id))

scan_log (id, org_id, event_id, device_id, outcome, reason, created_at)
                                      -- every scan attempt, including rejected ones
webinar_attendance (id, org_id, event_id, registration_id, first_joined_at, join_count,
  FK (registration_id, event_id) → registrations(id, event_id))
```

### 5.5 Messaging (email + WhatsApp)

```sql
event_whatsapp_settings (event_id pk, org_id, enabled bool,
  test_recipients text[],              -- operator phones for test sends
  updated_by, updated_at, FK (event_id, org_id) → events(id, org_id))

event_whatsapp_templates (id, org_id, event_id, template_key, enabled,
  provider_template_name text,         -- Meta-approved template name
  language text, param_map jsonb,      -- ordered fields, e.g. ["first_name","event_name","join_url"]
  unique (event_id, template_key))     -- replaces the seed codebase's AZURE_WHATSAPP_TEMPLATE_* env vars

event_email_settings (event_id pk, org_id, from_name, from_address, reply_to,
  test_recipients text[], updated_by, updated_at,
  FK (event_id, org_id) → events(id, org_id))

org_sender_domains (org_id, domain, verified_at)   -- Resend-verified domains per org

event_email_templates (id, org_id, event_id, template_key, enabled,
  subject_override null, updated_by, updated_at,
  unique (event_id, template_key))     -- bodies are code; DB only toggles/overrides subject

message_jobs (
  id, org_id, event_id, template_key,
  channel check in ('email','whatsapp'),
  kind check in ('transactional','bulk','reminder','pass'),
  status check in ('draft','queued','processing','completed','failed','cancelled'),
  intent_id null,                      -- bulk_action_intents, required for bulk
  total, sent, failed, skipped,        -- counters refreshed by RPC
  created_by, created_at, completed_at,
  unique (id, event_id),
  FK (intent_id, event_id) → bulk_action_intents(id, event_id)
)

message_job_items (
  id, org_id, event_id, job_id, registration_id,
  channel check in ('email','whatsapp'), -- equals the job's channel (checked in the claim)
  recipient text not null,             -- email or E.164 phone, snapshot at enqueue time
  idempotency_key text not null,       -- unique (event_id, idempotency_key)
  status check in ('queued','processing','sent','failed','retrying','skipped'),
  priority smallint not null,          -- 0 transactional, 1 reminder, 2 bulk (§12.5)
  attempts, max_attempts, next_attempt_at,
  lease_id uuid null, locked_until null,   -- claim lease (§8, §12.5)
  batch_id uuid null,                  -- bulk batch composition, reused on retry (§8)
  payload_hash bytea null,             -- rendered payload hash from the first attempt
  last_error, provider_message_id null,
  FK (job_id, event_id) → message_jobs(id, event_id),
  FK (registration_id, event_id) → registrations(id, event_id)
)
create index on message_job_items (channel, status, priority, next_attempt_at, event_id);

message_deliveries (id, org_id, event_id, job_item_id, channel,
  provider text check in ('resend','azure_acs'), provider_message_id,
  status check in ('sent','delivered','read','bounced','complained','failed'), payload_summary, at,
  unique (provider, provider_message_id),
  FK (job_item_id, event_id) → message_job_items(id, event_id))

message_suppressions (id, org_id, event_id null, channel, recipient_normalised,
  reason, created_at)
                                      -- email: event-level unsubscribes, org-level hard bounces;
                                      -- whatsapp: opt-out ("STOP") platform-wide (org_id null),
                                      -- because every event shares one sender number (§8.1)
                                      -- (allowlisted by the schema linter as org-scoped)

reminders (id, org_id, event_id, template_key, send_at, audience jsonb,
  status check in ('scheduled','queued','sent','cancelled'), job_id null,
  FK (job_id, event_id) → message_jobs(id, event_id))
reminder_attachments (id, org_id, event_id, reminder_id, storage_path, ...)
```

The seed codebase had two job systems (`registration_email_jobs` and `pass_issue_email_jobs`)
plus per-feature delivery tables, and sent WhatsApp inline from the request. Mash
merges all of it into one `message_jobs` / `message_job_items` model with a
`channel` and a `kind`.

### 5.6 Bulk intents, audit

```sql
bulk_action_intents (
  id, org_id, event_id, action, filter jsonb,
  count int, selection_hash text,
  test_send_job_item_id null,           -- required for email bulk actions
  confirmed_at null, confirmed_by null, expires_at,
  status check in ('previewed','confirmed','executed','expired','cancelled'),
  unique (id, event_id)
)
bulk_action_intent_items (org_id, event_id, intent_id, registration_id,
  primary key (intent_id, registration_id),
  FK (intent_id, event_id) → bulk_action_intents(id, event_id),
  FK (registration_id, event_id) → registrations(id, event_id))
                                        -- selection frozen at preview

audit_log (id bigserial, org_id null, event_id null, actor_user_id null,
  actor_kind check in ('user','system','webhook'), action text, target_table, target_id,
  request_id, ip_hash, summary jsonb, created_at)
  -- append-only: no UPDATE/DELETE grants for any role, trigger rejects both (seed-codebase pattern)
```

### 5.7 Access functions (RPCs)

State changes that need atomicity are Postgres functions with `set search_path = ''`
and explicit `revoke execute ... from public, anon, authenticated` followed by
grants only to the roles that need them (seed-codebase pattern). Signature rule: the event
id is the first parameter and every statement inside filters on it.

| Function                                                                                                                 | Caller                                                         | Kind                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit_registration(p_event_id, p_payload, p_consent_version)`                                                          | `service_role` from the public route only                      | security definer                                                                                                                                                                                                                                         |
| `transition_registration(p_event_id, p_registration_id, p_to, p_reason)` / `apply_registration_reviews(p_event_id, ...)` | `authenticated`                                                | security definer (no direct update grant exists), checks permission + pin + allowed transition, writes history and audit                                                                                                                                 |
| `claim_message_job_items(p_event_id, p_limit, p_lease_seconds)`                                                          | `service_role` (drainer)                                       | security definer                                                                                                                                                                                                                                         |
| `finish_message_job_item(p_event_id, p_item_id, p_lease_id, p_result)`                                                   | `service_role`                                                 | security definer                                                                                                                                                                                                                                         |
| `refresh_message_job(p_event_id, p_job_id)`                                                                              | `service_role`                                                 | security definer                                                                                                                                                                                                                                         |
| `record_check_in(p_event_id, p_device_id, p_device_secret, p_token_hash)`                                                | `authenticated` (checkin_staff)                                | security definer, checks permission + pin **and** the device itself: `sha256(p_device_secret) = device_secret_hash`, device in `p_event_id`, not revoked or expired; looks up `(p_event_id, p_token_hash)`; computes `event_day` in the event's timezone |
| `create_bulk_intent` / `confirm_bulk_intent(p_event_id, p_intent_id, p_typed_name, p_selection_hash)`                    | `authenticated`                                                | security definer, checks permission + pin                                                                                                                                                                                                                |
| `grant_membership` / `revoke_membership`                                                                                 | `authenticated` (super_admin; later org_admin for lower roles) | security definer                                                                                                                                                                                                                                         |
| `public_event_content(p_event_id)`                                                                                       | `anon` (build/ISR fetch)                                       | security definer, published fields only                                                                                                                                                                                                                  |

Every `security definer` function that `authenticated` can call starts with:

```sql
if p_event_id is distinct from app.pinned_event() then raise exception 'event pin mismatch'; end if;
if not app.has_event_permission(p_event_id, '<perm>') then raise exception 'forbidden'; end if;
```

because definer functions owned by `postgres` bypass RLS (§12.3) and must re-apply
the same rules themselves.

---

## 6. Authentication and roles (Supabase Auth only)

### 6.1 Who logs in

- **Admins only.** `auth.users` contains the internal team (phase 1) and, later,
  limited client users. Nothing else.
- **Public attendees never log in.** They register anonymously (Turnstile + rate
  limits) and act afterwards through **signed, event-bound links** that Mash itself
  issues (status page, cancel, pass, webinar join; §9, §12.6). These are not
  Supabase Auth magic links and do not create `auth.users` rows.
- Clerk is not used anywhere: no Clerk packages, env vars, third-party-auth
  configuration or JWT bridging.

### 6.2 Login methods and invite-only sign-up

Admins sign in with **Google** or **email + password** (the email address is the
username). Both end at the same TOTP MFA step (§6.3). There is no email OTP / magic
link login.

Supabase Auth project settings (recorded in `docs/runbooks/auth-settings.md`):

- **Allow new users to sign up: off.** This also blocks first-time Google sign-ins:
  an unknown Google account gets "signups not allowed" and no user is created.
- Providers: **Email (password)** and **Google** on; anonymous, phone, magic link
  and all other OAuth providers off.
- Password policy: minimum 12 characters with lower, upper, digit and symbol
  required. (The leaked-password check is a paid feature; operator onboarding asks
  for a password-manager-generated password.)
- Auth CAPTCHA protection on (Cloudflare Turnstile), so password sign-in and reset
  requests carry a Turnstile token; Mash also rate-limits `/auth/*` per IP and per
  email (§13).
- "Confirm email" on; secure email change on (old and new address both confirm).
- Custom SMTP through Resend on a Mash auth subdomain, Mash-branded templates.
- Redirect URL allowlist: only `https://admin.mash.example/auth/**` (+ the staging
  admin URL and `admin.localhost` in non-production projects).
- The Google OAuth client is owned by the Mash Google Cloud project; its authorised
  redirect URI is the Supabase callback only.

Invite flow:

1. A super admin opens **Platform → Members → Invite**, chooses email, scope
   (platform/org/event) and role.
2. Server (`core/auth/invite.ts`, privileged) calls
   `auth.admin.inviteUserByEmail(email, { redirectTo: '/auth/confirm' })`. If the
   user already exists, no invite is sent and only a membership is added.
3. In the same request it calls `grant_membership(...)` for the returned
   `user.id` and writes `member_invites` + `audit_log`. If the membership write
   fails, the freshly invited user is deleted (compensating action) so no
   membership-less user lingers.
4. The invitee follows the link (invite template customised to
   `/auth/confirm?token_hash={{ .TokenHash }}&type=invite`). The GET only renders an
   "Accept invite" button; the POST (server action) calls
   `verifyOtp({ type: 'invite', token_hash })`, so link scanners that prefetch the
   URL cannot burn the one-time token.
5. The invitee then either **sets a password** (`updateUser({ password })`) or
   chooses **"Continue with Google"**. The invited user now exists with a confirmed
   email, so a Google sign-in with the same verified address is attached to that
   user by Supabase's automatic identity linking; no new user is created.
6. Straight to **MFA enrolment**; no admin page is reachable before it completes.

Sign-in thereafter:

- Password: `signInWithPassword({ email, password, options: { captchaToken } })`
  → TOTP challenge → admin.
- Google: `signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`
  (PKCE; the code verifier sits in an HttpOnly cookie set by the server client) →
  `/auth/callback` calls `exchangeCodeForSession(code)` → TOTP challenge → admin.
- Password reset: `resetPasswordForEmail` → emailed link → the same POST-click
  confirm page → set new password → TOTP challenge. A reset never skips MFA.

A Supabase user with no live membership can sign in but sees only "no access"; it
reads nothing because every policy requires a membership.

**Bootstrap (first super admin).** The repo is public, so no migration or seed
contains a real email or user id. The first super admin is created once per
environment by an operator: invite the user from the Supabase dashboard, then run
`select app.bootstrap_super_admin('<user uuid>')` in the SQL editor. That function
succeeds only while no platform membership exists, is executable only by
`postgres`, and writes an audit row. Local/CI fixtures use `example.org` users.

### 6.3 MFA

- **TOTP MFA required for every admin role**, for both password and Google logins
  (phase 1 is the internal team, so everyone). Phone/SMS MFA off. Google's own
  2-step verification does not count: Supabase cannot see it, so the `aal` claim
  stays `aal1` until the TOTP step.
- Enforced three times, independently:
  1. `proxy.ts` / admin layout: a session whose `aal` claim is not `aal2` is
     redirected to `/auth/mfa` (enrol or verify).
  2. `requireEventPermission()` and `requirePlatformPermission()` reject `aal1`.
  3. `app.has_event_permission()` in Postgres returns false unless
     `auth.jwt()->>'aal' = 'aal2'`, so even a stolen `aal1` token reads nothing.
- Recovery: each admin enrols two TOTP factors (phone + backup). A lost-device
  reset is a super-admin action (`auth.admin.mfa.deleteFactor`), audited, and the
  user must re-enrol at next sign-in.

### 6.4 Sessions in Next.js (`@supabase/ssr`)

- **Admin host only.** `proxy.ts` creates a `createServerClient` with the request
  and response cookie adapters and calls `supabase.auth.getClaims()` so expired
  access tokens are refreshed and the new cookies are written onto the response.
  It does not run on public hosts.
- Server components, route handlers and server actions create their own
  `createServerClient` from `cookies()` (`core/auth/server.ts`). Authorisation
  decisions use `getClaims()` (JWT verified against the project's asymmetric
  signing keys / JWKS, no network round trip), **never `getSession()`**. The
  project must be switched to asymmetric JWT signing keys at setup; with the
  legacy shared secret, `getClaims()` falls back to a network call to Auth.
- Security-sensitive actions (membership changes, confirming a bulk intent,
  exports, MFA factor changes) additionally call `getUser()`, so a session revoked
  server-side is caught immediately.
- Sign-in, OAuth start/callback, password reset, MFA enrol/challenge and sign-out
  all run as **server actions or route handlers** (the server client writes the
  cookies), so admin has **no browser Supabase client**. Auth cookies are set
  **HttpOnly**, **Secure**, **SameSite=Lax**, **host-only** (no `Domain`
  attribute) on `admin.mash.example`. Org subdomains never receive them, and page
  scripts cannot read them. (SameSite=Lax still lets the top-level
  Google → Supabase → `/auth/callback` redirect carry the PKCE cookie.)
- Token lifetimes: access token (JWT) expiry 10 min; refresh-token rotation with
  reuse detection on.
- **Session limits on the Free plan.** Supabase's session time-box and inactivity
  timeout are paid settings, so Mash enforces them in the app: the proxy reads the
  JWT's `amr` timestamps and signs the user out once the first factor is older
  than **12 h**; an HttpOnly, HMAC-signed `mash_seen` cookie (refreshed at most
  once a minute) signs the user out after **2 h** of inactivity. Both call
  `signOut({ scope: 'local' })`, which also revokes that session's refresh token
  server-side. After a plan upgrade, the Supabase settings replace these checks.
- **Revocation.** Setting `memberships.revoked_at` takes effect on the next query
  because RLS reads the table, not JWT claims. To end a user's sessions entirely,
  the super admin bans or deletes the auth user (kills refresh tokens; the access
  token dies within ≤10 min, and RLS already denies it).
- Admin responses are `Cache-Control: private, no-store`; responses that set auth
  cookies are never cacheable.
- Sign-out: `signOut({ scope: 'local' })`; "sign out everywhere" uses
  `scope: 'global'`.

### 6.5 Roles and permissions

| Role            | Scope          | Can                                                                                                 |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `super_admin`   | platform       | Everything: create orgs/events, manage members, archive/unarchive                                   |
| `org_admin`     | org            | All event operations for that org's events; cannot create orgs or grant `super_admin`/`org_admin`   |
| `reviewer`      | event (or org) | View registrations, change status, add notes. No bulk email, no PII exports unless granted          |
| `checkin_staff` | event          | Check-in screen and scanner for that event only. Sees name + status of a scanned pass, nothing else |

- Permissions (`registrations.read`, `registrations.review`, `email.bulk`,
  `exports.pii`, `checkin.scan`, `content.edit`, `members.manage`, …) are rows in
  `role_permissions`, seeded by migration.
- Effective permission for an event = union over the user's live memberships that
  cover it (event membership, org membership for the event's org, platform).
- Same check in two places: `core/auth/permissions.ts` (`requireEventPermission`,
  used by every admin page and route) and `app.has_event_permission()` (used by
  RLS and definer RPCs). A unit test asserts both read the same permission table.
- No authorisation data lives in JWT claims or `user_metadata` (users can edit
  `user_metadata`); no custom access-token hook in phase 1, so revocation is never
  stale.
- **Phase 2 (client logins):** clients receive `reviewer` or a narrower
  `client_viewer` role on their own events only; exports and bulk email withheld
  by permission set. Same invite flow, same MFA rule.

```sql
create function app.has_event_permission(p_event uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'aal'), '') = 'aal2'
     and exists (
       select 1
       from public.memberships m
       join public.role_permissions rp on rp.role = m.role and rp.permission = p_perm
       join public.events e on e.id = p_event
       where m.user_id = (select auth.uid())
         and m.revoked_at is null
         and (   m.scope = 'platform'
              or (m.scope = 'org'   and m.org_id   = e.org_id)
              or (m.scope = 'event' and m.event_id = e.id))
     );
$$;
revoke execute on function app.has_event_permission from public, anon;
grant  execute on function app.has_event_permission to authenticated;
```

---

## 7. Registration lifecycle

```
            submit
              │
              ▼
          pending ──review──► confirmed ──► (pass / join link issued) ──► checked in / attended
              │                   │
              ├──► waitlisted ────┘ (promote)
              ├──► rejected
              └──► cancelled (by registrant or admin)
```

- `review_mode = 'manual'` (default): everything starts `pending`.
- `review_mode = 'auto_confirm'` for open webinars: `submit_registration` confirms
  immediately if capacity allows, else waitlists. Capacity is checked under a
  per-event advisory lock (`pg_advisory_xact_lock(hashtext(event_id::text))`) so
  concurrent submissions cannot overshoot.
- Allowed transitions are a fixed table in code and in the RPC (both, tested).
- Every transition writes `registration_status_history` and `audit_log`, and may
  enqueue an email item (acknowledgement, confirmed, waitlisted, rejected).
- Duplicate email for the same event → the same generic "thanks, check your email"
  response as a new registration (no status disclosed, no "already registered"
  oracle); a rate-limited resend of the acknowledgement goes to the address on
  file. Same email for a different event is a normal new registration.
- Registrant self-service (view status, cancel, re-fetch pass) via a link emailed
  to the address on file; the link carries a signed token scoped to
  `(event_id, registration_id, purpose)` with expiry (§12.6). No registrant
  accounts.

---

## 8. Email pipeline

Based on the seed codebase's job/item model (`registration-email-job-service.js`,
`claim_registration_email_job_items`), made event-scoped and unified.

1. **Enqueue.** An action creates `message_jobs` + `message_job_items` in one
   transaction. Each item has an `idempotency_key` such as
   `confirmed:<registration_id>` or `bulk:<intent_id>:<registration_id>`, unique per
   event, so retries and double-clicks never create two items.
2. **Drain.** Vercel cron (every minute) calls `/api/internal/email/drain` with a
   bearer secret; enqueue also triggers an immediate drain via `after()`. The
   drainer asks for events with due items, then for each event calls
   `claim_message_job_items(p_event_id, limit, lease_seconds)`, which uses
   `FOR UPDATE SKIP LOCKED`, sets `status='processing'`, a fresh `lease_id` and
   `locked_until`, and returns at most 100 items **of that one event**.
3. **Re-verify inside the claim** (§12.5): the claim's single query joins item →
   job → registration → event → email settings → template toggle; items that fail
   any check are marked `skipped` with a reason in the same statement and are not
   returned.
4. **Send.** Load the event's sender settings and template by the claimed
   items' `event_id` and render. Resend idempotency keys apply to a whole request
   and expire after 24 h, and reusing a key with a different payload is rejected,
   so the key must always describe exactly the same payload:
   - **Transactional** items (acknowledgement, confirmation, pass, join link) go
     one per request to the single-send endpoint with idempotency key
     `item:<item_id>`. A retry resends the identical payload, because the rendered
     subject/body hash is stored on the item at first attempt and re-rendering must
     match it, else the item fails for manual review.
   - **Bulk/reminder** items go in batches of ≤100. The claim stamps a `batch_id`
     on the items it returns, and the key is `batch:<batch_id>`. A failed batch is
     retried **with the same composition** (re-claimed by `batch_id`), so the key
     still describes the same payload; items are never re-batched under an old key.
     Every message is tagged with `event_id` and `job_item_id`.
5. **Finish.** `finish_message_job_item(p_event_id, item_id, lease_id, result)`
   updates only if `lease_id` still matches; a worker whose lease expired and was
   re-claimed cannot overwrite the newer result.
6. **Retry** with exponential backoff, max 5 attempts; 4xx from Resend (except 429)
   is permanent. Expired leases (`locked_until < now()`) become claimable again.
   A crash between "Resend accepted" and "finish" can lead to a re-send after the
   lease expires. The stable keys from step 4 let Resend de-duplicate that within
   24 h. After 24 h an item still `processing` is not retried automatically; it is
   marked `failed: unknown_outcome` and checked against Resend's logs by an operator.
7. **Webhooks** (`/api/internal/resend/webhook`, Svix signature verified) update
   `message_deliveries`, matched by `provider_message_id`; the tag `event_id` must
   equal the stored row's `event_id`.
8. **Suppressions**: hard bounces/complaints suppress the address for the org;
   unsubscribes suppress per event. Transactional mails (pass, confirmation) ignore
   marketing unsubscribes but honour hard bounces.

**Per-event sender:** `from_address` must be on a Resend-verified domain listed in
`org_sender_domains` for that org (or the Mash default domain); validated on save
and again at send time. Default sender is `"<Event name>" <events@mash.example>`
with the org's reply-to.

**Templates:** React Email components in code. Lookup order:
`sites/<org>/<event>/emails/<key>` → `sites/<org>/emails/<key>` → `core/email/templates/<key>`.
The lookup is a static map generated at build time (no dynamic path from DB
input). DB holds only `enabled` and `subject_override`. Rendering receives a
context built from the item's event only.

**Throughput:** Resend batch = 100 emails per request; with a conservative 2
requests/s the drainer can push ~10k emails in under 2 minutes. Each drain
invocation is time-boxed (e.g. 50 s) and stops claiming new batches near the
limit. Pass emails with PDF attachments are slower (render cost); see §10.

### 8.1 WhatsApp notifications

WhatsApp is a second channel on the same job/item queue, adapted from the seed codebase's
`azure-whatsapp.js` (Azure Communication Services Advanced Messaging). The seed codebase sent it
inline from the request with env-var templates; Mash queues it and reads templates
per event.

- **Opt-in only.** The registration form shows an unticked "Send me updates on
  WhatsApp" checkbox with the phone field. Only registrations with
  `whatsapp_opt_in_at` set ever get WhatsApp items. Phones are normalised to E.164
  on submit (default country per event).
- **Templates.** WhatsApp business-initiated messages must use Meta-approved
  templates. `event_whatsapp_templates` maps a Mash `template_key`
  (`confirmed`, `webinar_reminder`, `join_link`, …) to the approved template name,
  language and an ordered `param_map`. Parameters are filled from the claimed
  item's own event and registration only. Templates are written generically
  (event name is a parameter), so one approved template serves every event.
- **Sender.** Phase 1 uses one Mash WhatsApp Business number for all orgs. Every
  message therefore names the event and org in its body, and opt-outs are stored
  platform-wide (one number = one opt-out list). Per-org numbers are a later option.
- **Queue and isolation.** Same claim/lease/re-verify path as email (§8, §12.5),
  claimed per channel and per event. Priority: confirmation and join-link messages
  are transactional (0); reminders (1); WhatsApp is never used for bulk marketing
  in phase 1.
- **Limits.** A new WhatsApp Business number starts at a low daily limit of
  business-initiated conversations (Meta messaging tiers) that rises with quality.
  The drainer tracks a per-number daily budget in Redis and defers (not fails)
  items beyond it; the admin shows the remaining budget before a reminder is
  scheduled. Email remains the primary channel; WhatsApp is the nudge.
- **Delivery and opt-out events.** Azure delivers status and inbound messages via
  Event Grid to `/api/internal/whatsapp/events`. The endpoint completes Event Grid's
  subscription validation handshake, and every delivery must carry a secret custom
  header (constant-time compare). Status events are matched by
  `(provider='azure_acs', provider_message_id)`; the stored row's `event_id` is the
  only event used. Inbound "STOP"/"UNSUBSCRIBE" adds a platform-wide WhatsApp
  suppression.
- **Cost.** Each business-initiated template message is billed by Meta per
  conversation category (utility vs marketing); reminders are written to qualify as
  utility. Admin shows an estimate before sending.

---

## 9. Passes, check-in, webinar links

### 9.1 QR passes (in-person/hybrid)

- Token: `v1.<event_id_b64url>.<pass_id_b64url>.<mac>` where
  `mac = HMAC-SHA256(K_event, "pass|v1|" || event_id || "|" || pass_id)` truncated
  to 128 bits, and
  `K_event = HKDF-SHA256(ikm = PASS_MASTER_SECRET, salt = "mash-pass", info = event_id || "|" || key_version)`.
  (~70 chars base64url, fits a QR at version 5–6 with medium ECC.)
- DB stores `sha256(token)` only. Revocation = row status. Key rotation per event
  = bump `pass_key_version` and reissue.
- Pass email: PDF badge (per-event layout in `sites/.../pass/`) + inline QR image.
  QR images are generated on the fly behind the signed self-service link, not
  stored publicly (the seed codebase stored public QR images; avoid that).
- Pass lookup page for registrants: by signed self-service link only (no "enter
  email, get pass", which leaks registration existence). The seed codebase's
  `/api/my-pass` lookup is dropped.

### 9.2 Check-in

- Staff open `admin.mash.example/o/<org>/e/<event>/check-in` (signed in, MFA,
  `checkin.scan` on that event). The scanner page creates a `checkin_devices` row
  bound to that event; its device secret is kept in page memory only.
- Scan → `POST /api/admin/events/<eventId>/check-in/scan` with QR token + device id
  - device secret.
- Server: `eventRoute` checks session/permission for `eventId` → device row
  belongs to `eventId`, not revoked/expired, secret hash matches → parse token;
  embedded event id ≠ `eventId` → "different event" → verify HMAC with
  `K_<eventId>` → lookup `(event_id, token_hash)` → status checks →
  `record_check_in`.
- Offline mode is out of scope for phase 1; manual search-by-name fallback exists
  in the same event workspace.

### 9.3 Webinar join links

- For `kind = 'webinar'`, confirmation issues a `passes` row of kind
  `webinar_link`. Email contains `https://<org>.mash.example/<event>/join/<token>`.
- `/join/<token>` is a dynamic route (never cached). It verifies the token for
  **that** event (host/slug-resolved event must equal the token's event), records
  `webinar_attendance`, then 302s (`Cache-Control: no-store`) to the platform URL
  (Zoom/Teams/YouTube) stored in event settings.
- The platform URL is only revealed by the redirect, and only within a window
  (e.g. 30 min before start until end). Outside the window, a holding page.
- Shared links are possible (a confirmed registrant can forward the join URL);
  `join_count` and distinct IP-hash counts make abuse visible. Per-registrant
  platform links (Zoom registrants API) are a later integration; the redirect
  layer stays the same.

---

## 10. Performance

### 10.1 Rendering

- Event pages are **server components, statically generated** at build via
  `generateStaticParams` from `sites/registry.ts`, with on-demand revalidation:
  data fetchers use `'use cache'` + `cacheTag('event:<eventId>:content')`
  (`cacheComponents` enabled), and admin edits to speakers/agenda/sponsors call
  `revalidateTag('event:<eventId>:content', 'max')` (or `updateTag` from a server
  action). Time-based fallback: `cacheLife('hours')`.
- Because pages render at the internal path `/site/<org>/<event>/...` after the
  proxy rewrite, the route cache and ISR entries are keyed by org and event, not by
  the public host. Two events can never share a page cache entry.
- Event status (registration open/closed) is a small client island fetching a
  60-second-cached JSON endpoint, so the main page stays static.
- Public content fetches at build/ISR time use `public_event_content(p_event_id)`
  (anon, published fields only) — no service role in the render path.
- Admin is fully dynamic, `no-store`, never cached.

### 10.2 JavaScript budget

- Public pages ship no auth SDK, no analytics SDK beyond a lightweight one (e.g.
  Vercel Web Analytics), no chatbot. The seed codebase's heavy client libraries (three.js,
  tsparticles, GSAP, Lenis, Swiper, framer-motion, Sanity) are **not** carried over
  to `core/`; a site may opt into one only within its JS budget.
- Client JS only for islands: registration form, mobile nav, countdown. Turnstile
  script loads only when the form becomes visible.
- Each site is a separate dynamic import from the registry, so one site's
  components are not in another site's bundle (checked with
  `@next/bundle-analyzer` on demand).

### 10.3 Images and fonts

- `next/image` with AVIF/WebP, explicit `sizes`, `priority` only on the LCP image.
- Speaker/sponsor uploads are resized on upload (max 1600px) and stored under
  `event-assets/<event_id>/...`; served through `next/image` with
  `remotePatterns` limited to the project's storage host and that bucket path.
- Fonts via `next/font` (self-hosted, `display: swap`, subset).

### 10.4 Budget (mobile, Lighthouse/PageSpeed on a 4G profile)

| Metric                    | Budget                                 |
| ------------------------- | -------------------------------------- |
| Performance score         | ≥ 90 (target 95)                       |
| LCP                       | ≤ 2.0 s                                |
| CLS                       | ≤ 0.05                                 |
| INP                       | ≤ 200 ms                               |
| JS on landing page (gzip) | ≤ 120 KB total, ≤ 40 KB route-specific |
| Hero image                | ≤ 150 KB                               |

Lighthouse CI runs against preview deployments of changed sites (§15) and fails
under budget.

### 10.5 Registration spike path

Submission = Turnstile verify + rate-limit check + one RPC call over HTTP
(PostgREST, no connection pool pressure) + `after()` drain kick. Acknowledgement
email is queued, never inline. Target p95 < 400 ms server time.

---

## 11. Scale assumptions

- 2–3 events/month, 1k–10k registrations/month, maybe 20k rows/month across all
  tables. Postgres on the smallest paid Supabase tier is enough for years.
- Spike: up to ~2,000 submissions in 10 minutes after an announcement (≈3–5/s,
  peaks of 20/s). Vercel functions scale; the limit is Turnstile + one insert.
- Email: up to ~10k per bulk send; Resend batch handles it in minutes.
- Check-in: 1,000 attendees through 4–6 scanners in 30 minutes ≈ 1 scan/s.
- RLS cost: helper calls are wrapped as `(select ...)` so Postgres evaluates them
  once per statement (initPlan), and the `memberships (user_id) where revoked_at is
null` index keeps the permission check at a few index lookups.
- Load test (k6, as before) before the first large event against the staging
  project, not production.

---

## 12. Event isolation (top priority)

**Threat model.** Two events (same org or different orgs) run on the same day, or
overlap. We must prevent, at minimum:

- an admin seeing or exporting the wrong event's registrations;
- a bulk email going to the wrong event's list, or with the wrong event's sender
  or template;
- a pass from event A being accepted at event B's entrance;
- a cached page or API response for event A being served for event B;
- a job, webhook or cron run touching the wrong event;
- a code bug (missing `where event_id = ...`) silently mixing data;
- an admin of event A (e.g. a future client login) reaching event B's data at all.

**Principle.** The event is always explicit, always checked twice by independent
mechanisms, and impossible to omit. Isolation does not depend on any single layer.

### 12.1 Layers at a glance

| Layer      | Mechanism                                                                                                                  | Catches                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| L1 Schema  | `event_id not null` everywhere, composite FKs including `event_id`, unique keys scoped by event, immutable tenancy columns | Child rows pointing at another event's parent; cross-event dedupe                   |
| L2 RLS     | Forced RLS; policies require membership (by `auth.uid()`, MFA) **and** `event_id = pinned event of this request`           | Missing app filter; super-admin queries leaking across events; future client logins |
| L3 App     | Event-scoped data access layer; event in every URL/API path; host/slug ↔ id cross-check                                    | Wrong event chosen in UI/API; registry typos                                        |
| L4 Workers | Claims are per event; items carry `event_id`; processors re-verify all related rows; lease ids                             | Job/webhook mix-ups                                                                 |
| L5 Crypto  | Per-event HMAC keys for passes/links/devices                                                                               | Pass replay at another event                                                        |
| L6 Cache   | Keys/tags include event UUID; render path keyed by internal `/site/<org>/<event>`; admin never cached                      | Stale/mixed responses                                                               |
| L7 Process | Typed-name confirm, test send, archive read-only, audit                                                                    | Human error during back-to-back events                                              |
| L8 Tests   | pgTAP + integration leakage suite + schema linter in CI                                                                    | Regressions                                                                         |

### 12.2 L1 — Schema constraints

1. **`event_id` and `org_id` are `not null`** on every event-scoped table. No
   nullable "global" rows inside event tables (the only org-scoped exceptions,
   `message_suppressions` and `org_sender_domains`, are explicitly allowlisted).
2. **Composite parent keys.** `events` has `unique (id, org_id)`; each parent
   table has `unique (id, event_id)`. Every child FK includes `event_id`:
   ```sql
   alter table check_ins
     add constraint check_ins_registration_fk
     foreign key (registration_id, event_id)
     references registrations (id, event_id) on delete cascade;
   ```
   A `check_ins` row can therefore never reference a registration from another
   event, whatever the application sends. Same for job items → jobs, job items →
   registrations, passes → registrations, session_speakers → sessions/speakers,
   reminders → jobs, check-ins → devices/passes, intent items → intents.
   Nullable child columns (e.g. `check_ins.pass_id`) use the default `MATCH SIMPLE`,
   which skips the check when `pass_id` is null; that is correct here because
   `event_id` is never null and the constraint is enforced whenever `pass_id` is set.
3. **`org_id` consistency** via `foreign key (event_id, org_id) references events(id, org_id)`
   on every event-scoped table, so `org_id` cannot disagree with the event.
4. **Event-scoped uniqueness:** `(event_id, lower(email))`, `(event_id, code)`,
   `(event_id, token_hash)`, `(event_id, idempotency_key)`. Nothing is globally
   unique except primary keys (and `provider_message_id`, which Resend generates).
5. **Immutable tenancy columns.** A trigger on every event-scoped table rejects
   `UPDATE` that changes `event_id` or `org_id`. (Composite FKs also block it for
   children; the trigger covers parents.)
6. **Archived = read-only** at the database (§12.10).

### 12.3 L2 — Row Level Security pinned to one event per request

The seed codebase used deny-all RLS and the service role for everything. That gives no defence
if application code forgets a filter. Mash flips this: **admin requests run as the
signed-in user (`authenticated`) with RLS; the service role is the exception.**

**Identity.** Supabase Auth issues the JWT; PostgREST sets `role = authenticated`
and `auth.uid()` is the admin's user id. No third-party auth, no JWT bridging.
`auth.jwt()->>'aal'` carries the MFA level.

**Event pin.** Every server-side DB client is created per request for one event:
`createEventClient(eventId)` builds an `@supabase/ssr` server client with the user's
cookies **and** a global header `x-mash-event: <eventId>`. PostgREST exposes request
headers to SQL as the `request.headers` setting; policies read it via a helper:

```sql
create function app.pinned_event() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.headers', true)::json->>'x-mash-event', '')::uuid
$$;

alter table registrations enable row level security;
alter table registrations force row level security;

create policy registrations_select on registrations for select to authenticated
  using (event_id = (select app.pinned_event())
         and (select app.has_event_permission(app.pinned_event(), 'registrations.read')));
-- No insert/update/delete policies or grants for authenticated on registrations:
-- every status change goes through transition_registration / apply_registration_reviews,
-- so nobody can PATCH registrations through PostgREST and skip the transition table,
-- history, audit and email side effects.
```

**Workflow tables are read-only to `authenticated`.** `registrations`,
`registration_status_history`, `passes`, `check_ins`, `checkin_devices`,
`message_*`, `bulk_action_intents*`, `reminders` get a `select` grant (with the
pinned policy) and nothing else. Every write is an RPC that enforces the workflow
rules. Only plain content tables (`event_speakers`, `event_sessions`,
`event_sponsors`, `event_session_speakers`, `review_notes` insert) get direct
`insert`/`update` with pinned policies, and column-level grants exclude `id`,
`org_id`, `event_id` and timestamps.

**Platform tables** (no `event_id` pin, so they need their own rules):

- `organizations`, `events`: select where the user has any live membership that
  covers the row (platform, that org, or an event of it) and `aal2`; writes only
  via platform RPCs (`members.manage`/`events.manage`).
- `memberships`, `member_invites`: a user sees their own memberships; super admins
  see all through a platform view; writes only via `grant_membership` /
  `revoke_membership`.
- `audit_log`: per-event select where `event_id = pin` and `audit.read` on it;
  platform-wide select only for `super_admin` (`app.is_platform_admin()`); no
  insert grant (written by definer helpers and the privileged module).
- `role_permissions`: select for `authenticated`, no writes.

Because `event_id` must equal the pin, the permission check can take the pin as its
argument; both sub-selects are row-independent and evaluated once per statement.

Effect: even a super admin's query returns rows **only for the pinned event**. A
missing `.eq('event_id', …)` in app code still cannot return another event's
rows. A request with no pin sees nothing.

**What the pin is and is not.** The pin is a _bug-catcher_, not the security
boundary: a user who extracted their own JWT could call PostgREST directly with any
`x-mash-event`. The **security boundary is the membership check**: they would only
ever see events they already hold permission for. (Admin auth cookies are HttpOnly
and there is no browser Supabase client, which makes extracting the JWT harder, but
the design does not rely on it.)

**Grants.**

- `anon`: no table privileges at all (`revoke all on all tables in schema public from anon`
  plus default privileges revoked so new tables start closed). It may execute only
  `public_event_content`.
- `authenticated`: `select` on what each role may read; `insert`/`update` only on
  the content tables listed above (column-level); no `delete` anywhere. All
  workflow writes are RPCs.
- `service_role`: used only by the privileged module (§12.4).
- `app` schema is not in the Data API's exposed schemas; its functions are not
  callable as `/rpc/...`.

**FORCE RLS, honestly.** `FORCE ROW LEVEL SECURITY` makes the table owner subject
to policies, but roles with `BYPASSRLS` — on Supabase that includes `postgres` and
`service_role` — still skip them. So:

- `security definer` functions (owned by `postgres`) **do not** get RLS; each one
  re-applies the pin and permission check explicitly (§5.7) and filters every
  statement by `p_event_id`. pgTAP tests call every definer function with a
  mismatched pin and with a user lacking permission and expect an exception.
- Service-role code paths are protected by L3/L4 (mandatory `eventId` argument,
  static checks) rather than RLS.
  FORCE RLS is kept as defence in depth (e.g. if a future owner role lacks
  `BYPASSRLS`), not counted as a guarantee.

**Storage.** Bucket `event-assets` (public-read; object names are random UUIDs, so
a draft event's images are unguessable but not secret — nothing sensitive goes
there), object paths `<event_id>/...`; writes only via server route handlers with the service role
after `requireEventPermission(eventId, 'content.edit')`, path built from the route's
event id (client never supplies the prefix). Private bucket `event-private` for
exports/PDFs/attachments, read only through short-TTL signed URLs created server-side
for the workspace event. `storage.objects` policies for `authenticated` mirror the
pin + permission check on `(storage.foldername(name))[1]::uuid`.

### 12.4 L3 — Application layer

**Event in every URL.** Admin pages: `/admin/o/<orgSlug>/e/<eventSlug>/...`.
Admin APIs: `/api/admin/events/<eventId>/...`. There is no "current event" cookie,
no `localStorage` event, no global store default. Two browser tabs on two events
are safe because each tab's URL carries its own event.

**Workspace shell** (adapted from the seed codebase's `admin-shell.jsx`).

- Header shows org logo, event name, date and status in a fixed colour band unique
  per event (derived from event id), so staff can see which event they are in.
- Switching events = navigating to a different URL via an explicit picker. Unsaved
  forms block navigation (seed-codebase `AdminExitGuard`).
- Client data cache keys start with `eventId` (`['event', eventId, 'registrations', …]`).
  Workspace unmount clears the cache. (the seed codebase's `admin-api-cache.js` and
  `admin-registration-cache.cjs` are adapted to this key shape.)

**API handler contract.** Every admin route handler is wrapped:

```ts
export const POST = eventRoute({ permission: 'registrations.review', body: schema },
  async ({ event, db, actor, body }) => { ... })
```

`eventRoute` (replacing the seed codebase's `requireAdminOperator` / `requireAuthorizedOperator`):
parses `eventId` from the path (UUID), verifies the session via `getClaims()` with
`aal2`, loads the event, checks permission for that event, rejects archived events
for writes, rejects cross-site state changes (seed-codebase `isCrossSiteStateChange`),
builds `db = createEventClient(event.id)` and an audit context. Handlers never see
a raw Supabase client. Body fields named `event_id`/`eventId`/`org_id` are rejected
by the schema (event comes from the path only). Ids in the body (registration,
job, intent) are always looked up through `db`, so a foreign id returns 404.

**Response echo.** Every admin API response includes `eventId`; the client
wrapper asserts it equals the workspace's `eventId` and throws otherwise.

**Public side.** Browsers post to `/<event-slug>/api/...` on the org host; only the
proxy produces `/api/public/events/<eventId>/...`, from host + slug (§4.2). Direct
requests to `/api/public/...` are 404. The handler re-checks that the event row's
org matches the host's org and that `Origin` is that org host. A form for event A
cannot submit into event B, and no client-supplied id chooses the event. Public routes validate Turnstile (expected hostname + action), rate
limit, then call `submit_registration` via the privileged client — anon cannot
call it directly, so Turnstile/rate limits cannot be bypassed via PostgREST.

**Service role containment.** The service role key is imported in exactly one
module, `core/db/privileged/client.ts` (`server-only`; successor to the seed codebase's
`supabase-admin.js`). A lint rule forbids importing it anywhere else except
`core/db/privileged/**`, `core/auth/invite.ts` and `api/internal/**`. Allowed uses:
public registration RPC, job drain, webhooks, cron, storage writes, invites,
migrations/tests. Each privileged helper takes `eventId` as a required first
argument and applies it to every query; a unit test parses privileged modules and
asserts each `.from(...)` chain has an `event_id` filter or calls an RPC whose
first parameter is `p_event_id` (a heuristic backstop, not the main control).

### 12.5 L4 — Jobs, webhooks, cron

- `message_jobs`, `message_job_items`, `reminders` carry `org_id` + `event_id`, with
  composite FKs, so an item cannot reference another event's job or registration.
- The drainer processes **one event per claim**: it lists events with due items,
  then calls `claim_message_job_items(p_event_id, n, lease)`; returned items all
  belong to `p_event_id` (asserted again in TypeScript before rendering).
- **Re-verification inside the claim** (one SQL statement joining item → job →
  registration → event → email settings → template toggle):
  - all `event_id`s equal;
  - event status allows sending (not archived; bulk not allowed after `completed`
    unless explicitly flagged as post-event);
  - job not cancelled; intent (for bulk) is `confirmed`;
  - registration status still matches the template's requirement (e.g. pass emails
    only for `confirmed`);
  - `recipient` still equals the registration's current email (email items) or
    `phone_e164` (WhatsApp items) — else skip, the contact changed after enqueue;
  - WhatsApp items only: `whatsapp_opt_in_at` is set and the WhatsApp channel is
    enabled for the event;
  - recipient not suppressed for that channel;
  - template key is enabled for this event.
    Any failure → item `skipped` with reason, Sentry event tagged with both ids.
- **Lease ids:** finish/retry updates require the matching `lease_id`; stale
  workers are ignored.
- **Fairness between events (noisy neighbour).** All events share one Resend
  account and one drainer. Each drain pass claims **transactional** items
  (acknowledgement, confirmation, pass) for every event before any **bulk** or
  reminder items, and round-robins events in batches of ≤100, so a 10k bulk send
  for event A cannot delay event B's confirmations or day-of passes. Items carry
  a `priority` (transactional = 0, reminder = 1, bulk = 2) in the claim index.
- **Sender/template binding:** sender settings and template are looked up by the
  claimed batch's `event_id` inside the processor, never passed in from the job
  creator.
- **Webhooks:** match by `provider_message_id`; Resend tag `event_id` must equal the
  stored delivery row's `event_id`; mismatch → log + ignore.
- **Cron:** iterates events explicitly; no "update all pending items" statements
  without `event_id`. Cron and drain endpoints authenticate with a secret
  (`Authorization: Bearer $CRON_SECRET`, constant-time compare; the seed codebase
  `job-processor-auth.js`).

### 12.6 L5 — Signed tokens bound to the event

All bearer tokens Mash issues (QR pass, webinar join link, registrant self-service
link, check-in device secret) are HMAC-signed with a **per-event derived key** and
include the event id and a purpose string in the signed message. Verifying a token
requires choosing the event first (from the scanner's bound event, or the
host+slug), so event A's token fails under event B's key. DB lookup is then
`(event_id, token_hash)`, a second independent check. Self-service links carry an
expiry and purpose (`status`, `cancel`, `pass`), and state-changing ones (cancel)
require a POST confirmation page so link scanners cannot trigger them.

Keys are derived, not stored: one master secret per purpose in env
(`PASS_MASTER_SECRET`, `LINK_MASTER_SECRET`), HKDF per event and key version. These
are dedicated secrets; nothing is derived from the Supabase service role key (the seed codebase's
`certificate-session.cjs` did that; not carried over). Admin auth uses Supabase
Auth sessions, not these keys.

### 12.7 Scanners bound to one event

- A scanner session is a `checkin_devices` row with `event_id`; its secret is random,
  stored hashed, and expires at event end + 1 day. The scanner user still needs a
  live `checkin_staff` (or higher) membership with MFA; the device is a second
  binding, not a replacement for login.
- The scan endpoint path carries `eventId`; device, path and token must all agree.
- Rejected scans show a full-screen red "**Pass is for a different event**" (when
  the token's embedded event id differs) vs "Invalid pass" vs "Already checked in",
  and are written to `scan_log`.
- `checkin_staff` membership is event-scoped; staff working two events need two
  memberships and two separate scanner sessions, opened from two different
  workspace URLs.

### 12.8 Per-event email identity

- Sender, reply-to and templates are per event (§8). There is no global default
  "from" that a job could fall back to silently; missing settings → job fails to
  start with a clear error.
- Subject lines are prefixed by default with the event's short name.
- Test sends go only to `event_email_settings.test_recipients` or the operator's
  own verified email.

### 12.9 L6 — Caching and ISR

- Public data fetchers use `'use cache'` with `cacheTag('event:<eventId>:content')`;
  arguments (which form the cache key) always include `eventId`. A lint rule flags
  `'use cache'` functions without an `eventId` parameter in `core/` and `sites/`.
- Revalidation from admin calls `revalidateTag` with the workspace event id only.
- Render path is the internal `/site/<org>/<event>/...`, so ISR/route-cache entries
  are per event (§10.1).
- CDN: public pages vary by host + path naturally; no public response sets or
  varies on cookies.
- Admin pages and APIs: `Cache-Control: private, no-store`.
- Rate-limit and Redis keys are prefixed `evt:<eventId>:` where event-scoped.

### 12.10 Archived events are read-only

- `events.status = 'archived'` makes a trigger on every event-scoped table reject
  `INSERT/UPDATE/DELETE` for that event (except the `audit_log` insert and a
  `super_admin` unarchive RPC, itself audited). The retention purge job (§13) runs
  through a dedicated definer function that is the only allowed writer.
- Archived events: public site shows an "event has ended" page (optional), the
  registration RPC refuses, the drainer skips, scanners refuse.
- `completed` (between end and archive) allows reviews/certificates but blocks new
  registrations and bulk mail unless explicitly enabled.

### 12.11 L7 — Human-error controls for bulk actions

Every bulk action (email to a segment, status change of >1 registration, export,
pass issuance) is a two-step **intent**:

1. **Preview:** server computes the selection, freezes the registration ids into
   `bulk_action_intent_items` with `selection_hash` and `count`, and returns a
   summary: event name, org, count, sample of 5 recipients, template, sender.
2. **Test send (email actions):** a test send of the exact rendered email to the
   operator's own verified address is required before confirm; the intent stores
   the test item id.
3. **Confirm:** the operator types the **event name** exactly (case insensitive,
   whitespace-normalised). Server checks typed name, `selection_hash`,
   `expires_at` (15 min), fresh `getUser()`, and that the intent's `event_id` equals
   the path event.
4. **Execute** from the frozen ids only. Re-running a confirmed intent is a no-op.
   Exports are written to the private bucket under `<event_id>/exports/`, link
   expires in 10 minutes, and the file name includes org and event slug.

### 12.12 Audit trail

`audit_log` records every state change, every sign-in/MFA event that Supabase
exposes via the auth audit log (mirrored daily), every membership change and every
read of bulk PII (exports, full-list views) with `org_id`, `event_id`, actor,
action, target, request id. Append-only (no update/delete for any role; trigger
enforces; seed-codebase `prevent_admin_audit_event_change`). Admin has a per-event audit
tab; super admin has a global view.

### 12.13 L8 — Automated cross-event leakage tests (CI)

1. **Schema linter (pgTAP, runs on every migration):** for every table in
   `public` except a short allowlist (`organizations`, `events`, `memberships`,
   `role_permissions`, `member_invites`, `audit_log`, `org_sender_domains`,
   `message_suppressions`):
   - has `org_id` and `event_id` columns, both `not null`;
   - has an FK `(event_id, org_id) → events(id, org_id)`;
   - every other FK to an event-scoped table includes `event_id`;
   - RLS enabled and forced; no grants or policies for `anon`; every
     `authenticated` policy expression references `app.pinned_event()`;
   - has the immutable-tenancy and archived-read-only triggers.
     Also: every `security definer` function in `public` has `search_path = ''`,
     `p_event_id` as first argument (allowlist for platform functions), and no
     `execute` grant to `anon` except `public_event_content`.
     A new table or function that misses any of these fails CI.
2. **Fixture:** two orgs, three events (two in org A, one in org B, two of them
   with overlapping dates), the **same email registered in all three**, passes and
   jobs in each, auth users with each role, with and without MFA (`aal1`/`aal2`
   JWTs generated by the test harness).
3. **RLS matrix test:** for each role × pinned event × table, run select/update and
   assert row counts equal exactly the pinned event's rows (zero for the others).
   Includes: super admin pinned to A sees no B rows; no pin sees nothing; `aal1`
   sees nothing; revoked membership sees nothing; event reviewer of A pinned to B
   sees nothing.
4. **Definer function tests:** every definer RPC called with a mismatched pin,
   wrong event id, or missing permission → exception, no rows changed.
5. **FK tests:** attempt to insert child rows that reference another event's
   parent → must fail.
6. **API tests** (route handlers against local Supabase): call every admin route
   with event A's path while sending ids belonging to event B (registration id,
   job id, intent id) → 404, nothing changed. The route list is generated from the
   file system so new routes are covered automatically.
7. **Token tests:** event A pass scanned on event B device → rejected with
   "different event"; tampered event id → rejected; revoked → rejected; wrong
   purpose → rejected.
8. **Job tests:** simulate drift (registration status/email changed after enqueue,
   intent cancelled, event archived) → items skipped; stale lease cannot finish.
9. **Cache test:** render two events' pages, assert no shared cache entry keys.
10. **Proxy tests:** `idh.mash.example/<flipkart-event>` → 404;
    direct `/site/...`, `/api/public/...`, `/admin/...`, `/api/admin/...` on a
    public host → 404; `flipkart.mash.example/<flipkart-event>/api/register`
    reaches only that event's id;
    spoofed `x-mash-*` headers ignored; `/_preview` → 404 when `MASH_ENV=production`.
11. **Auth tests:** sign-up endpoint returns an error (sign-ups disabled);
    first-time Google sign-in for an uninvited account creates no user; password reset still requires MFA; `aal1` session
    cannot reach admin pages or APIs.

---

## 13. Security

| Area             | Design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth             | Supabase Auth, invite-only, Google or email + password, required TOTP MFA, HttpOnly host-only cookies on the admin host, `getClaims()` for every decision (§6)                                                                                                                                                                                                                                                                                                                                                                    |
| RLS              | §12.3. Forced on all tables; anon has no table grants; RPCs are the public write path                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Service role     | One module, privileged paths only, lint-enforced, never in client bundles (`server-only`)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Rate limiting    | Upstash sliding window per IP **and** per `(event, email)` for registration; per user for admin APIs; per IP and per email on `/auth/*` sign-in and reset requests (in addition to Supabase's own limits); fail closed for registration if Redis is down unless Turnstile passes (seed-codebase `api-security.js` adapted)                                                                                                                                                                                                        |
| CAPTCHA          | Cloudflare Turnstile on registration and any public form; verified server-side with the expected hostname and action. Supabase Auth CAPTCHA protection on admin sign-in and password reset as well                                                                                                                                                                                                                                                                                                                                |
| Input validation | zod on every API body/query; event-specific form schema from `sites/.../form.ts`; length limits; `answers` jsonb size cap (e.g. 16 KB); seed-codebase `input-sanitizers.js`, `upload-validation.js`, `csv-cell.cjs` (CSV-injection escaping) kept                                                                                                                                                                                                                                                                                 |
| CSRF / origin    | Same-origin check for state-changing requests (seed-codebase `isCrossSiteStateChange`); SameSite=Lax cookies; public API requires `Origin` host = the event's org host                                                                                                                                                                                                                                                                                                                                                            |
| Headers          | Nonce-based strict CSP on admin (built in `proxy.ts`, replacing the Clerk-provided CSP), site-wide CSP for public pages, HSTS, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin` (seed-codebase `next.config.mjs` headers adapted)                                                                                                                                                                                                                                                                     |
| Secrets          | Vercel env only; separate values for dev/preview/prod; `.env.example` with placeholders; repo is public so no data, dumps or real emails in fixtures (use `example.org`)                                                                                                                                                                                                                                                                                                                                                          |
| Environments     | **Preview deployments use a separate Supabase project (staging)**, never production keys                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PII              | Minimal fields; phone optional; consent + version recorded; WhatsApp only with explicit opt-in; retention: registrations, message items, check-ins and audit PII purged/anonymised **6 months** after event end by default (configurable per event; no client DPA needed); exports expire; no PII in logs or Sentry (scrubbing, `sendDefaultPii: false`)                                                                                                                                                                          |
| Backups          | **Free plan has no usable managed backups or PITR**, so: a nightly scheduled job in a **private** Mash ops repo (never this public one) runs `supabase db dump` (schema + data, plus `auth` schema), encrypts it with an `age` public key and uploads it to private object storage (e.g. Cloudflare R2), keeping 14 days; Storage bucket objects are synced the same way. A restore drill into the staging project runs monthly and before every large event. Upgrade to Pro (daily backups, optional PITR) when the plan changes |
| Free plan        | Project pauses after 7 idle days → the seed codebase's keep-alive cron kept; 500 MB DB and 1 GB storage limits watched by a weekly size check; session time-box/inactivity enforced in app (§6.4); leaked-password check unavailable (§6.2)                                                                                                                                                                                                                                                                                       |
| Audit            | §12.12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Observability    | Sentry with tags `org`, `event_id`, `route`; structured JSON logs with `request_id` and `event_id`; health endpoint; alerts on job failures, `event_mismatch`, webhook signature failures, auth failures spike, 5xx spikes                                                                                                                                                                                                                                                                                                        |
| Dependencies     | `npm audit` gate (high/critical) with dated exceptions (seed-codebase `scripts/audit-check.mjs`); Dependabot; lockfile committed                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## 14. Operations

- **Creating an event:** super admin creates the org/event rows in admin (gets
  UUID) → developer adds `sites/<org>/<event>/` with that UUID in `site.ts` and in
  the registry → PR → CI → deploy. The page loader's id/slug/org assertion (§4.2)
  catches mismatches on the first request.
- **Adding a team member:** super admin invites (§6.2); member enrols MFA on first
  sign-in.
- **Runbooks** (later, `docs/runbooks/`): auth settings, opening registration, bulk
  send, event-day check-in, incident (wrong email sent), lost MFA device, archive.
- **Migrations** via Supabase CLI, applied to staging first, then production,
  before deploying dependent code. Migrations are additive/backward-compatible
  (expand → deploy → contract) so the previous deployment keeps working.
- **Shared deployment risk.** One deployment serves every event, so a bad deploy
  for event B's site can hurt event A on its event day. Controls: CI must be green
  for all sites; each site route has its own error boundary, so a runtime error in
  one site module renders that site's error page only; a **change freeze** on
  `main` (no non-hotfix merges or migrations) from 24 h before until the end of any
  `live` event, shown in the admin calendar; Vercel instant rollback is the first
  response to an incident.

---

## 15. CI plan (GitHub Actions)

Standard CI (Node 24, `permissions: contents: read`,
`actions/checkout@v5`, `actions/setup-node@v5` with npm cache):

| Job                | Steps                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint & Format      | `npm ci`, `npm run lint` (`eslint . --max-warnings 0`, includes boundary/import and service-role rules), `npm run format:check` (prettier)        |
| Type Check         | `npx tsc --noEmit`                                                                                                                                |
| Tests              | `npm test` (`node --test`, the seed codebase's `tests/*.test.cjs` style, plus new `.test.ts` via `--experimental-strip-types` or tsx)             |
| Security Audit     | `npm run audit:ci`                                                                                                                                |
| DB Tests           | `supabase start` (Docker), apply migrations, run pgTAP schema linter + RLS matrix + definer tests, then API leakage tests against the local stack |
| Build              | `npm run build` with **no secrets** (builds with placeholders) — `needs: [lint, typecheck, test]`                                                 |
| Lighthouse (later) | On PRs that touch `sites/**`, run Lighthouse CI against the Vercel preview; fail under §10.4 budget                                               |

Branch protection on `main` requires all jobs. Workflows never upload data
artifacts (public repo).

---

## 16. Reuse from the seed codebase

The seed codebase (Next.js 16, Supabase, Resend, Upstash, Sentry) already has a working
registration → review → email jobs → QR pass → check-in pipeline with tests. Mash
starts from that code rather than from scratch.

### 16.1 Seeding rules

- **Copy files, not history.** Copy a snapshot of the working tree into this repo (no `.git`, no `.env*`, no `.vercel`,
  no `node_modules`, no `.next`) and make one seed commit.
- **Source and ownership:** Mash has its own GitHub and Supabase accounts. The
  seed code is open source (ISC). Nothing else is shared with the seed app: no
  Supabase project, keys, Vercel team or auth instance.
- **Scrub before the first commit:** grep for email addresses,
  phone numbers, real names, the old event's domains and addresses and Supabase/Clerk ids across copied files, especially `tests/`,
  `docs/`, `scripts/`, `load-tests/`, `CLAUDE.md`/`AGENTS.md`. Replace with
  `example.org` fixtures.
- **Strip the old event content:** `src/data/*`, all public pages under `src/app` other than
  the routes Mash keeps, `public/` assets, Sanity (`sanity.*`, `studio/`,
  `next-sanity`), chatbot (`api/chat`, `@google/genai`),
  heavy visual libraries.
- **Strip Clerk:** remove `@clerk/*`, `clerk-config.js`, `clerk-verified-emails.cjs`,
  `/sign-in`, `/sign-up`, `/__clerk` proxy paths, Clerk CSP entries, Clerk tests
  (`clerk-provider-topology`, `clerk-verified-emails`, `operator-auth-*`).
- **Then refactor to event scope** in the order of §16.5, moving surviving modules
  from `src/lib/*` into `core/*`.

### 16.2 Reuse map — `src/lib/*`

Legend: **Keep** = copy, light rename only. **Adapt** = keep logic, add
`eventId`/`orgId` parameters, replace `EVENT_CONFIG`/static data with DB rows, move
to `core/`. **Drop** = not carried over (later phase noted).

| Seed module(s)                                                                                                                                                                                                                                       | Verdict         | Mash destination / notes                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cross-site-request.cjs`                                                                                                                                                                                                                             | Keep            | `core/security/` — used by `eventRoute` and proxy                                                                                                                    |
| `csv-cell.cjs`, `input-sanitizers.js`, `upload-validation.js`                                                                                                                                                                                        | Keep            | `core/security/`                                                                                                                                                     |
| `admin-pagination.cjs`, `admin-exit-utils.cjs`, `admin-download.js`, `admin-job-labels.cjs`, `admin-job-view.cjs`, `qr-send-progress.cjs`, `utils.js`                                                                                                | Keep            | `core/admin/`, `core/ui/`                                                                                                                                            |
| `api-idempotency.js`                                                                                                                                                                                                                                 | Adapt           | Idempotency keys prefixed with `eventId`                                                                                                                             |
| `api-security.js` (Upstash rate limit + fallback)                                                                                                                                                                                                    | Adapt           | `core/security/rate-limit` — keys `evt:<eventId>:…`; per `(event,email)` limiter; fail-closed rule                                                                   |
| `job-processor-auth.js`                                                                                                                                                                                                                              | Adapt           | Keep cron-secret check; drop the Clerk admin-session fallback (manual "process now" goes through `eventRoute`)                                                       |
| `supabase-admin.js`                                                                                                                                                                                                                                  | Adapt           | `core/db/privileged/client.ts`; only importer of the service role key                                                                                                |
| `registration-auth.js`, `operator-session.cjs`, `operator-auth-ui.cjs`, `admin-email-store.js`, `clerk-config.js`, `clerk-verified-emails.cjs`                                                                                                       | Drop → rewrite  | `core/auth/*` on Supabase Auth: `getClaims`, AAL check, `requireEventPermission`, memberships. Env email allowlists (`CLERK_ADMIN_EMAILS`) replaced by `memberships` |
| `registration-constants.js` (`EVENT_CONFIG`, categories, statuses)                                                                                                                                                                                   | Adapt           | Statuses/transition table → `core/registration/constants.ts`; `EVENT_CONFIG` → `events` row + `events.settings`; categories → per-event `form.ts`                    |
| `registration-db.js`, `registration-ops-db.js`, `registration-utils.js`                                                                                                                                                                              | Adapt           | `core/db/registrations.ts` via `createEventClient(eventId)`; dedupe on `(event_id, lower(email))`                                                                    |
| `registration-review-update.cjs`, `registration-review-email.cjs`                                                                                                                                                                                    | Adapt           | `core/registration/review` → `transition_registration` / `apply_registration_reviews(p_event_id, …)`                                                                 |
| `registration-email.js`, `registration-email-job-service.js`, `registration-email-job-schedule.js`, `registration-job-utils.cjs`, `email-history.cjs`                                                                                                | Adapt           | `core/email/` unified job service; claim/finish with lease ids; per-event sender                                                                                     |
| `resend.js`, `email-branding.js`, `internal-notification-email.cjs`, `application-acknowledgement-email.cjs`                                                                                                                                         | Adapt           | `core/email/sender` + template registry; branding from org/event rows, no hard-coded the seed codebase sender                                                        |
| `registration-pass.js`, `registration-pass-utils.cjs`, `registration-pass-assets.js`, `pass-issue-job-service.js`, `qr-pass-email.cjs`, `qr-pass-email-assets.js`, `qr-pass-template.cjs`, `registration-badge-layout.cjs`, `badge-export-utils.cjs` | Adapt           | `core/passes/` with per-event HKDF keys and hashed tokens (§9.1); badge layout becomes a per-site override with a core default; no public QR image storage           |
| `pass-lookup-service.js`, `pass-lookup-window.cjs`                                                                                                                                                                                                   | Adapt           | Lookup only via signed self-service link; window logic kept                                                                                                          |
| `check-in-operations.js`, `check-in-day-utils.cjs`, `check-in-panel-utils.cjs`, `check-in-scan-search.cjs`, `check-in-scan-session.cjs`, `attendance-export-db.js`                                                                                   | Adapt           | `core/checkin/`; scanner sessions become `checkin_devices` bound to one event                                                                                        |
| `spot-registration-db.js`, `spot-registration-service.js`, `spot-registration-utils.cjs`                                                                                                                                                             | Adapt (phase 2) | Spot registration = `registrations.source='spot'`                                                                                                                    |
| `reminder-db.js`, `reminder-send.js`, `reminder-utils.cjs`, `reminder-email.cjs`, `reminder-attachments.js`                                                                                                                                          | Adapt (phase 2) | `core/email/reminders` on the unified job model                                                                                                                      |
| `admin-audit.js`                                                                                                                                                                                                                                     | Adapt           | `core/audit/` writing `audit_log` with org/event ids                                                                                                                 |
| `admin-roster-export.cjs`, `admin-roster-export-response.js`                                                                                                                                                                                         | Adapt           | Exports via bulk intent + private bucket (§12.11)                                                                                                                    |
| `admin-api-cache.js`, `admin-registration-cache.cjs`, `admin-shell-utils.cjs`, `admin-dashboard-utils.cjs`                                                                                                                                           | Adapt           | Cache keys start with `eventId`; dashboard per event                                                                                                                 |
| `form-settings.js`, `form-settings.cjs`                                                                                                                                                                                                              | Adapt           | Becomes `events.settings` (validated JSON) + audit                                                                                                                   |
| `programme-page-data.js`, `programme-agenda-utils.cjs`, `agenda-builder-utils.cjs`, `live-programme.cjs`, `speaker-directory-utils.cjs`                                                                                                              | Adapt           | `core/content/` reading `event_sessions`/`event_speakers`; pure helpers kept                                                                                         |
| `certificate-*.js/.cjs`, `certificates-*.js/.cjs`                                                                                                                                                                                                    | Drop (phase 3)  | Re-add later event-scoped; replace `certificate-session.cjs` key derivation (it derives from the service role key) with a dedicated HKDF secret                      |
| `submission-db.js`, `submission-utils.cjs`, `submission-export-utils.cjs`, `volunteer-application-dedupe.cjs`                                                                                                                                        | Drop (phase 3)  | Speaker/volunteer application forms; could return as generic per-event forms                                                                                         |
| `guest-invitation-*`, `guest-send-attempt.cjs`                                                                                                                                                                                                       | Drop (later)    | Seed VIP invitation flow                                                                                                                                             |
| `speaker-badge-*`, `speaker-photos-*`, `speaker-communications-*`, `speaker-photo-position-2026.js`, `speaker-map-geometry.mjs`, `share-card-utils.cjs`                                                                                              | Drop (later)    | Seed speaker operations; may return event-scoped                                                                                                                     |
| `azure-whatsapp.js`, `registration-whatsapp-notifications.js`                                                                                                                                                                                        | Adapt           | `core/messaging/whatsapp`: provider client kept; env-var templates → `event_whatsapp_templates`; inline send → queued items; opt-in check (§8.1)                     |
| `sanity-webhook.js`, `blog.js`, `newsletter-email.js`, `media-accreditation-email.js`                                                                                                                                                                | Drop            | No CMS; the seed codebase-only features                                                                                                                              |

### 16.3 Reuse map — `src/app/admin/*`, `src/components/admin/*`, `src/app/api/*`

**Admin pages** (move under `src/app/admin/o/[org]/e/[event]/`):

| Seed                                                                                                                                                | Verdict         | Notes                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `admin/layout.jsx`, `page.jsx`, `loading.jsx`, `admin-console.css`                                                                                  | Adapt           | Workspace layout: session + AAL + event permission; event colour band                     |
| `admin/registrations` + `registrations-admin-panel.jsx`                                                                                             | Adapt           | Core of phase 1                                                                           |
| `admin/email-jobs`, `admin/delivery` + `email-jobs-panel`, `delivery-jobs-panel`, `job-manager-panel`, `outgoing-email-history`, `qr-send-progress` | Adapt           | Unified jobs view per event                                                               |
| `admin/check-in` + `check-in-panel.jsx`                                                                                                             | Adapt (phase 2) | Scanner bound to `checkin_devices`                                                        |
| `admin/reminders` + `reminders-panel.jsx`                                                                                                           | Adapt (phase 2) |                                                                                           |
| `admin/spot-registrations` + panel                                                                                                                  | Adapt (phase 2) |                                                                                           |
| `admin/audit` + `audit-trail-panel.jsx`                                                                                                             | Adapt           | Per-event audit tab + platform view                                                       |
| `admin/settings` + `settings-panel.jsx`                                                                                                             | Rewrite         | Event settings, email settings; membership management moves to `admin/(platform)/members` |
| `admin-shell`, `admin-ui`, `admin-pagination`, `admin-page-intro`, `admin-exit-guard`, `admin-command-palette`                                      | Adapt           | Command palette scoped to the current event                                               |
| `admin-access-fallback.jsx`                                                                                                                         | Adapt           | "No access" / "MFA required" states                                                       |
| `admin/certificates`, `guest-invitations`, `speaker-communications`, `submissions` + panels                                                         | Drop (later)    |                                                                                           |

**API routes** (admin routes move to `/api/admin/events/[eventId]/…` and are wrapped
in `eventRoute`):

| Seed route(s)                                                                                                                                                           | Verdict           | Mash route                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `api/admin/registrations/*` (`route`, `[id]`, `status`, `status/batch`, `summary`, `resend`, `issue-pass`)                                                              | Adapt             | `…/events/[eventId]/registrations/*`; batch status goes through bulk intents |
| `api/admin/email-jobs/*`, `email-history/*`                                                                                                                             | Adapt             | `…/events/[eventId]/email/*`                                                 |
| `api/admin/email-jobs/process`, `passes/jobs/process`                                                                                                                   | Adapt             | Manual "process now" as event route; cron path → `api/internal/email/drain`  |
| `api/admin/passes/*`, `badges/export`                                                                                                                                   | Adapt (phase 2)   | `…/events/[eventId]/passes/*`                                                |
| `api/check-in/scan`, `validate`, `recent`, `api/admin/check-in/export`                                                                                                  | Adapt (phase 2)   | `…/events/[eventId]/check-in/*`                                              |
| `api/admin/reminders/*`, `spot-registrations/*`                                                                                                                         | Adapt (phase 2)   |                                                                              |
| `api/admin/audit`, `api/admin/settings`                                                                                                                                 | Adapt             | `…/events/[eventId]/audit`, `…/settings`                                     |
| `api/registrations/create`, `api/register/confirmation`                                                                                                                 | Adapt             | `api/public/events/[eventId]/register` (+ status)                            |
| `api/my-pass`, `api/internal/my-pass/drain`                                                                                                                             | Drop → replace    | Signed self-service link routes                                              |
| `api/internal/registration-ops/*`                                                                                                                                       | Adapt             | `api/internal/email/drain`, per-event loop                                   |
| `api/resend/webhooks`                                                                                                                                                   | Adapt             | `api/internal/resend/webhook`, event tag check                               |
| `api/resend/test`                                                                                                                                                       | Adapt             | Event-scoped test send                                                       |
| `api/health`                                                                                                                                                            | Keep              | Without Clerk diagnostics                                                    |
| `api/internal/keep-alive`                                                                                                                                               | Keep              | Free plan pauses after 7 idle days; daily cron reads one non-PII row         |
| `api/operator/auth-state`, `api/me/badge`                                                                                                                               | Drop              | Replaced by server-side session checks                                       |
| `api/revalidate` (Sanity)                                                                                                                                               | Drop              | Revalidation is called from admin actions                                    |
| `api/chat`, `messages`, `newsletter/*`, `media-accreditation`, `speaker-application`, `volunteer-application`, `certificates/*`, admin certificate/guest/speaker routes | Drop (some later) |                                                                              |

### 16.4 Reuse map — `supabase/schema.sql` + migrations

The seed codebase's migrations are **not** replayed (they encode the old app's history). Mash writes a fresh ordered migration set and lifts SQL bodies
from the seed codebase where they fit.

| Seed object                                                                                                                                                                                                  | Verdict         | Mash object                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------ |
| `event_registrations`                                                                                                                                                                                        | Adapt           | `registrations` (+ `org_id`, `event_id`, composite keys)                                               |
| `registration_status_history`, `review_notes`                                                                                                                                                                | Adapt           | Same names, event-scoped                                                                               |
| `spot_registrations`                                                                                                                                                                                         | Merge           | `registrations.source='spot'`                                                                          |
| `entry_passes`, `registration_assets`                                                                                                                                                                        | Adapt           | `passes` (hashed token), private-bucket assets                                                         |
| `registration_daily_check_ins`, `entry_scans`                                                                                                                                                                | Adapt           | `check_ins`, `scan_log`, + `checkin_devices`                                                           |
| `registration_email_jobs/_items`, `pass_issue_email_jobs/_items`, `registration_notifications`                                                                                                               | Merge           | `message_jobs` / `message_job_items` / `message_deliveries`                                            |
| `refresh_registration_email_job`, `claim_registration_email_job_items`, `claim_pass_issue_email_job_items`, `refresh_pass_issue_email_job`, `create_pass_issue_email_job`, `get_next_registration_email_job` | Adapt           | `claim_message_job_items(p_event_id…)` with lease id, `finish_message_job_item`, `refresh_message_job` |
| `apply_registration_reviews`, `registration_admin_json`, `get_registration_queue_summary`                                                                                                                    | Adapt           | Same logic, `p_event_id` first, pin + permission checks                                                |
| `reminder_campaigns`, `reminder_campaign_attachments`, `reminder_deliveries`, `claim/finish_reminder_send`                                                                                                   | Adapt (phase 2) | `reminders`, `reminder_attachments` on the unified job model                                           |
| `form_settings`, `form_setting_changes`                                                                                                                                                                      | Merge           | `events.settings` + `audit_log`                                                                        |
| `admin_audit_events`, `prevent_admin_audit_event_change`                                                                                                                                                     | Adapt           | `audit_log` + same append-only trigger                                                                 |
| `admin_email_overrides`                                                                                                                                                                                      | Drop            | `memberships`                                                                                          |
| `badge_exports`                                                                                                                                                                                              | Adapt (phase 2) | Export intents + private bucket                                                                        |
| `attendee_certificate*` (+ RPCs)                                                                                                                                                                             | Drop (phase 3)  |                                                                                                        |
| `guest_invitation*`, `speaker_badge*`, `speaker_photo*`, `newsletter_subscribers`, `contact_messages`, `registration_confirmation_requests`                                                                  | Drop            |                                                                                                        |

### 16.5 Migration and refactor order

**SQL migrations** (each with its pgTAP tests in the same PR):

1. `0001_foundation` — extensions (`pgcrypto`, `pgtap` in test only), schema `app`,
   revoke default privileges from `anon`/`authenticated`, generic triggers
   (`updated_at`, immutable tenancy, archived read-only, append-only).
2. `0002_platform` — `organizations`, `events`, `role_permissions` (+ seed),
   `memberships`, `member_invites`, `audit_log`.
3. `0003_access` — `app.pinned_event`, `app.has_event_permission`,
   `grant_membership`/`revoke_membership`, platform policies.
4. `0004_content` — speakers, sessions, session_speakers, sponsors, `public_event_content`.
5. `0005_registration` — registrations, history, notes; `submit_registration`,
   `transition_registration`, `apply_registration_reviews`, queue summary.
6. `0006_messaging` — email + WhatsApp settings, sender domains, templates, jobs, items,
   deliveries, suppressions; claim/finish/refresh RPCs.
7. `0007_bulk` — bulk intents + items, create/confirm RPCs.
8. `0008_passes_checkin` — passes, devices, check-ins, scan log, webinar attendance,
   `record_check_in` (phase 2 but migrated early so the schema linter covers it).
9. `0009_reminders` — reminders + attachments (phase 2).
10. `0010_storage` — buckets and `storage.objects` policies.
11. `9999_lint` (test-only) — schema linter assertions.

**Code refactor order** (after the seed commit):

1. Strip the old event content, Sanity, chatbot, Clerk; get lint/tsc/tests/build green on an
   empty shell (tests for dropped modules removed with them).
2. `core/` skeleton + boundary lint rules; move kept modules (§16.2 Keep).
3. `core/auth` on `@supabase/ssr` (sign-in, confirm, MFA, permissions) + `proxy.ts`
   host routing and admin-only session refresh.
4. `core/db` (`createEventClient`, privileged client) + `eventRoute`.
5. Registration + review (public route, admin pages, RPCs).
6. Email jobs (unified), acknowledgement/confirmation templates, webhooks, cron.
7. Workspace shell, audit tab, platform pages (orgs, events, members).
8. Phase 2 modules: passes/QR or webinar links, bulk intents, reminders, check-in,
   spot registration, exports.

---

## 17. Phasing

1. **Phase 0 (this doc):** design + review.
2. **Phase 1 — engine skeleton:** seed, scaffold, CI, migrations
   0001–0007 + 0010 with isolation tests, proxy routing, Supabase Auth admin
   (Google + password, MFA), admin workspace shell, registration + review,
   acknowledgement/confirmation emails.
3. **Phase 2 — webinar pilot (first pilot is a webinar):** webinar join links and
   attendance, WhatsApp channel (opt-in, confirmation + join reminder), reminders,
   bulk email with intents, exports, first custom site.
4. **Phase 2b — in-person:** QR passes, check-in scanner, spot registration.
5. **Phase 3:** client logins, custom domains, certificates, application forms,
   payments (if needed).

---

## 18. Open questions

Resolved by the owner on 2026-11-09: domain will be something like
`mashevents.com` with DNS on Cloudflare (§4.4); Mash has its own accounts and reuses
The seed codebase (§16.1); Supabase Free for now (§13); 6-month retention, no
DPA; webinar pilot first (§17); WhatsApp in scope (§8.1); admin login is Google or
email + password (§6.2).

Still open:

- **Q1** Exact domain name, and confirmation that the org hosts stay "DNS only"
  (grey cloud) on Cloudflare so Vercel can issue certificates (§4.4).
- **Q2** MFA: the design keeps a required TOTP step after Google or password
  sign-in (§6.3). Keep it, or drop it for phase 1?
- **Q3** WhatsApp sender: one shared Mash WhatsApp Business number on Azure (as
  proposed), and who owns the Meta Business verification?
- **Q4** Webinar platform for the pilot (Zoom, Teams, YouTube Live)? Decides
  whether per-registrant links are needed or one shared URL behind the redirect is
  enough (§9.3).

## Appendix A — Self-review (v2, v3)

A careful pass over v2 and v3 for isolation and security gaps. The external GPT
Astra review was dropped: an unfinished run stopped without a report, but its
progress notes raised the gaps marked "(Astra)" below, and each one held up on
checking. Every fix below is already applied in the body.

| #   | Gap found                                                                                                                                                                                          | Severity | Fix (section)                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Public API took `eventId` from the URL and relied on `Origin`/`Referer` to match host — a crafted request could post into another org's event                                                      | High     | Public event id comes only from proxy host+slug resolution; direct `/api/public/*` is 404; proxy marker header makes a missed matcher fail closed (§4.2, §12.4)                             |
| S2  | Security definer functions owned by `postgres` bypass RLS, and FORCE RLS does not stop `BYPASSRLS` roles                                                                                           | High     | Every definer RPC re-checks pin + permission and filters by `p_event_id`; pgTAP tests per function; FORCE RLS treated as defence in depth only (§5.7, §12.3)                                |
| S3  | Anon could call `submit_registration` straight through PostgREST and skip Turnstile/rate limits                                                                                                    | High     | Execute granted to `service_role` only; called from the public route after Turnstile + rate limit (§5.7, §12.4)                                                                             |
| S4  | Platform tables (`organizations`, `events`, `memberships`, `audit_log`) had no defined policies because they cannot use the event pin                                                              | Medium   | Explicit platform policies (§12.3)                                                                                                                                                          |
| S5  | One event's 10k bulk send could delay another event's confirmations or day-of passes (shared drainer and Resend account)                                                                           | Medium   | Priority + per-event round-robin in claims (§5.5, §12.5)                                                                                                                                    |
| S6  | Shared deployment: a bad deploy for one site hurts another event on its event day                                                                                                                  | Medium   | Per-site error boundaries, change freeze around live events, expand/contract migrations, instant rollback (§14)                                                                             |
| S7  | Link scanners can consume one-time invite links                                                                                                                                                    | Medium   | Invite confirm needs a POST click before `verifyOtp` (§6.2)                                                                                                                                 |
| S8  | First super admin would need a real email in a public repo                                                                                                                                         | Medium   | Out-of-repo bootstrap function, callable only while no platform admin exists (§6.2)                                                                                                         |
| S9  | `getClaims()` silently does a network call without asymmetric signing keys; HttpOnly cookies are impossible if auth runs in a browser client                                                       | Low      | Asymmetric keys required at setup; all auth flows as server actions (§6.4)                                                                                                                  |
| S10 | The "unique where revoked_at is null" over `coalesce(...)` was written as a table constraint, which Postgres does not allow                                                                        | Low      | Partial unique expression index (§5.1)                                                                                                                                                      |
| S11 | Public `event-assets` bucket exposes draft images if paths are guessed                                                                                                                             | Low      | Random object names; nothing sensitive in the public bucket (§12.3)                                                                                                                         |
| S12 | Admin on preview deployments had no host                                                                                                                                                           | Low      | `/admin` on the preview hostname against staging only (§4.3)                                                                                                                                |
| S13 | (Astra) `authenticated` had an UPDATE policy on `registrations`, so a reviewer holding their JWT could PATCH status through PostgREST and skip the transition rules, history, audit and emails     | High     | Workflow tables are select-only for `authenticated`; all workflow writes are definer RPCs; content tables get column-level grants only (§12.3, §5.7)                                        |
| S14 | (Astra) `record_check_in` was callable directly by staff without the device secret, so device binding was only enforced in app code                                                                | High     | RPC takes the device secret and checks hash, event, revocation and expiry itself (§5.7)                                                                                                     |
| S15 | (Astra) Resend idempotency keys cover a whole request, expire after 24 h and reject a reused key with a different payload; lease-derived and re-batched keys would either not de-duplicate or fail | High     | Transactional mail sent one per request with key `item:<id>` and a stored payload hash; bulk batches keep a fixed `batch_id` composition on retry; items past 24 h go to manual review (§8) |
| S16 | (Astra) Checking a proxy marker header inside `/site` pages would call `headers()` and make every public page dynamic, losing static generation                                                    | Medium   | Marker check only in `/api/public` handlers; pages rely on the proxy matcher, which is covered by tests (§4.2)                                                                              |
| S17 | Wildcard TLS on Vercel needs Vercel nameservers, but DNS stays on Cloudflare                                                                                                                       | Medium   | Per-host domains added to Vercel, Cloudflare CNAMEs set to DNS only (§4.4)                                                                                                                  |
| S18 | The Free plan has no usable backups, no session time-box and pauses idle projects                                                                                                                  | Medium   | Encrypted nightly dumps from a private ops repo, app-enforced 12 h / 2 h session limits, keep-alive cron kept (§6.4, §13)                                                                   |
| S19 | WhatsApp: shared sender number, Meta tier limits and unsigned Event Grid deliveries                                                                                                                | Medium   | Explicit opt-in, platform-wide opt-out list, per-number daily budget with deferral, secret header + validation handshake on the Event Grid endpoint (§8.1)                                  |
| S20 | Google sign-in could create admins, and Google's own 2-step sign-in doesn't count as MFA in Supabase                                                                                               | Medium   | Sign-ups off (blocks unknown Google accounts); invited users link by verified email; TOTP still required after Google (§6.2, §6.3)                                                          |
| S21 | Encrypted backups keep data that the 6-month retention purge has already removed                                                                                                                   | Low      | Backups expire after 14 days, so purged data is gone from them within 14 days (§13)                                                                                                         |

Accepted risks (not changed):

- The request-header event pin is a bug-catcher, not a security boundary; a user
  holding their own JWT can choose any pin, but RLS still limits them to events
  they have permission for (§12.3).
- Webinar join links can be forwarded by a confirmed registrant; abuse is visible
  through `join_count` and IP-hash counts (§9.3).
- An `org_admin` (and a future client org admin) sees every event of their own
  org; isolation between events of the same org is for operators' mistakes, not a
  wall against the org's own admins.
