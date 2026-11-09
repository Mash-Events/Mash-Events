import type { NextRequest } from 'next/server';
import { findTenancyKeys } from '@core/http/tenancy-keys';
import { normaliseHost } from '@core/routing/resolve';
import {
  registrationSchema,
  toSubmitPayload,
} from '@core/registration/schema';
import { allow, clientIp, sha256Hex } from '@core/security/rate-limit';
import { verifyTurnstile } from '@core/security/turnstile';
import { kickEmailDrain } from '@/lib/kick-email-drain';
import {
  getPublicEvent,
  submitRegistration,
} from '@core/db/privileged/registrations';

// POST <org host>/<event-slug>/api/register (docs/system-design.md §7, §12.4).
// Reached only through the proxy rewrite; the event id is the one the proxy
// resolved from host + slug. Turnstile and rate limits run before any write.

export const dynamic = 'force-dynamic';

const CONSENT_VERSION = '2026-11';
const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };
// Same answer for new and existing registrations: no "already registered"
// oracle (§7).
const ACCEPTED = {
  ok: true,
  message: 'Thank you. Please check your email for the next steps.',
};

function originHost(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return normaliseHost(new URL(origin).host);
  } catch {
    return null;
  }
}

function reply(status: number, body: object) {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  const headers = request.headers;

  // Only proxy-rewritten requests for this exact event (client copies of
  // x-mash-* headers are stripped by the proxy).
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

  const parsed = registrationSchema.safeParse(raw);
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
  const emailHash = await sha256Hex(input.email);
  const allowed = await allow([
    { key: `ip:${ip}:register`, max: 30, windowSeconds: 600 },
    { key: `evt:${eventId}:register:ip:${ip}`, max: 10, windowSeconds: 600 },
    {
      key: `evt:${eventId}:register:email:${emailHash}`,
      max: 3,
      windowSeconds: 3600,
    },
  ]);
  if (!allowed) return reply(429, { error: 'rate_limited' });

  const captcha = await verifyTurnstile({
    token: input.turnstile_token,
    ip: clientIp(headers),
    expectedHostname: host,
    expectedAction: 'register',
  });
  if (!captcha.ok) return reply(403, { error: 'captcha_failed' });

  try {
    const event = await getPublicEvent(eventId);
    if (!event || event.org_id !== headers.get('x-mash-org-id')) {
      return reply(404, { error: 'not_found' });
    }

    const result = await submitRegistration(
      eventId,
      toSubmitPayload(input),
      CONSENT_VERSION
    );
    switch (result.result) {
      case 'created':
        kickEmailDrain(eventId);
        return reply(202, ACCEPTED);
      case 'duplicate':
        return reply(202, ACCEPTED);
      case 'closed':
        return reply(409, {
          error: 'closed',
          message: 'Registration is not open for this event.',
        });
      case 'full':
        return reply(409, {
          error: 'full',
          message: 'This event is full.',
        });
      default:
        return reply(404, { error: 'not_found' });
    }
  } catch (error) {
    console.error('registration submit failed', {
      eventId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return reply(500, { error: 'server_error' });
  }
}
