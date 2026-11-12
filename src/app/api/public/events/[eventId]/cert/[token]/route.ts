import type { NextRequest } from 'next/server';
import { certSecret, verifyCertToken } from '@core/certificates/cert-token';
import { allow, clientIp } from '@core/security/rate-limit';
import { escapeHtml } from '@core/messaging/templates';
import {
  getCertClaimData,
  getCertEvent,
} from '@core/db/privileged/certificates';
import { formatDate, timeZoneLabel } from '@core/ui/site/format';

// GET <org host>/<event>/cert/<token> (docs/system-design.md §9.1 phase 3).
// Reached only through the proxy rewrite. The token must verify for THIS
// event; the certificate row's status decides what is rendered. The PDF is
// generated on the fly and never stored.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

function page(
  status: number,
  title: string,
  message: string,
  extra = ''
) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;color:#1c1917}
main{max-width:30rem;margin:8vh auto;padding:0 1.5rem}h1{font-size:1.5rem}p{line-height:1.6;color:#44403c}
.cert{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:1.75rem;text-align:center;box-shadow:0 12px 30px -18px rgba(0,0,0,.35)}
.code{font-family:ui-monospace,monospace;letter-spacing:.14em;font-size:1.05rem;font-weight:600}
.small{font-size:.78rem;color:#78716c}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${message}</p>${extra}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
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
    return new Response('Not found', { status: 404, headers: HEADERS });
  }

  const ip = clientIp(request.headers) ?? 'unknown';
  if (
    !(await allow([
      { key: `evt:${eventId}:cert:ip:${ip}`, max: 30, windowSeconds: 600 },
    ]))
  ) {
    return page(
      429,
      'Too many attempts',
      'Please wait a few minutes and try again.'
    );
  }

  const event = await getCertEvent(eventId);
  if (!event || event.status === 'archived' || event.status === 'draft') {
    return page(
      404,
      'This link is not valid',
      'Please use the certificate link from your email.'
    );
  }

  const secret = certSecret();
  const certId = secret
    ? await verifyCertToken(secret, eventId, token, event.pass_key_version)
    : null;
  if (!certId) {
    return page(
      404,
      'This link is not valid',
      'Please use the certificate link from your email.'
    );
  }

  const cert = await getCertClaimData(eventId, certId);
  if (!cert) {
    return page(
      404,
      'This certificate is not valid',
      'Please use the certificate link from your email.'
    );
  }
  if (cert.cert_status !== 'issued') {
    return page(
      410,
      'This certificate was revoked',
      'Please contact the event team if you think this is a mistake.'
    );
  }
  if (cert.registration_status !== 'confirmed') {
    return page(
      410,
      'This certificate is no longer valid',
      'The registration changed, so this certificate no longer works. Contact the event team.'
    );
  }

  const name = `${cert.first_name} ${cert.last_name}`.trim();
  const when = event.starts_at
    ? `${formatDate(event.starts_at, event.timezone)}${
        event.ends_at && formatDate(event.ends_at, event.timezone) !==
          formatDate(event.starts_at, event.timezone)
          ? ` – ${formatDate(event.ends_at, event.timezone)}`
          : ''
      } (${timeZoneLabel(event.timezone, event.starts_at)})`
    : '';

  const extra = `<div class="cert">
<p class="small">${escapeHtml(event.org_name)} · ${escapeHtml(event.name)}</p>
<p style="font-weight:600;font-size:1.25rem;margin:.75rem 0">${escapeHtml(name)}</p>
<p class="small">Certificate of participation</p>
${when ? `<p class="small">${escapeHtml(when)}</p>` : ''}
<p class="code" style="margin-top:1rem">${escapeHtml(cert.code)}</p>
</div>
<p><a href="${escapeHtml(token)}/pdf" style="color:#1c1917">Download certificate (PDF)</a></p>
<p class="small">Anyone can verify this certificate on the event website with the code above.</p>`;
  return page(
    200,
    'Your certificate',
    'This certificate was issued to you. Keep the code for verification.',
    extra
  );
}
