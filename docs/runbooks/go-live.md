# Go-live checklist

In order. **You** = needs the owner's accounts or payment; **Claude** = can be
run from this repo once the accounts exist. `<domain>` is the Mash domain.

## 0. Decisions

- [ ] **You** — Domain. `mashevents.com` is already registered by someone
      else; choose another. DNS stays on Cloudflare (`docs/system-design.md` §4.4).
- [ ] **You** — Vercel plan. The Hobby plan is for non-commercial use only;
      client events are commercial, so production needs **Vercel Pro**. Pro also
      allows a 5-minute cron, which reminders need.

## 1. Accounts and keys

- [ ] **You** — Buy the domain; add it to Cloudflare (DNS only).
- [ ] **You** — Vercel: create a team/project for Mash, import
      `Mash-Events/Mash-Events`, region `bom1`, Node 24.
- [ ] **You** — Resend: account, add `<domain>`, add its SPF/DKIM/DMARC records
      in Cloudflare, create an API key.
- [ ] **You** — Cloudflare Turnstile: one widget with hostnames `admin.<domain>`
      and each org host; copy the site key and secret.
- [ ] **You** — Upstash: Redis database in `ap-south-1`; copy REST URL and token.
- [ ] **You** — Google Cloud (optional, for Google sign-in): OAuth client of type
      "Web application" with redirect URI
      `https://<project-ref>.supabase.co/auth/v1/callback`.
- [ ] **Claude** — Generate `LINK_MASTER_SECRET`, `SESSION_ACTIVITY_SECRET`,
      `CRON_SECRET` (each different, 32+ random bytes) into a git-ignored file.

## 2. Supabase

- [ ] **Claude** — Production project: migrations are already applied
      (`npm run sb -- migration list --remote` to confirm).
- [ ] **You** — Staging project for previews: create a second free project
      (Mumbai). **Claude** — link and push migrations to it.
- [ ] **Claude** — Auth settings for production, after Resend and Turnstile:
      `ADMIN_URL=https://admin.<domain> node --env-file=<file> scripts/apply-auth-settings.mjs`
      (dry run), then `--apply`. Sets SMTP via Resend, the invite/reset
      templates, CAPTCHA and (if keys exist) Google sign-in.

## 3. Vercel

- [ ] **You/Claude** — Production env vars; check them first with
      `node --env-file=<file> scripts/check-env.mjs` (must report no problems).
      Preview env vars point at the staging Supabase project, with
      `MASH_ENV=preview`.
- [ ] **You** — Domains on the project: `admin.<domain>`, `<domain>`, and one
      `<org>.<domain>` per client org. In Cloudflare, add matching `CNAME`
      records to Vercel's target, **DNS only (grey cloud)**.
- [ ] **Claude** — On Pro: change the drain cron in `vercel.json` to `*/5 * * * *`.
- [ ] **You** — Resend webhook to
      `https://admin.<domain>/api/internal/resend/webhook`
      (events: sent, delivered, delivery_delayed, bounced, complained); put its
      secret in `RESEND_WEBHOOK_SECRET`.

## 4. First admin

- [ ] **You** — Supabase dashboard → Authentication → Users → Add user (your
      email, auto-confirm, strong password).
- [ ] **You** — SQL editor: `select app.bootstrap_super_admin('<that user id>');`
- [ ] **You** — Sign in at `https://admin.<domain>`, set up the authenticator
      app, then invite the team from Platform → Members.

## 5. Backups

- [ ] **You** — Create a **private** repo (e.g. `Mash-Events/ops`) and add the
      nightly backup workflow from `docs/runbooks/backups.md`.

## 6. Pilot event

- [ ] **You/Claude** — Platform: create the org and the event (draft); note
      their UUIDs.
- [ ] **Claude** — Add `sites/<org>/<event>/site.tsx` (copy the demo), the
      registry entry with the UUIDs and `<org>.<domain>`, and the site module;
      PR → CI → deploy.
- [ ] **You** — Event settings: dates, registration window, review mode,
      webinar link; add speakers/agenda (database for now).
- [ ] **You** — Open registration.

## 7. Smoke test (before announcing)

- [ ] Public page loads on `<org>.<domain>/<event>`; unknown paths are 404.
- [ ] Register with a test address → acknowledgement email arrives.
- [ ] Confirm it in admin → confirmation with join link arrives; the link shows
      the "not started" page before the window.
- [ ] Messages → preview → test to me → send to a test group.
- [ ] Sign out; `admin.<domain>/admin` asks to sign in again.
- [ ] Supabase security advisor shows only the expected warnings
      (`auth-settings.md`).
