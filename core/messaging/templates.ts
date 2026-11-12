// Transactional email templates (docs/system-design.md §8). Bodies live in
// code; the database only toggles a template or overrides its subject per
// event. Every value is escaped; the context comes from the claimed item's
// own event and registration only.

export type EmailContext = {
  templateKey: string;
  firstName: string;
  registrationCode: string;
  eventName: string;
  eventKind: string;
  eventTimezone: string;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  orgName: string;
  eventUrl: string | null;
  subjectOverride: string | null;
  /** Personal webinar join link (signed per registrant and event). */
  joinUrl?: string | null;
  /** Personal QR pass page link (on-site events, signed per pass). */
  passUrl?: string | null;
  /** Personal certificate claim link (signed per certificate). */
  certUrl?: string | null;
  /** Public verification URL for the event's certificates. */
  verifyUrl?: string | null;
  /** Public feedback form URL for the event. */
  feedbackUrl?: string | null;
  /** Subject and body of a custom (bulk or scheduled) message. */
  customSubject?: string | null;
  customBody?: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export const EMAIL_TEMPLATES = [
  'acknowledgement',
  'confirmed',
  'waitlisted',
  'rejected',
  'custom',
  'certificate_issued',
  'feedback_request',
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATES)[number];

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Header-safe text for email subjects and addresses — re-exported for
 * convenience; the implementation lives in header-safe.ts (a pure module
 * the tests can import).
 */
export { headerSafe } from './header-safe.ts';

function when(ctx: EmailContext): string | null {
  if (!ctx.eventStartsAt) return null;
  const start = new Date(ctx.eventStartsAt);
  const date = new Intl.DateTimeFormat('en-IN', {
    timeZone: ctx.eventTimezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: ctx.eventTimezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(start);
  return `${date}, ${time}`;
}

type Copy = { subject: string; heading: string; paragraphs: string[] };

function copyFor(ctx: EmailContext): Copy {
  const at = when(ctx);
  const isWebinar = ctx.eventKind === 'webinar';
  switch (ctx.templateKey as EmailTemplateKey) {
    case 'acknowledgement':
      return {
        subject: `We received your registration for ${ctx.eventName}`,
        heading: 'Registration received',
        paragraphs: [
          `Thank you for registering for ${ctx.eventName}. Our team will review your registration and email you once it is confirmed.`,
          `Your registration code is ${ctx.registrationCode}.`,
        ],
      };
    case 'confirmed': {
      const onSite = !isWebinar;
      return {
        subject: `You're confirmed for ${ctx.eventName}`,
        heading: 'Your place is confirmed',
        paragraphs: [
          `Good news: your registration for ${ctx.eventName} is confirmed.`,
          ...(at ? [`When: ${at}.`] : []),
          isWebinar
            ? 'We will email your joining link before the session starts.'
            : 'We will share entry details closer to the event.',
          ...(isWebinar && ctx.joinUrl
            ? ['Your personal joining link is below. Please do not share it.']
            : []),
          ...(onSite && ctx.passUrl
            ? [
                'Your entry pass is below — open it and show the QR code at the gate. Screenshot it in case the venue has poor signal.',
              ]
            : []),
          `Your registration code is ${ctx.registrationCode}.`,
        ],
      };
    }
    case 'waitlisted':
      return {
        subject: `You're on the waitlist for ${ctx.eventName}`,
        heading: 'You are on the waitlist',
        paragraphs: [
          `Thank you for your interest in ${ctx.eventName}. All places are currently taken, so we have added you to the waitlist.`,
          'If a place opens up, we will email you straight away.',
        ],
      };
    case 'rejected':
      return {
        subject: `Your registration for ${ctx.eventName}`,
        heading: 'Registration update',
        paragraphs: [
          `Thank you for your interest in ${ctx.eventName}. Unfortunately we are not able to offer you a place this time.`,
          'We hope to see you at a future event.',
        ],
      };
    case 'certificate_issued':
      return {
        subject: `Your certificate for ${ctx.eventName}`,
        heading: 'Your certificate is ready',
        paragraphs: [
          `Thank you for being part of ${ctx.eventName}. Your certificate of participation is ready.`,
          ...(ctx.certUrl
            ? [
                'Open your certificate with the button below. From that page you can download it as a PDF and share the verification link.',
              ]
            : []),
          ...(ctx.verifyUrl
            ? [
                `Anyone can confirm your certificate at ${ctx.verifyUrl} with your certificate code ${ctx.registrationCode}.`,
              ]
            : []),
        ],
      };
    case 'feedback_request':
      return {
        subject: `How was ${ctx.eventName}?`,
        heading: 'Tell us what you thought',
        paragraphs: [
          `Thank you for being part of ${ctx.eventName}. Your feedback takes one minute and shapes the next edition.`,
          ...(ctx.feedbackUrl
            ? ['Share your feedback with the button below.']
            : []),
        ],
      };
    case 'custom':
      if (!ctx.customSubject || !ctx.customBody) {
        throw new Error('custom email needs a subject and body');
      }
      return {
        subject: ctx.customSubject,
        heading: ctx.customSubject,
        // Blank lines separate paragraphs; single line breaks become spaces.
        paragraphs: ctx.customBody
          .split(/\n{2,}/)
          .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
          .filter(Boolean),
      };
    default:
      throw new Error(`unknown email template ${ctx.templateKey}`);
  }
}

export function renderEmail(ctx: EmailContext): RenderedEmail {
  const copy = copyFor(ctx);
  const subject = (ctx.subjectOverride?.trim() || copy.subject).slice(0, 200);
  const greeting = `Dear ${ctx.firstName.trim() || 'there'},`;
  const signOff = `Team ${ctx.eventName}`;

  const text = [
    greeting,
    '',
    ...copy.paragraphs.flatMap((p) => [p, '']),
    ...(ctx.joinUrl ? [`Join the session: ${ctx.joinUrl}`, ''] : []),
    ...(ctx.passUrl ? [`Your entry pass: ${ctx.passUrl}`, ''] : []),
    ...(ctx.certUrl ? [`Your certificate: ${ctx.certUrl}`, ''] : []),
    ...(ctx.eventUrl ? [`Event page: ${ctx.eventUrl}`, ''] : []),
    signOff,
    `${ctx.eventName} · organised by ${ctx.orgName}`,
  ].join('\n');

  const p = (s: string) =>
    `<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(s)}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px">
<tr><td style="padding:24px 28px;background:#0c0a09;color:#ffffff;border-radius:8px 8px 0 0">
<p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">${escapeHtml(ctx.orgName)}</p>
<p style="margin:6px 0 0;font-size:20px;font-weight:600">${escapeHtml(ctx.eventName)}</p></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 20px;font-size:22px">${escapeHtml(copy.heading)}</h1>
${p(greeting)}
${copy.paragraphs.map(p).join('\n')}
${ctx.joinUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(ctx.joinUrl)}" style="display:inline-block;background:#0c0a09;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Join the session</a></p>` : ''}
${ctx.passUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(ctx.passUrl)}" style="display:inline-block;background:#0c0a09;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Show my entry pass</a></p>` : ''}
${ctx.certUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(ctx.certUrl)}" style="display:inline-block;background:#0c0a09;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Open my certificate</a></p>` : ''}
${ctx.feedbackUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(ctx.feedbackUrl)}" style="display:inline-block;background:#0c0a09;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Share feedback</a></p>` : ''}
${ctx.eventUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(ctx.eventUrl)}" style="display:inline-block;background:#0c0a09;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">View event page</a></p>` : ''}
${p(signOff)}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#78716c">${escapeHtml(ctx.eventName)} · organised by ${escapeHtml(ctx.orgName)}</p>
</td></tr></table></body></html>`;

  return { subject, html, text };
}
