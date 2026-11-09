const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_SUBJECT,
  buildReminderEmail,
  daysUntilEvent,
  findUnknownPlaceholders,
} = require('../src/lib/reminder-email.cjs');
const {
  buildRecipientRows,
  deriveRecipientState,
  isBulkSendable,
  normalizeCampaignInput,
  reminderErrorStatus,
  sanitizeAttachmentFilename,
  summarizeRecipients,
} = require('../src/lib/reminder-utils.cjs');
const { buildAdminNavigation } = require('../src/lib/admin-shell-utils.cjs');

function readSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const NOW = new Date('2026-10-04T06:00:00+05:30');

test('days to go are counted in India time up to the first festival day', () => {
  assert.equal(daysUntilEvent(new Date('2026-10-04T00:00:00+05:30')), 10);
  // 23:30 on 3 October in India is still T-11, although it is the 3rd in UTC.
  assert.equal(daysUntilEvent(new Date('2026-10-03T18:00:00Z')), 11);
  // 01:30 on 4 October in India is T-10, although it is the 3rd in UTC.
  assert.equal(daysUntilEvent(new Date('2026-10-03T20:00:00Z')), 10);
  assert.equal(daysUntilEvent(new Date('2026-10-14T09:00:00+05:30')), 0);
  assert.equal(daysUntilEvent(new Date('2026-11-01T09:00:00+05:30')), 0);
});

test('every reminder carries the on-site wayfinding and venue map link', () => {
  const email = buildReminderEmail({
    subject: 'See you soon',
    body: 'Dear {{first_name}},',
    recipient: { firstName: 'Asha' },
    now: NOW,
  });
  assert.match(email.html, /Finding your way/);
  assert.match(
    email.html,
    /Main Hall<\/td><td[^>]*>Ground Floor, Kamaladevi Complex/
  );
  assert.match(
    email.html,
    /<a href="https:\/\/mash.example\/venue-map" style="[^"]*">See the venue map<\/a>/
  );
  assert.doesNotMatch(email.text, /Lunch/);
  assert.match(email.text, /Venue map: https:\/\/mash.example\/venue-map/);
});

test('copy renders paragraphs, bullet lists, bold and links', () => {
  const email = buildReminderEmail({
    subject: 'Mash is {{days_to_go}} days away',
    body: 'Dear {{first_name}},\n\nSee **the programme** at [our site](https://mash.example/programme).\nSecond line.\n\n- One\n- Two https://example.org/x',
    recipient: { firstName: 'Asha', lastName: 'Rao' },
    now: NOW,
  });
  assert.equal(email.subject, 'Mash is 10 days away');
  assert.match(
    email.html,
    /<p style="margin:0 auto 16px;max-width:470px">Dear Asha,<\/p>/
  );
  assert.match(
    email.html,
    /<strong style="color:#202124">the programme<\/strong>/
  );
  assert.match(
    email.html,
    /<a href="https:\/\/mash.example\/programme" style="[^"]*">our site<\/a>\.<br \/>Second line\./
  );
  assert.match(
    email.html,
    /<ul[^>]*><li[^>]*>One<\/li><li[^>]*>Two <a href="https:\/\/example\.org\/x"/
  );
  assert.match(
    email.text,
    /See the programme at our site \(https:\/\/mash.example\/programme\)\./
  );
  assert.match(email.text, /- One\n- Two https:\/\/example\.org\/x/);
});

test("a registrant's own name can never become a link or HTML", () => {
  const email = buildReminderEmail({
    subject: 'Hello {{first_name}}',
    body: 'Dear {{first_name}} {{last_name}},\n\nWelcome.',
    recipient: {
      firstName: '[Claim prize](https://evil.example)',
      lastName: '<img src=x onerror=alert(1)> **bold** https://evil.example',
    },
    now: NOW,
  });
  assert.doesNotMatch(email.html, /href="https:\/\/evil\.example"/);
  assert.doesNotMatch(email.html, /<img src=x/);
  assert.doesNotMatch(email.html, /<strong[^>]*>bold/);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('only http(s) and mailto links are rendered as links', () => {
  const email = buildReminderEmail({
    subject: 'x',
    body: '[click](javascript:alert(1)) and [mail](mailto:comms@example.org)',
    now: NOW,
  });
  assert.doesNotMatch(email.html, /href="javascript:/);
  assert.match(email.html, /href="mailto:comms@example.org"/);
  assert.match(email.text, /\[click\]\(javascript:alert\(1\)\) and mail/);
});

test('reminder emails keep the white card when Gmail quotes them', () => {
  const email = buildReminderEmail({
    subject: DEFAULT_REMINDER_SUBJECT,
    body: DEFAULT_REMINDER_BODY,
    recipient: { firstName: 'Asha' },
    now: NOW,
  });
  assert.match(
    email.html,
    /width="610"[^>]*bgcolor="#ffffff" style="[^"]*background-color:#ffffff/
  );
  assert.match(email.html, /cid:event-logo/);
  assert.match(email.html, /cid:event-footer/);
  assert.match(email.html, /14-15 October 2026/);
  assert.match(email.text, /Questions\? Reply to this email/);
  assert.equal(findUnknownPlaceholders(DEFAULT_REMINDER_BODY).length, 0);
});

test('test emails are marked and never look like a real send', () => {
  const email = buildReminderEmail({
    subject: 'Reminder',
    body: 'Hi',
    test: true,
    now: NOW,
  });
  assert.equal(email.subject, '[TEST] Reminder');
  assert.match(
    email.html,
    /Test email\. This was not sent to any registrant\./
  );
  assert.match(email.text, /^TEST EMAIL\./);
});

test('saving rejects unknown placeholders and empty copy', () => {
  assert.throws(
    () =>
      normalizeCampaignInput({
        name: 'T-7',
        subject: 'Hi {{firstname}}',
        body: 'x',
      }),
    /Subject uses an unknown placeholder: \{\{firstname\}\}/
  );
  assert.throws(
    () => normalizeCampaignInput({ name: 'T-7', subject: 'Hi', body: '   ' }),
    /Email copy is required/
  );
  assert.deepEqual(
    normalizeCampaignInput({
      name: '  T-7   reminder ',
      subject: 'Hi {{ first_name }}',
      body: 'Line one  \r\nLine two\n\n',
    }),
    {
      name: 'T-7 reminder',
      subject: 'Hi {{ first_name }}',
      body: 'Line one\nLine two',
    }
  );
});

test('recipient state follows their deliveries for this reminder', () => {
  assert.equal(deriveRecipientState([]).state, 'not_sent');
  assert.equal(
    deriveRecipientState([
      {
        delivery_status: 'failed',
        failure_reason: 'Bounced',
        created_at: '2026-10-04T10:00:00Z',
      },
    ]).state,
    'failed'
  );
  const resent = deriveRecipientState([
    { delivery_status: 'failed', created_at: '2026-10-05T10:00:00Z' },
    {
      delivery_status: 'accepted',
      content_version: 2,
      created_at: '2026-10-04T10:00:00Z',
    },
  ]);
  assert.equal(resent.state, 'sent');
  assert.equal(resent.lastSentVersion, 2);
  // The failed resend is still reported, though they did get the reminder.
  assert.equal(resent.lastError, 'Email was not sent.');
  const open = deriveRecipientState([
    { id: 'a', delivery_status: 'sending', created_at: '2026-10-05T10:00:00Z' },
    { delivery_status: 'accepted', created_at: '2026-10-04T10:00:00Z' },
  ]);
  assert.equal(open.state, 'sending');
  assert.equal(open.activeAttempt.id, 'a');
});

test('bulk send covers unsent and failed registrants only', () => {
  const rows = buildRecipientRows({
    registrations: [
      { id: 'r1', first_name: 'A', last_name: 'One', email: 'a@x.org' },
      { id: 'r2', first_name: 'B', last_name: 'Two', email: 'b@x.org' },
      { id: 'r3', first_name: 'C', last_name: 'Three', email: 'c@x.org' },
      { id: 'r4', first_name: 'D', last_name: 'Four', email: 'd@x.org' },
    ],
    deliveries: [
      {
        registration_id: 'r2',
        delivery_status: 'accepted',
        created_at: '2026-10-04T10:00:00Z',
      },
      {
        registration_id: 'r3',
        delivery_status: 'failed',
        created_at: '2026-10-04T10:00:00Z',
      },
      {
        registration_id: 'r4',
        delivery_status: 'sending',
        created_at: '2026-10-04T10:00:00Z',
      },
      {
        registration_id: null,
        delivery_status: 'accepted',
        created_at: '2026-10-04T10:00:00Z',
      },
    ],
  });
  assert.deepEqual(
    rows.filter(isBulkSendable).map((row) => row.id),
    ['r1', 'r3']
  );
  assert.deepEqual(summarizeRecipients(rows), {
    total: 4,
    sent: 1,
    notSent: 1,
    attention: 2,
  });
});

test('attachment names keep what people see but match the real type', () => {
  assert.equal(
    sanitizeAttachmentFilename(
      'C:\\Users\\me\\Mash Agenda.PDF',
      'application/pdf'
    ),
    'Mash Agenda.pdf'
  );
  assert.equal(
    sanitizeAttachmentFilename('map"; evil.exe', 'image/png'),
    'map evil.png'
  );
  assert.equal(sanitizeAttachmentFilename('', 'image/jpeg'), 'attachment.jpg');
});

test('error messages map to useful HTTP statuses', () => {
  assert.equal(reminderErrorStatus('Reminder not found.'), 404);
  assert.equal(reminderErrorStatus('Attach only PDF, PNG or JPG files.'), 400);
  assert.equal(
    reminderErrorStatus(
      'Each attachment must be 4 MB or smaller. This file is too large.'
    ),
    400
  );
  assert.equal(
    reminderErrorStatus('This registrant has already been sent this reminder.'),
    409
  );
  assert.equal(
    reminderErrorStatus('This registrant is no longer confirmed.'),
    409
  );
  assert.equal(reminderErrorStatus('Resend is not configured.'), 503);
});

test('admin navigation lists Reminders with its own icon', () => {
  const sections = buildAdminNavigation({ pathname: '/admin/reminders' });
  const item = sections[0].items.find(
    ({ href }) => href === '/admin/reminders'
  );
  assert.equal(item.label, 'Reminders');
  assert.equal(item.active, true);
  const shell = readSource('src/components/admin/admin-shell.jsx');
  assert.match(shell, /'\/admin\/reminders': Ico\.bell/);
  // The sidebar renders ADM_NAV_ITEMS, so the tab must be listed there too.
  const navList = shell.slice(
    shell.indexOf('const ADM_NAV_ITEMS = ['),
    shell.indexOf('];', shell.indexOf('const ADM_NAV_ITEMS = ['))
  );
  assert.match(
    navList,
    /'\/admin\/speaker-communications',\s*'\/admin\/reminders',/
  );
  assert.match(
    shell,
    /'\/admin\/reminders': \{\s*kicker: 'REGISTRANTS · REMINDERS',\s*title: 'Event Reminders'/
  );
});

test('attachments are typed by their bytes, not their name', () => {
  const source = readSource('src/lib/reminder-attachments.js');
  assert.match(source, /'%PDF-'/);
  assert.match(source, /sniffImageMimeType\(buffer\)/);
  assert.match(source, /Attach only PDF, PNG or JPG files\./);
});

test('bullets right under an intro line still form a list', () => {
  const email = buildReminderEmail({
    subject: 'x',
    body: 'A few things:\n- One\n- Two\n\nThanks',
    now: NOW,
  });
  assert.match(
    email.html,
    /<p style="margin:0 auto 8px;max-width:470px">A few things:<\/p><table[^>]*style="margin:0 auto 16px"><tr><td align="left" style="text-align:left"><ul[^>]*><li[^>]*>One<\/li><li[^>]*>Two<\/li><\/ul><\/td><\/tr><\/table><p style="margin:0 auto 16px;max-width:470px">Thanks<\/p>/
  );
  assert.match(email.text, /^A few things:\n- One\n- Two\n\nThanks/);
});

test('reminders are centred and carry the QR email plan-ahead section', () => {
  const email = buildReminderEmail({
    subject: DEFAULT_REMINDER_SUBJECT,
    body: DEFAULT_REMINDER_BODY,
    recipient: { firstName: 'Asha' },
    now: NOW,
  });
  assert.match(
    email.html,
    /<td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:16px;line-height:25px;text-align:center"><p style="margin:0 auto 16px;max-width:470px">Dear Asha,/
  );
  assert.doesNotMatch(email.html, /text-align:left">Dear/);
  for (const text of [
    'Check-in from 9:00 AM',
    'Plan your two days',
    'Filter sessions, save favourites to your calendar and download your own PDF agenda.',
    '>Build my agenda</a>',
    'Add the festival to your calendar',
    'Google Calendar',
    'Outlook Calendar',
    'Attached .ics',
    'Explore the event',
  ]) {
    assert.ok(email.html.includes(text), text);
  }
  assert.match(email.html, /href="https:\/\/mash.example\/programme"/);
  assert.match(
    email.html,
    /href="https:\/\/mash.example\/speakers\?year=2026"/
  );
  // Programme and speakers live in that section, not in the starter copy.
  assert.doesNotMatch(DEFAULT_REMINDER_BODY, /programme\b.*https|\/speakers/);
  assert.match(
    email.text,
    /Plan your two days\nFilter sessions[^\n]*PDF agenda\.\nBuild my agenda: https:\/\/mash.example\/programme/
  );
  // A plain underlined link, like the other links in the email.
  assert.match(
    email.html,
    /<a href="https:\/\/mash.example\/programme" style="color:#022d5d;text-decoration:underline;font-weight:600">Build my agenda<\/a>/
  );

  const send = readSource('src/lib/reminder-send.js');
  assert.match(send, /filename: REMINDER_CALENDAR_FILENAME/);
  assert.match(send, /buildEventCalendarIcs\(\)/);
});

test('only definite Resend rejections close an attempt as failed', () => {
  const {
    isDefiniteProviderRejection,
  } = require('../src/lib/reminder-utils.cjs');
  for (const name of [
    'validation_error',
    'invalid_attachment',
    'rate_limit_exceeded',
  ]) {
    assert.equal(
      isDefiniteProviderRejection({ providerErrorName: name }),
      true,
      name
    );
  }
  // After these the outcome is unknown, so the attempt stays locked.
  for (const name of [
    'internal_server_error',
    'application_error',
    'concurrent_idempotent_requests',
    'invalid_idempotent_request',
    undefined,
  ]) {
    assert.equal(
      isDefiniteProviderRejection({ providerErrorName: name }),
      false,
      String(name)
    );
  }
  assert.equal(isDefiniteProviderRejection(new Error('network down')), false);

  const resend = readSource('src/lib/resend.js');
  assert.match(resend, /failure\.providerErrorName = error\.name/);
  const send = readSource('src/lib/reminder-send.js');
  assert.match(send, /isDefiniteProviderRejection\(error\)/);
  assert.match(send, /!isValidEmail\(registration\.email\)/);
});

test('the plain-text version never fills placeholders inside a URL', () => {
  const email = buildReminderEmail({
    subject: 'x',
    body: 'See https://example.org/{{first_name}} and [{{first_name}} page](https://example.org/a)',
    recipient: { firstName: 'Asha' },
    now: NOW,
  });
  assert.match(
    email.text,
    /See https:\/\/example\.org\/\{\{first_name\}\} and Asha page \(https:\/\/example\.org\/a\)/
  );
  assert.match(email.html, /href="https:\/\/example\.org\/\{\{first_name\}\}"/);
});
