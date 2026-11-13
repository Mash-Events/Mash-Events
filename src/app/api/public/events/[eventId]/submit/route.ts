import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { findTenancyKeys } from '@core/http/tenancy-keys';
import { normaliseHost } from '@core/routing/resolve';
import { allow, clientIp } from '@core/security/rate-limit';
import { verifyTurnstile } from '@core/security/turnstile';
import { getPublicEvent } from '@core/db/privileged/registrations';
import { submitSubmission } from '@core/db/privileged/submissions';
import { sendEmail } from '@core/messaging/email-transport';
import { escapeHtml, headerSafe } from '@core/messaging/templates';

// POST <org host>/<event-slug>/api/submit (docs/system-design.md §16.4
// phase 3): the generic per-event form endpoint behind contact, speaker,
// volunteer and media-accreditation forms. Proxy marker, same-origin, body
// size, tenancy keys, schema, rate limits and Turnstile run before any
// write. When the event sets `submission_inbox_email` in its settings, the
// team gets an email notification with the submitter on reply-to. No
// oracle: the reply is the same whether the event exists or the form is
// unknown.

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

const body = z
  .object({
    kind: z.enum([
      'contact',
      'speaker_application',
      'volunteer_application',
      'media_accreditation',
    ]),
    name: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .max(320)
      .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
    message: z.string().trim().min(1).max(4000),
    payload: z.record(z.string(), z.unknown()).optional(),
    turnstile_token: z.string().max(2048).optional(),
  })
  .strict();

function reply(status: number, body: object) {
  return Response.json(body, { status, headers: NO_STORE });
}

function originHost(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return normaliseHost(new URL(origin).host);
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  const headers = request.headers;

  if (
    headers.get('x-mash-rewrite') !== '1' ||
    headers.get('x-mash-event-id') !== eventId
  ) {
    return reply(404, { error: 'not_found' });
  }

  const host = normaliseHost(headers.get('host'));
  if (originHost(headers.get('origin')) !== host) {
    return reply(403, { error: 'cross_site' });
  }
  if (!headers.get('content-type')?.includes('application/json')) {
    return reply(415, { error: 'json_required' });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return reply(413, { error: 'too_large' });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return reply(400, { error: 'invalid_json' });
  }
  if (findTenancyKeys(raw).length) return reply(400, { error: 'invalid_body' });

  const parsed = body.safeParse(raw);
  if (!parsed.success) {
    return reply(400, {
      error: 'invalid_body',
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  const input = parsed.data;

  const ip = clientIp(headers) ?? 'unknown';
  const allowed = await allow([
    { key: `ip:${ip}:submit`, max: 30, windowSeconds: 600 },
    { key: `evt:${eventId}:submit:ip:${ip}`, max: 10, windowSeconds: 600 },
  ]);
  if (!allowed) return reply(429, { error: 'rate_limited' });

  const captcha = await verifyTurnstile({
    token: input.turnstile_token,
    ip: clientIp(headers),
    expectedHostname: host,
    expectedAction: 'submit',
  });
  if (!captcha.ok) return reply(403, { error: 'captcha_failed' });

  try {
    const event = await getPublicEvent(eventId);
    if (!event || event.org_id !== headers.get('x-mash-org-id')) {
      return reply(404, { error: 'not_found' });
    }

    // Admin toggle (Settings): submissions_open false = form closed.
    // Fail-open — absent key keeps the form open (migration 20261114090000).
    const submissionsOpen = (event.settings as Record<string, unknown> | null)
      ?.submissions_open;
    if (submissionsOpen === false) {
      return reply(403, { error: 'form_closed' });
    }

    const result = await submitSubmission(eventId, {
      kind: input.kind,
      name: input.name,
      email: input.email,
      message: input.message,
      payload: input.payload ?? {},
    });
    if (result.result !== 'received') {
      return reply(404, { error: 'not_found' });
    }

    // Team notification (optional per event): settings.submission_inbox_email.
    // Fire-and-forget — the submission is already stored either way, and the
    // idempotency key makes a retry safe. Styled after the seed site's
    // internal notification: white card on a dark gradient, a gray fields
    // card, the message as its own section.
    const inbox = String(
      (event.settings as Record<string, unknown> | null)
        ?.submission_inbox_email ?? ''
    ).trim();
    if (inbox && result.id) {
      const defaultFrom =
        process.env.RESEND_DEFAULT_FROM?.trim() || 'events@mash.example';
      const fromName = event.name.replace(/["<>\r\n\\]/g, '') || 'Events';
      const topic = String(input.payload?.topic ?? 'General enquiry');
      const field = (label: string, value: string) =>
        `<tr><td style="padding:0 0 14px;text-align:left;vertical-align:top"><div style="margin:0 0 4px;color:#78716c;font-size:11px;line-height:17px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(label)}</div><div style="color:#1c1917;font-size:15px;line-height:23px;overflow-wrap:break-word;word-break:break-word">${escapeHtml(value)}</div></td></tr>`;
      const messageParagraphs = escapeHtml(input.message)
        .split(/\n+/)
        .filter(Boolean)
        .map(
          (line) =>
            `<p style="margin:0 0 14px;color:#3c4043;font-size:15px;line-height:25px;text-align:left;overflow-wrap:break-word;word-break:break-word">${line}</p>`
        )
        .join('');
      const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0c0a09;font-family:Inter,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg,#0c0a09 0%,#292524 52%,#500724 100%)"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="610" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:610px;background-color:#ffffff;border:1px solid #e7e5e4">
<tr><td align="left" style="padding:31px 40px 8px;text-align:left">
<p style="margin:0 0 8px;color:#78716c;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:0.08em">Team notification</p>
<h1 style="margin:0;color:#1c1917;font-size:22px;line-height:29px;font-weight:600;text-align:left">New ${escapeHtml(input.kind.replace(/_/g, ' '))} from ${escapeHtml(input.name)}</h1></td></tr>
<tr><td align="left" style="padding:8px 40px 12px;text-align:left">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f8fa;border:1px solid #e8eaed;border-radius:10px"><tr><td style="padding:20px 22px 4px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${field('Name', input.name)}
${field('Email', input.email)}
${field('Topic', topic)}
${field('Event', event.name)}
</table></td></tr></table></td></tr>
<tr><td align="left" style="padding:14px 40px 12px;text-align:left"><h2 style="margin:0 0 12px;color:#1c1917;font-size:17px;line-height:24px;font-weight:600;text-align:left">Message</h2>${messageParagraphs}</td></tr>
<tr><td align="left" style="padding:18px 40px;color:#78716c;font-size:12px;line-height:18px;text-align:left">Reply to this email to respond to ${escapeHtml(input.name)} directly.</td></tr>
<tr><td style="padding:0 40px 8px"><div style="border-top:1px solid #e7e5e4"></div></td></tr>
<tr><td align="left" style="padding:18px 40px 31px;color:#78716c;font-size:12px;line-height:18px;text-align:left">${escapeHtml(event.name)}</td></tr>
</table></td></tr></table></body></html>`;
      await sendEmail({
        from: `"${headerSafe(fromName)}" <${defaultFrom}>`,
        to: inbox,
        replyTo: input.email,
        subject: headerSafe(
          `[${event.name}] New ${input.kind.replace(/_/g, ' ')} from ${input.name}`
        ),
        text: `${input.name} <${input.email}> wrote:\n\n${input.message}\n\nReply to this email to respond directly.`,
        html,
        tags: [
          { name: 'event_id', value: eventId },
          { name: 'kind', value: 'submission' },
        ],
        idempotencyKey: `submission:${result.id}`,
      }).catch((e) => console.error('submission notify failed', { eventId }));
    }

    return reply(202, {
      ok: true,
      message: 'Thank you. The team will get back to you.',
    });
  } catch {
    return reply(400, { error: 'invalid_body' });
  }
}
