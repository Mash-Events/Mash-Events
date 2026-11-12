import type { NextRequest } from 'next/server';
import { allow, clientIp } from '@core/security/rate-limit';
import { escapeHtml } from '@core/messaging/templates';
import { getCertByCode, getCertEvent } from '@core/db/privileged/certificates';
import { formatDate } from '@core/ui/site/format';

// GET <org host>/<event>/verify/<code> (docs/system-design.md §9.1 phase 3):
// the public certificate verification page. Shows the holder's name, the
// event and the validity — no contact data. Rate-limited; no search engine
// indexing.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
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
.small{font-size:.78rem;color:#78716c}
.valid{color:#15803d;font-weight:600}.revoked{color:#b91c1c;font-weight:600}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${message}</p>${extra}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string; code: string }> }
) {
  const { eventId, code } = await context.params;
  if (
    request.headers.get('x-mash-rewrite') !== '1' ||
    request.headers.get('x-mash-event-id') !== eventId
  ) {
    return new Response('Not found', { status: 404, headers: HEADERS });
  }

  const ip = clientIp(request.headers) ?? 'unknown';
  if (
    !(await allow([
      { key: `evt:${eventId}:verify:ip:${ip}`, max: 30, windowSeconds: 600 },
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
    return page(404, 'Nothing to verify', 'This event does not publish certificates.');
  }

  const cert = await getCertByCode(eventId, code);
  if (!cert) {
    return page(
      404,
      'No certificate with this code',
      'Check the code and try again.'
    );
  }

  const name = `${cert.first_name} ${cert.last_name}`.trim();
  const when = event.starts_at
    ? formatDate(event.starts_at, event.timezone)
    : '';
  if (cert.status === 'revoked') {
    const extra = `<div class="cert">
<p class="small">${escapeHtml(event.name)}</p>
<p style="font-weight:600;font-size:1.2rem;margin:.75rem 0">${escapeHtml(name)}</p>
<p class="revoked">This certificate was revoked.</p>
<p class="code" style="margin-top:1rem">${escapeHtml(code)}</p>
</div>`;
    return page(
      200,
      'Certificate verification',
      'The certificate exists but is not valid.',
      extra
    );
  }

  const extra = `<div class="cert">
<p class="small">${escapeHtml(event.org_name)} · ${escapeHtml(event.name)}${when ? ` · ${escapeHtml(when)}` : ''}</p>
<p style="font-weight:600;font-size:1.2rem;margin:.75rem 0">${escapeHtml(name)}</p>
<p class="valid">Valid certificate of participation</p>
<p class="code" style="margin-top:1rem">${escapeHtml(code)}</p>
</div>
<p class="small">Issued ${formatDate(cert.issued_at, event.timezone)}.</p>`;
  return page(
    200,
    'Certificate verification',
    'This code belongs to a valid certificate.',
    extra
  );
}
