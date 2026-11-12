import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { findTenancyKeys } from '@core/http/tenancy-keys';
import { normaliseHost } from '@core/routing/resolve';
import { allow, clientIp } from '@core/security/rate-limit';
import { getPublicEvent } from '@core/db/privileged/registrations';
import { submitSubmission } from '@core/db/privileged/submissions';

// POST <org host>/<event-slug>/api/submit (docs/system-design.md §16.4
// phase 3): the generic per-event form endpoint behind contact, speaker,
// volunteer and media-accreditation forms. Proxy marker, same-origin, body
// size, tenancy keys, schema and rate limits run before any write. No
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

  try {
    const event = await getPublicEvent(eventId);
    if (!event || event.org_id !== headers.get('x-mash-org-id')) {
      return reply(404, { error: 'not_found' });
    }

    const result = await submitSubmission(eventId, {
      kind: input.kind,
      name: input.name,
      email: input.email,
      message: input.message,
      payload: input.payload ?? {},
    });
    return result.result === 'received'
      ? reply(202, {
          ok: true,
          message: 'Thank you. The team will get back to you.',
        })
      : reply(404, { error: 'not_found' });
  } catch {
    return reply(400, { error: 'invalid_body' });
  }
}
