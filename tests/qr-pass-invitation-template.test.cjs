const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const qrPassEmail = require('../src/lib/qr-pass-email.cjs');
const qrPassTemplate = require('../src/lib/qr-pass-template.cjs');

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('invitation QR pass template is opt-in and defaults to legacy', () => {
  assert.equal(qrPassTemplate.getQrPassTemplateVersion({}), 'legacy');
  assert.equal(
    qrPassTemplate.getQrPassTemplateVersion({
      QR_PASS_EMAIL_TEMPLATE_VERSION: 'invitation_v2',
    }),
    'invitation_v2'
  );
  assert.equal(
    qrPassTemplate.isInvitationQrPassTemplateEnabled({
      QR_PASS_EMAIL_TEMPLATE_VERSION: 'INVITATION_V2',
    }),
    true
  );
});

test('approved QR email uses the requested subject, greeting, logo size and registration ID placement', () => {
  const email = qrPassEmail.buildQrPassEmail({
    firstName: 'Asha & Team',
    qrImageUrl: 'https://example.com/qr.png?x=1&y=2',
    registrationCode: 'EVT26-TEST01',
  });

  assert.equal(email.subject, 'Your Mash Event 2026 QR entry pass');
  assert.match(email.html, /Dear Asha &amp; Team,/);
  assert.match(email.html, /width="194" height="54"/);
  assert.doesNotMatch(
    email.html,
    /<h1[^>]*>Your Mash Event 2026 entry pass<\/h1>/
  );
  assert.match(email.html, /Registration ID: EVT26-TEST01/);
  assert.ok(
    email.html.indexOf('Mash Event 2026 QR entry pass') <
      email.html.indexOf('Registration ID: EVT26-TEST01')
  );
  assert.match(email.html, /Attached \.ics/);
  assert.match(
    email.html,
    /href="https:\/\/mash.example\/"[^>]*>Mash Event 2026<\/a>/
  );
  assert.match(
    email.html,
    /href="https:\/\/mash.example\/programme"[^>]*>Programme<\/a>/
  );
  assert.match(
    email.html,
    /href="https:\/\/mash.example\/speakers\?year=2026"[^>]*>Speakers<\/a>/
  );
  assert.doesNotMatch(email.html, /EVT-2026-PREVIEW/);
});

test('calendar attachment covers both event days', () => {
  const calendar = qrPassEmail.buildEventCalendarIcs({
    dtstamp: '20260921T000000Z',
  });

  assert.match(calendar, /DTSTART;VALUE=DATE:20261014/);
  assert.match(calendar, /DTEND;VALUE=DATE:20261016/);
  assert.doesNotMatch(calendar, /preview/i);
});

test('QR invitation renderer is isolated from all other registration email types', () => {
  const emailSource = readSource('src/lib/registration-email.js');
  const passSource = readSource('src/lib/registration-pass.js');

  assert.match(
    emailSource,
    /templateType === 'qr_pass_issued'[\s\S]*isInvitationQrPassTemplateEnabled/
  );
  assert.match(
    emailSource,
    /invitationCopy\?\.html \|\|[\s\S]*renderEmailHtml/
  );
  assert.match(passSource, /if \(usesInvitationTemplate\)/);
  assert.match(passSource, /<InvitationPassPage/);
  assert.match(passSource, /<InstitutionalBadgePage/);
});

test('QR issuance is marked only after the email is accepted for delivery', () => {
  const dbSource = readSource('src/lib/registration-db.js');
  const jobSource = readSource('src/lib/pass-issue-job-service.js');
  const issueStart = dbSource.indexOf(
    'export async function issuePassForRegistration'
  );
  const markStart = dbSource.indexOf('export async function markQrPassIssued');
  const issueSource = dbSource.slice(issueStart, markStart);
  const markSource = dbSource.slice(markStart);

  assert.ok(issueStart >= 0);
  assert.ok(markStart > issueStart);
  assert.doesNotMatch(issueSource, /qr_pass_issued_at\s*:/);
  assert.match(markSource, /qr_pass_issued_at:\s*issuedAt/);
  assert.match(markSource, /\.is\('qr_pass_issued_at', null\)/);

  const deliveryStart = jobSource.indexOf(
    'const emailResult = await deliverRegistrationEmail'
  );
  const deliveryAccepted = jobSource.indexOf(
    'if (!emailResult.sent)',
    deliveryStart
  );
  const markDelivered = jobSource.indexOf(
    'await markQrPassIssued',
    deliveryAccepted
  );

  assert.ok(deliveryStart >= 0);
  assert.ok(deliveryAccepted > deliveryStart);
  assert.ok(markDelivered > deliveryAccepted);
});
