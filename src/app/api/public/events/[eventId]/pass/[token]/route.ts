import type { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { passSecret, verifyPassToken } from '@core/passes/pass-token';
import { allow, clientIp, sha256Hex } from '@core/security/rate-limit';
import { escapeHtml } from '@core/messaging/templates';
import {
  getPassPageData,
  getPassPageEvent,
} from '@core/db/privileged/passes';
import { formatDate, formatTime, timeZoneLabel } from '@core/ui/site/format';

// GET <org host>/<event>/pass/<token> (docs/system-design.md §9.1).
// Reached only through the proxy rewrite. The token must verify for THIS
// event; the pass row and registration status decide what is rendered. The
// QR image is generated on the fly and never stored.

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
main{max-width:28rem;margin:8vh auto;padding:0 1.5rem}h1{font-size:1.5rem}p{line-height:1.6;color:#44403c}
.pass{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:1.5rem;text-align:center;box-shadow:0 12px 30px -18px rgba(0,0,0,.35)}
.pass img{width:220px;height:220px;margin:1rem auto;display:block}
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
      { key: `evt:${eventId}:pass:ip:${ip}`, max: 30, windowSeconds: 600 },
    ]))
  ) {
    return page(
      429,
      'Too many attempts',
      'Please wait a few minutes and try again.'
    );
  }

  const event = await getPassPageEvent(eventId);
  if (!event || event.status === 'archived' || event.status === 'draft') {
    return page(404, 'This link is not valid', 'Please use the pass link from your confirmation email.');
  }

  const secret = passSecret();
  const passId = secret
    ? await verifyPassToken(secret, eventId, token, event.pass_key_version)
    : null;
  if (!passId) {
    return page(404, 'This link is not valid', 'Please use the pass link from your confirmation email.');
  }

  const pass = await getPassPageData(eventId, passId);
  if (!pass) {
    return page(404, 'This pass is not valid', 'Please use the pass link from your confirmation email.');
  }
  if (pass.pass_status !== 'issued') {
    return page(
      410,
      'This pass was revoked',
      'Please contact the event team if you think this is a mistake.'
    );
  }
  if (pass.registration_status !== 'confirmed') {
    return page(
      410,
      'This registration is no longer confirmed',
      'Your registration status changed, so this pass no longer works. Contact the event team.'
    );
  }

  const name = `${pass.first_name} ${pass.last_name}`.trim();
  const when = event.starts_at
    ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(
        event.starts_at,
        event.timezone
      )} ${timeZoneLabel(event.timezone, event.starts_at)}`
    : '';
  const qr = await QRCode.toDataURL(token, {
    margin: 1,
    width: 440,
    errorCorrectionLevel: 'M',
  });

  const extra = `<div class="pass">
<p class="small">${escapeHtml(event.org_name)} · ${escapeHtml(event.name)}</p>
${when ? `<p class="small">${escapeHtml(when)}</p>` : ''}
<p style="font-weight:600;font-size:1.1rem;margin:.5rem 0">${escapeHtml(name)}</p>
<p class="code">${escapeHtml(pass.code)}</p>
<img src="${qr}" alt="Entry QR code — show this at the gate">
<p class="small">Show this QR code at the gate. Screenshot this page in case the venue has poor signal.</p>
</div>
<p class="small">This pass is personal: it stops working if your registration is cancelled.</p>`;
  return page(200, 'Your entry pass', 'You are confirmed. Keep this page handy.', extra);
}
