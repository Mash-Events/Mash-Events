import type { NextRequest } from 'next/server';
import { allow, clientIp } from '@core/security/rate-limit';
import { verifyTurnstile } from '@core/security/turnstile';
import { getPublicEventContent } from '@core/content/public';
import { getPrivilegedClient } from '@core/db/privileged/client';
import { escapeHtml } from '@core/messaging/templates';

// GET/POST <org host>/<event>/feedback (docs/system-design.md §16.4): the
// per-event feedback form — overall event, admin-configured questions. A
// plain HTML form so it works without JavaScript: GET renders it, POST
// (urlencoded) validates and redirects to the thank-you view (PRG). Rating
// 1-5 stars plus optional registration code to link the response.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;color:#1c1917}
main{max-width:34rem;margin:8vh auto;padding:0 1.5rem}
.card{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:2rem;box-shadow:0 12px 30px -18px rgba(0,0,0,.35)}
h1{font-size:1.6rem;margin:0 0 .5rem}p{line-height:1.6;color:#44403c}
.stars{display:flex;gap:.25rem;font-size:1.6rem;flex-direction:row-reverse;justify-content:flex-end}
.stars input{position:absolute;opacity:0;width:0}
.stars label{color:#d6d3d1;cursor:pointer;padding:0 .1rem}
.stars label::before{content:"★"}
.stars input:checked~label::before,.stars label:hover::before,.stars label:hover~label::before{color:#cb1977}
.field{margin-top:1.25rem}label{display:block;font-size:.9rem;font-weight:600;color:#1c1917}
input[type=text],textarea,select{margin-top:.35rem;width:100%;border:1px solid #d6d3d1;border-radius:8px;padding:.6rem .75rem;font:inherit;background:#fff}
textarea{min-height:6rem}
button{margin-top:1.5rem;width:100%;background:#0c0a09;color:#fff;border:0;border-radius:8px;padding:.8rem;font:inherit;font-weight:700;cursor:pointer}
button:hover{background:#cb1977}
.small{font-size:.78rem;color:#78716c}</style></head>
<body><main><div class="card">${body}</div></main></body></html>`;
  return new Response(html, {
    status,
    headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
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
    return new Response('Not found', { status: 404, headers: HEADERS });
  }

  const content = await getPublicEventContent(eventId);
  const form = content?.feedback;
  const eventName = content?.event.name ?? 'the event';
  const slug = content?.event.slug ?? '';

  if (request.nextUrl.searchParams.get('done')) {
    return page(
      'Thank you',
      `<h1>Thank you</h1><p>${escapeHtml(form?.thanks ?? 'Thank you for your feedback.')}</p>`
    );
  }
  if (!form?.enabled) {
    return page(
      'Feedback',
      `<h1>Feedback</h1><p>Feedback is not open for this event right now.</p>`
    );
  }

  const questions = form.questions
    .map((question, index) => {
      const name = `q_${escapeHtml(question.key)}`;
      const id = `f${index}`;
      const label = `${escapeHtml(question.label)}${question.required ? ' *' : ''}`;
      const required = question.required ? ' required' : '';
      let control: string;
      if (question.type === 'textarea') {
        control = `<textarea id="${id}" name="${name}" maxlength="4000"${required}></textarea>`;
      } else if (question.type === 'select') {
        const options = (question.options ?? [])
          .map((option) => `<option>${escapeHtml(option)}</option>`)
          .join('');
        control = `<select id="${id}" name="${name}"${required}>${options}</select>`;
      } else {
        control = `<input type="text" id="${id}" name="${name}" maxlength="200"${required}>`;
      }
      return `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
    })
    .join('');

  const body = `<h1>${escapeHtml(form.headline)}</h1>
<p>How was ${escapeHtml(eventName)}? Your feedback goes straight to the team.</p>
<form method="post" action="/${escapeHtml(slug)}/feedback">
<div class="field"><label>Overall rating</label>
<div class="stars">
${[5, 4, 3, 2, 1]
  .map(
    (value) =>
      `<input type="radio" id="r${value}" name="rating" value="${value}"><label for="r${value}" aria-label="${value} star${value > 1 ? 's' : ''}"></label>`
  )
  .join('')}
</div></div>
${questions}
<div class="field"><label for="code">Registration code (optional)</label>
<input type="text" id="code" name="code" maxlength="8" placeholder="AB12CD34">
<p class="small">On your badge — links your feedback to your registration. Leave empty to stay anonymous.</p></div>
<button type="submit">Send feedback</button>
</form>`;

  return page(form.headline, body);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  if (
    request.headers.get('x-mash-rewrite') !== '1' ||
    request.headers.get('x-mash-event-id') !== eventId
  ) {
    return new Response('Not found', { status: 404, headers: HEADERS });
  }

  // Same-origin only: browsers always send Origin on form POSTs, and a
  // cross-site form firing at this URL is an attack, not a visitor.
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');
  if (!origin || !host || new URL(origin).host !== host) {
    return page(
      'Feedback',
      '<h1>Feedback</h1><p>That request did not come from this site.</p>',
      403
    );
  }

  const ip = clientIp(request.headers) ?? 'unknown';
  if (
    !(await allow([
      { key: `evt:${eventId}:feedback:ip:${ip}`, max: 5, windowSeconds: 3600 },
    ]))
  ) {
    return page(
      'Too many attempts',
      '<h1>Too many attempts</h1><p>Please wait a while before trying again.</p>',
      429
    );
  }

  const form = new URLSearchParams(await request.text());
  const ratingRaw = form.get('rating');
  const rating = ratingRaw ? Number(ratingRaw) : null;
  const code = (form.get('code') ?? '').trim().toUpperCase() || null;

  const content = await getPublicEventContent(eventId);
  if (!content?.feedback?.enabled) {
    return new Response('Not found', { status: 404, headers: HEADERS });
  }

  const answers: Record<string, string> = {};
  for (const question of content.feedback.questions) {
    const value = (form.get(`q_${question.key}`) ?? '').trim();
    if (value) answers[question.key] = value.slice(0, 4000);
  }

  const { data, error } = await getPrivilegedClient().rpc('submit_feedback', {
    p_event_id: eventId,
    p_rating: Number.isInteger(rating) ? rating : null,
    p_answers: Object.keys(answers).length ? answers : null,
    p_registration_code: code,
  });
  if (error || data?.result !== 'received') {
    return page(
      'Feedback',
      `<h1>Feedback</h1><p>That did not go through — please check your answers and try again.</p>`,
      400
    );
  }

  const slug = content.event.slug;
  return new Response(null, {
    status: 303,
    headers: { ...HEADERS, Location: `/${slug}/feedback?done=1` },
  });
}
