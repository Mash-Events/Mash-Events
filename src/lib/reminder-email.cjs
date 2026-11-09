// Renders reminder emails from the copy written in the admin Reminders tab.
// No Node dependencies, so the tab imports it for the live preview and the
// preview matches what is sent.

const REMINDER_REPLY_TO = 'comms@example.org';

// The event the reminders count down to. Dates and venue match
// EVENT_CONFIG in registration-constants.js.
const REMINDER_EVENT = {
  name: 'Mash Event 2026',
  festivalName: 'Trust & Safety India Festival 2026',
  startDate: '2026-10-14',
  dates: '14-15 October 2026',
  venue: 'India International Centre, New Delhi',
  venueMapUrl:
    'https://www.google.com/maps/search/?api=1&query=India+International+Centre+New+Delhi',
  checkIn: 'Check-in from 9:00 AM',
  siteUrl: 'https://mash.example',
  onSiteMapUrl: 'https://mash.example/venue-map',
  // Same calendar links as the QR pass email.
  googleCalendarUrl:
    'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Mash+Event+2026&dates=20261014%2F20261016&location=India+International+Centre%2C+New+Delhi',
  outlookCalendarUrl:
    'https://outlook.office.com/calendar/0/deeplink/compose?subject=Mash%20Event%202026&startdt=2026-10-14T09%3A00%3A00%2B05%3A30&enddt=2026-10-15T18%3A00%3A00%2B05%3A30&location=India%20International%20Centre%2C%20New%20Delhi',
};

// Where things are inside IIC. Matches src/data/venue-map.js.
const WAYFINDING = [
  ['Main Hall', 'Ground Floor, Kamaladevi Complex'],
  ['Registration & Exhibition', 'At the entrance, facing Gate 1'],
  ['Workshops & Roundtables', 'First Floor (Seminar Halls 1, 2 & 3)'],
];

const REMINDER_CALENDAR_FILENAME = 'mash-2026-calendar.ics';

const PLACEHOLDERS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'full_name', label: 'Full name' },
  { key: 'days_to_go', label: 'Days to go' },
  { key: 'event_dates', label: 'Event dates' },
  { key: 'venue', label: 'Venue' },
];
const PLACEHOLDER_KEYS = new Set(PLACEHOLDERS.map(({ key }) => key));
const PLACEHOLDER_REGEX = /\{\{\s*([a-z_]+)\s*\}\}/g;

// Links, bare URLs and **bold**. Link targets are limited to http(s) and
// mailto, so the copy cannot produce javascript: or data: links.
const INLINE_REGEX =
  /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(https?:\/\/[^\s<>]*[^\s<>.,;:!?)\]'"])|\*\*([^*\n]+)\*\*/g;
const LIST_ITEM_REGEX = /^\s*[-*]\s+/;

const LINK_STYLE = 'color:#022d5d;text-decoration:underline';
const DOT = '<span style="color:#9aa0a6;padding:0 8px">&middot;</span>';
const LABEL_STYLE =
  'margin:0 0 5px;color:#5f6368;font-size:12px;line-height:18px;font-weight:600;text-transform:uppercase;letter-spacing:.06em';
const DIVIDER =
  '<tr><td style="padding:25px 40px 0"><div style="border-top:1px solid #dadce0"></div></td></tr>';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Whole days from today in India to the first festival day, never negative.
function daysUntilEvent(
  now = new Date(),
  startDate = REMINDER_EVENT.startDate
) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const days = Math.round(
    (Date.parse(`${startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000
  );
  return Math.max(0, days);
}

function buildPlaceholderValues({ firstName, lastName, now } = {}) {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  return {
    first_name: first || 'there',
    last_name: last,
    full_name: [first, last].filter(Boolean).join(' ') || 'there',
    days_to_go: String(daysUntilEvent(now)),
    event_dates: REMINDER_EVENT.dates,
    venue: REMINDER_EVENT.venue,
  };
}

function findUnknownPlaceholders(text) {
  const unknown = new Set();
  for (const [, key] of String(text || '').matchAll(PLACEHOLDER_REGEX)) {
    if (!PLACEHOLDER_KEYS.has(key)) unknown.add(key);
  }
  return [...unknown];
}

// Placeholders are filled only in text, after the copy is parsed, so a
// registrant's name can never turn into a link or formatting.
function fillPlaceholders(text, values) {
  return String(text || '').replace(PLACEHOLDER_REGEX, (match, key) =>
    PLACEHOLDER_KEYS.has(key) ? (values[key] ?? '') : match
  );
}

function renderTextHtml(text, values) {
  return escapeHtml(fillPlaceholders(text, values));
}

function renderInlineHtml(line, values) {
  let html = '';
  let last = 0;
  for (const match of line.matchAll(INLINE_REGEX)) {
    const [whole, label, href, bareUrl, bold] = match;
    html += renderTextHtml(line.slice(last, match.index), values);
    if (href) {
      html += `<a href="${escapeHtml(href)}" style="${LINK_STYLE}">${renderTextHtml(label, values)}</a>`;
    } else if (bareUrl) {
      html += `<a href="${escapeHtml(bareUrl)}" style="${LINK_STYLE}">${escapeHtml(bareUrl)}</a>`;
    } else {
      html += `<strong style="color:#202124">${renderTextHtml(bold, values)}</strong>`;
    }
    last = match.index + whole.length;
  }
  return html + renderTextHtml(line.slice(last), values);
}

// Same rules as the HTML: placeholders are filled in text and labels, never
// inside a URL, so both versions carry identical links.
function renderInlineText(line, values) {
  let text = '';
  let last = 0;
  for (const match of line.matchAll(INLINE_REGEX)) {
    const [whole, label, href, bareUrl, bold] = match;
    text += fillPlaceholders(line.slice(last, match.index), values);
    if (href) {
      const filledLabel = fillPlaceholders(label, values);
      text += href.startsWith('mailto:')
        ? filledLabel
        : `${filledLabel} (${href})`;
    } else if (bareUrl) {
      text += bareUrl;
    } else {
      text += fillPlaceholders(bold, values);
    }
    last = match.index + whole.length;
  }
  return text + fillPlaceholders(line.slice(last), values);
}

// Blank lines separate paragraphs. Lines starting with "- " form a bulleted
// list, including right under an intro line ("A few things:\n- One").
function splitBlocks(body) {
  const blocks = [];
  const paragraphs = String(body || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').filter((line) => line.trim()));
  for (const lines of paragraphs) {
    for (const line of lines) {
      const type = LIST_ITEM_REGEX.test(line) ? 'list' : 'paragraph';
      const text =
        type === 'list' ? line.replace(LIST_ITEM_REGEX, '') : line.trim();
      const current = blocks.at(-1);
      if (current && !current.closed && current.type === type) {
        current.lines.push(text);
      } else {
        // An intro line sits close to the list it introduces.
        if (current && !current.closed) current.tight = true;
        blocks.push({ type, lines: [text] });
      }
    }
    if (blocks.length) blocks.at(-1).closed = true;
  }
  return blocks;
}

// Centred like the other Mash emails: paragraphs sit in a 470px column, and
// a list is a centred block whose bullets stay left-aligned.
function renderBodyHtml(body, values) {
  return splitBlocks(body)
    .map((block) => {
      const bottom = block.tight ? '8px' : '16px';
      return block.type === 'list'
        ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto ${bottom}"><tr><td align="left" style="text-align:left"><ul style="margin:0;padding:0 0 0 22px">${block.lines
            .map(
              (line) =>
                `<li style="margin:0 0 6px">${renderInlineHtml(line, values)}</li>`
            )
            .join('')}</ul></td></tr></table>`
        : `<p style="margin:0 auto ${bottom};max-width:470px">${block.lines
            .map((line) => renderInlineHtml(line, values))
            .join('<br />')}</p>`;
    })
    .join('');
}

function renderBodyText(body, values) {
  return splitBlocks(body)
    .map(
      (block) =>
        block.lines
          .map((line) =>
            block.type === 'list'
              ? `- ${renderInlineText(line, values)}`
              : renderInlineText(line, values)
          )
          .join('\n') + (block.tight ? '\n' : '\n\n')
    )
    .join('')
    .trim();
}

// One line on what /programme offers today: filters, per-session Add to
// Calendar, and the Build My Agenda PDF.
const AGENDA_LINE =
  'Filter sessions, save favourites to your calendar and download your own PDF agenda.';

// Plan-your-days block, then the QR pass email's calendar and explore links.
function renderWayfindingHtml() {
  const rows = WAYFINDING.map(
    ([place, where]) =>
      `<tr><td style="padding:3px 8px 3px 0;color:#202124;font-weight:600;text-align:right;vertical-align:top;white-space:nowrap">${escapeHtml(place)}</td><td style="padding:3px 0 3px 8px;color:#3c4043;text-align:left;vertical-align:top">${escapeHtml(where)}</td></tr>`
  ).join('');
  return `<tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:14px;line-height:21px"><p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#202124">Finding your way</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto">${rows}</table><p style="margin:12px 0 0"><a href="${escapeHtml(REMINDER_EVENT.onSiteMapUrl)}" style="${LINK_STYLE};font-weight:600">See the venue map</a></p></td></tr>${DIVIDER}`;
}

function renderPlanAheadHtml() {
  const site = REMINDER_EVENT.siteUrl;
  return `<tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:15px;line-height:24px"><p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#202124">Plan your two days</p><p style="margin:0 auto;max-width:420px">${escapeHtml(AGENDA_LINE)}</p><p style="margin:10px 0 0"><a href="${site}/programme" style="${LINK_STYLE};font-weight:600">Build my agenda</a></p></td></tr>${DIVIDER}<tr><td align="center" style="padding:20px 40px 27px;color:#3c4043;font-size:14px;line-height:23px"><p style="${LABEL_STYLE}">Add the festival to your calendar</p><p style="margin:0 0 15px"><a href="${escapeHtml(REMINDER_EVENT.googleCalendarUrl)}" style="${LINK_STYLE}">Google Calendar</a>${DOT}<a href="${escapeHtml(REMINDER_EVENT.outlookCalendarUrl)}" style="${LINK_STYLE}">Outlook Calendar</a>${DOT}<span style="color:#5f6368">Attached .ics</span></p><p style="${LABEL_STYLE}">Explore the event</p><p style="margin:0"><a href="${site}/" style="${LINK_STYLE}">Mash Event 2026</a>${DOT}<a href="${site}/programme" style="${LINK_STYLE}">Programme</a>${DOT}<a href="${site}/speakers?year=2026" style="${LINK_STYLE}">Speakers</a></p></td></tr>`;
}

function renderReminderHtml({ bodyHtml, preheader, replyEmail, test }) {
  const safeReplyEmail = escapeHtml(replyEmail);
  const testBanner = test
    ? '<tr><td align="center" bgcolor="#fef7e0" style="padding:10px 40px;background-color:#fef7e0;color:#7a4f01;font-size:13px;line-height:19px">Test email. This was not sent to any registrant.</td></tr>'
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#022d5d;font-family:Inter,Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;mso-hide:all">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#022d5d" style="background:#022d5d;background:linear-gradient(135deg,#022d5d 0%,#43358a 52%,#b34b5c 100%)"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="610" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:610px;background-color:#ffffff;border:1px solid #e8eaed">${testBanner}<tr><td align="center" bgcolor="#ffffff" style="padding:31px 40px 18px;background:#ffffff"><img src="cid:event-logo" width="194" height="54" alt="Mash Events" style="display:block;width:194px;height:54px;border:0;outline:none;text-decoration:none" /></td></tr><tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:16px;line-height:25px;text-align:center">${bodyHtml}</td></tr>${DIVIDER}<tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:15px;line-height:24px"><p style="margin:0 0 5px;font-size:16px;font-weight:600;color:#202124">${escapeHtml(REMINDER_EVENT.dates)}</p><p style="margin:0"><a href="${escapeHtml(REMINDER_EVENT.venueMapUrl)}" style="${LINK_STYLE}">${escapeHtml(REMINDER_EVENT.venue)} &middot; Directions</a></p><p style="margin:9px 0 0">${escapeHtml(REMINDER_EVENT.checkIn)}</p></td></tr>${DIVIDER}${renderWayfindingHtml()}${renderPlanAheadHtml()}<tr><td style="padding:0 40px"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px;color:#5f6368;font-size:12px;line-height:18px"><p style="margin:0 0 5px">Questions? Reply to this email or write to <a href="mailto:${safeReplyEmail}" style="${LINK_STYLE}">${safeReplyEmail}</a>.</p><p style="margin:0">${escapeHtml(REMINDER_EVENT.festivalName)} &middot; People First. Safety Always.</p></td></tr><tr><td><img src="cid:event-footer" width="610" alt="Mash Event" style="display:block;width:100%;height:auto;border:0" /></td></tr></table></td></tr></table></body></html>`;
}

function buildReminderEmail({
  subject,
  body,
  recipient = {},
  replyEmail = REMINDER_REPLY_TO,
  now,
  test = false,
}) {
  const values = buildPlaceholderValues({ ...recipient, now });
  const filledSubject = fillPlaceholders(subject, values)
    .replace(/\s+/g, ' ')
    .trim();
  const bodyText = renderBodyText(body, values);
  const preheader = bodyText.split('\n').find((line) => line.trim()) || '';
  return {
    subject: test ? `[TEST] ${filledSubject}` : filledSubject,
    text: [
      ...(test ? ['TEST EMAIL. This was not sent to any registrant.', ''] : []),
      bodyText,
      '',
      REMINDER_EVENT.dates,
      REMINDER_EVENT.venue,
      `Directions: ${REMINDER_EVENT.venueMapUrl}`,
      REMINDER_EVENT.checkIn,
      '',
      'Finding your way',
      ...WAYFINDING.map(([place, where]) => `${place}: ${where}`),
      `Venue map: ${REMINDER_EVENT.onSiteMapUrl}`,
      '',
      'Plan your two days',
      AGENDA_LINE,
      `Build my agenda: ${REMINDER_EVENT.siteUrl}/programme`,
      '',
      'Add the festival to your calendar',
      `Google Calendar: ${REMINDER_EVENT.googleCalendarUrl}`,
      `Outlook Calendar: ${REMINDER_EVENT.outlookCalendarUrl}`,
      '',
      `Speakers: ${REMINDER_EVENT.siteUrl}/speakers?year=2026`,
      '',
      `Questions? Reply to this email or write to ${replyEmail}.`,
      '',
      REMINDER_EVENT.festivalName,
      'People First. Safety Always.',
    ].join('\n'),
    html: renderReminderHtml({
      bodyHtml: renderBodyHtml(body, values),
      preheader: preheader.slice(0, 140),
      replyEmail,
      test,
    }),
  };
}

const DEFAULT_REMINDER_SUBJECT =
  'Mash Event 2026 is {{days_to_go}} days away: see you in New Delhi';

const DEFAULT_REMINDER_BODY = `Dear {{first_name}},

The Trust & Safety India Festival 2026 is just **{{days_to_go}} days away**, and we are looking forward to welcoming you to the India International Centre, New Delhi on {{event_dates}}.

Take a look at the programme and speakers below to plan your two days, and add the festival to your calendar if you have not already.

With warm regards,
**Team Mash**`;

module.exports = {
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_SUBJECT,
  PLACEHOLDERS,
  REMINDER_CALENDAR_FILENAME,
  REMINDER_EVENT,
  REMINDER_REPLY_TO,
  buildPlaceholderValues,
  buildReminderEmail,
  daysUntilEvent,
  escapeHtml,
  findUnknownPlaceholders,
};
