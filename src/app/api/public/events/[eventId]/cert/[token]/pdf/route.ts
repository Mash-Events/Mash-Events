import type { NextRequest } from 'next/server';
import { certSecret, verifyCertToken } from '@core/certificates/cert-token';
import { allow, clientIp } from '@core/security/rate-limit';
import { escapeHtml } from '@core/messaging/templates';
import {
  getCertClaimData,
  getCertEvent,
} from '@core/db/privileged/certificates';
import { renderCertificatePdf } from '@core/certificates/certificate-pdf';
import { formatDate, timeZoneLabel } from '@core/ui/site/format';

// GET <org host>/<event>/cert/<token>/pdf — the certificate PDF for a
// verified claim token. Same checks as the claim page.

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
      { key: `evt:${eventId}:cert:ip:${ip}`, max: 30, windowSeconds: 600 },
    ]))
  ) {
    return new Response('Too many attempts', { status: 429, headers: HEADERS });
  }

  const event = await getCertEvent(eventId);
  if (!event || event.status === 'archived' || event.status === 'draft') {
    return invalid();
  }

  const secret = certSecret();
  const certId = secret
    ? await verifyCertToken(secret, eventId, token, event.pass_key_version)
    : null;
  if (!certId) return invalid();

  const cert = await getCertClaimData(eventId, certId);
  if (
    !cert ||
    cert.cert_status !== 'issued' ||
    cert.registration_status !== 'confirmed'
  ) {
    return invalid();
  }

  const when = event.starts_at
    ? `${formatDate(event.starts_at, event.timezone)}${
        event.ends_at && formatDate(event.ends_at, event.timezone) !==
          formatDate(event.starts_at, event.timezone)
          ? ` – ${formatDate(event.ends_at, event.timezone)}`
          : ''
      } (${timeZoneLabel(event.timezone, event.starts_at)})`
    : '';
  const pdf = await renderCertificatePdf({
    orgName: event.org_name || 'Events',
    eventName: event.name,
    when,
    attendeeName: `${cert.first_name} ${cert.last_name}`.trim() || cert.code,
    code: cert.code,
  });

  const fileName = `certificate-${cert.code}.pdf`.replace(/[^\w.-]/g, '');
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      ...HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
    },
  });
}
