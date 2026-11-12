import type { NextRequest } from 'next/server';
import { allow, clientIp } from '@core/security/rate-limit';
import { getCertEvent } from '@core/db/privileged/certificates';
import { getPublicEventContent } from '@core/content/public';

// GET <org host>/<event>/calendar[?session=<id>] (docs/system-design.md §10.2):
// an iCalendar file for the whole event or one session. Times carry the
// event's timezone; the file is generated on the fly and never stored.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

function invalid() {
  return new Response('Not found', { status: 404, headers: HEADERS });
}

function icsDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
    .slice(0, 300);
}

function fold(line: string): string {
  // RFC 5545: fold lines longer than 75 octets.
  const chars = [...line];
  if (chars.length <= 74) return line;
  const parts = [chars.slice(0, 74).join('')];
  for (let i = 74; i < chars.length; i += 73) {
    parts.push(' ' + chars.slice(i, i + 73).join(''));
  }
  return parts.join('\r\n');
}

function buildIcs(input: {
  uid: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string;
  url: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mash Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.uid}@mash`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART;TZID=${input.timezone}:${input.startsAt}`,
    `DTEND;TZID=${input.timezone}:${input.endsAt}`,
    fold(`SUMMARY:${escapeIcs(input.title)}`),
    fold(`DESCRIPTION:${escapeIcs(input.description)}`),
    fold(`LOCATION:${escapeIcs(input.location)}`),
    fold(`URL:${input.url}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

function localStamp(iso: string, timeZone: string): string {
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  // DD/MM/YYYY,HH:MM:SS → YYYYMMDDTHHMMSS (local time with TZID)
  const [date, time] = local.split(',');
  const [day, month, year] = date.split('/');
  return `${year}${month}${day}T${time.replace(/[:\s]/g, '')}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  if (
    request.headers.get('x-mash-rewrite') !== '1' ||
    request.headers.get('x-mash-event-id') !== eventId
  ) {
    return invalid();
  }

  const ip = clientIp(request.headers) ?? 'unknown';
  if (
    !(await allow([
      { key: `evt:${eventId}:cal:ip:${ip}`, max: 30, windowSeconds: 600 },
    ]))
  ) {
    return new Response('Too many attempts', { status: 429, headers: HEADERS });
  }

  const event = await getCertEvent(eventId);
  if (!event || !event.starts_at || !event.ends_at) return invalid();

  const sessionId = new URL(request.url).searchParams.get('session');
  const content = await getPublicEventContent(eventId);
  if (!content) return invalid();

  let title = event.name;
  let startsAt = event.starts_at;
  let endsAt = event.ends_at;
  let description = `${event.org_name} · ${event.name}`;
  let location = 'See the event page';

  // The event's own public URL, reconstructed from the request host.
  const host = request.headers.get('host') ?? 'localhost';
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1')
      ? 'http'
      : 'https');
  const eventUrl = `${proto}://${host}/${content.event.slug}`;

  if (sessionId) {
    const session = content.sessions.find((s) => s.id === sessionId);
    if (!session || !session.starts_at || !session.ends_at) return invalid();
    title = `${session.title} — ${event.name}`;
    startsAt = session.starts_at;
    endsAt = session.ends_at;
    description = session.description
      ? `${session.description.slice(0, 200)}`
      : `${event.org_name} · ${event.name}`;
    location = session.room ?? session.track ?? location;
  }

  const ics = buildIcs({
    uid: sessionId ?? eventId,
    title,
    description,
    startsAt: localStamp(startsAt, event.timezone),
    endsAt: localStamp(endsAt, event.timezone),
    timezone: event.timezone,
    location,
    url: eventUrl,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      ...HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${(sessionId ? 'session' : 'event')}-${event.id.slice(0, 8)}.ics"`,
    },
  });
}
