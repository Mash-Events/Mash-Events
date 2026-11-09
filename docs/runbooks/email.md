# Email (Resend)

How registration emails work and how to switch them on in production.
Design: `docs/system-design.md` §8, §12.5.

## What is sent

| When                                                        | Template          |
| ----------------------------------------------------------- | ----------------- |
| Someone registers (manual review)                           | `acknowledgement` |
| Registered on an auto-confirm event, or a reviewer confirms | `confirmed`       |
| Waitlisted (by capacity or by a reviewer)                   | `waitlisted`      |
| A reviewer rejects                                          | `rejected`        |

Emails are queued in the database in the same transaction as the change,
then sent right after the request finishes. A daily cron
(`/api/internal/messages/drain`) picks up retries. Each email is sent once per
change; Resend de-duplicates retries with the key `item:<id>`.

Before sending, every item is checked again: the registration must still have
the matching status and email address, the template must be enabled for the
event, and the address must not be suppressed (hard bounce or complaint for
that organisation).

## Switching it on

1. In Resend, add and verify the sending domain (needs the Mash domain).
2. Set these Vercel environment variables (production):
   - `RESEND_API_KEY`
   - `RESEND_DEFAULT_FROM`, e.g. `events@<domain>` (display name is the event
     name, or the event's own sender name if set)
   - `RESEND_WEBHOOK_SECRET` (from step 3)
   - `CRON_SECRET` (Vercel sends it to the cron route automatically)
3. In Resend → Webhooks, add `https://admin.<domain>/api/internal/resend/webhook`
   for `email.sent`, `email.delivered`, `email.delivery_delayed`,
   `email.bounced`, `email.complained`.
4. Use the same domain as custom SMTP for Supabase Auth, then set the invite
   and recovery templates (see `auth-settings.md`).

Without `RESEND_API_KEY` in production, nothing is sent: items stay queued
and go out once the key is added. Outside production, a log transport prints
a masked line instead of sending.

## Retries and the cron

Vercel's Hobby plan only allows daily cron jobs, so failed sends are retried
once a day. Faster options: Vercel Pro (set the schedule to `* * * * *`), or a
Supabase `pg_cron` job that calls the drain URL every few minutes with the
cron secret.
