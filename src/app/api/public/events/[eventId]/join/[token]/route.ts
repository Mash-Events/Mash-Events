import type { NextRequest } from 'next/server';
import { linkSecret, verifyJoinToken } from '@core/passes/join-token';
import { allow, clientIp, sha256Hex } from '@core/security/rate-limit';
import { escapeHtml } from '@core/messaging/templates';
import { recordWebinarJoin } from '@core/db/privileged/webinar';

// GET <org host>/<event>/join/<token> (docs/system-design.md §9.3).
// Reached only through the proxy rewrite, which chose the event from host +
// slug. The token must verify under THIS event's key; attendance is recorded,
// then the platform link is revealed by a 302 only inside the join window.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

function page(status: number, title: string, message: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;color:#1c1917}
main{max-width:32rem;margin:15vh auto;padding:0 1.5rem}h1{font-size:1.6rem}p{line-height:1.6;color:#44403c}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function formatOpens(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(new Date(iso));
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
  if (!(await allow([{ key: `evt:${eventId}:join:ip:${ip}`, max: 30, windowSeconds: 600 }]))) {
    return page(429, 'Too many attempts', 'Please wait a few minutes and try again.');
  }

  const secret = linkSecret();
  const registrationId = secret ? await verifyJoinToken(secret, eventId, token) : null;
  if (!registrationId) {
    return page(404, 'This link is not valid', 'Please use the joining link from your confirmation email.');
  }

  try {
    const result = await recordWebinarJoin(eventId, registrationId, await sha256Hex(ip));
    switch (result.result) {
      case 'ok':
        return new Response(null, {
          status: 302,
          headers: { ...HEADERS, Location: result.join_url },
        });
      case 'early':
        return page(
          200,
          `${result.event_name} has not started yet`,
          `The session opens ${formatOpens(result.opens_at, result.timezone)}. Please come back then using the same link.`
        );
      case 'ended':
        return page(200, `${result.event_name} has ended`, 'Thank you for your interest.');
      case 'no_link':
        return page(
          200,
          `${result.event_name}`,
          'The joining link is not ready yet. Please try again a little later.'
        );
      default:
        return page(404, 'This link is not valid', 'Only confirmed registrants can join this session.');
    }
  } catch (error) {
    console.error('webinar join failed', {
      eventId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return page(500, 'Something went wrong', 'Please try again in a moment.');
  }
}
