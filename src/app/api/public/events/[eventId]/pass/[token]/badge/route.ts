import type { NextRequest } from 'next/server';
import { passSecret, verifyPassToken } from '@core/passes/pass-token';
import { allow, clientIp } from '@core/security/rate-limit';
import { escapeHtml } from '@core/messaging/templates';
import {
  getPassPageData,
  getPassPageEvent,
} from '@core/db/privileged/passes';
import { renderBadgePdf } from '@core/passes/badge';
import { formatDate, formatTime, timeZoneLabel } from '@core/ui/site/format';

// GET <org host>/<event>/pass/<token>/badge (docs/system-design.md §9.1):
// the badge PDF for a verified pass. Same checks as the pass page; the PDF
// is generated on the fly and never stored.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

function invalid() {
  return new Response('Not found', { status: 404, headers: HEADERS });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string; token: string }> }
) {
  const { eventId, token } = await context.params;
  if (
    request.headers.get('x-mash-rewrite') !== '1' ||
    request.headers.get('x-mash-event-id') !== eventId
  ) {
    return invalid();
  }

  const ip = clientIp(request.headers) ?? 'unknown';
  if (
    !(await allow([
      { key: `evt:${eventId}:pass:ip:${ip}`, max: 30, windowSeconds: 600 },
    ]))
  ) {
    return new Response('Too many attempts', { status: 429, headers: HEADERS });
  }

  const event = await getPassPageEvent(eventId);
  if (!event || event.status === 'archived' || event.status === 'draft') {
    return invalid();
  }

  const secret = passSecret();
  const passId = secret
    ? await verifyPassToken(secret, eventId, token, event.pass_key_version)
    : null;
  if (!passId) return invalid();

  const pass = await getPassPageData(eventId, passId);
  if (
    !pass ||
    pass.pass_status !== 'issued' ||
    pass.registration_status !== 'confirmed'
  ) {
    return invalid();
  }

  const when = event.starts_at
    ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(
        event.starts_at,
        event.timezone
      )} ${timeZoneLabel(event.timezone, event.starts_at)}`
    : '';
  const pdf = await renderBadgePdf({
    orgName: event.org_name || 'Events',
    eventName: event.name,
    when,
    attendeeName: `${pass.first_name} ${pass.last_name}`.trim() || pass.code,
    code: pass.code,
    passToken: token,
  });

  const fileName = `badge-${escapeHtml(pass.code)}.pdf`.replace(/[^\w.-]/g, '');
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      ...HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  });
}
