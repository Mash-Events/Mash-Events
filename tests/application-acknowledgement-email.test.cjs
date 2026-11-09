const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_COMMS_EMAIL,
  buildExhibitionAcknowledgementEmail,
  buildGuestInvitationEmail,
  buildMediaAcknowledgementEmail,
  buildNewsletterAcknowledgementEmail,
  buildRegistrationAcknowledgementEmail,
  buildRegistrationConfirmedEmail,
  buildRegistrationRejectedEmail,
  buildRegistrationWaitlistedEmail,
  buildSpeakerAcknowledgementEmail,
  buildVolunteerAcknowledgementEmail,
} = require('../src/lib/application-acknowledgement-email.cjs');

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('speaker acknowledgement uses the premium layout and private comms reply address', () => {
  const email = buildSpeakerAcknowledgementEmail({
    firstName: 'Asha & Team',
    topic: 'Safety <by design>',
  });

  assert.equal(
    email.subject,
    'We have received your Mash Event 2026 speaker application'
  );
  assert.doesNotMatch(email.html, /Speaker application received/);
  assert.match(email.html, /Dear Asha &amp; Team,/);
  assert.match(email.html, /Safety &lt;by design&gt;/);
  assert.match(
    email.text,
    /submissions alongside the wider festival programme/
  );
  assert.match(
    email.text,
    /There is nothing further you need to do at this stage/
  );
  assert.match(email.text, /does not confirm a place in the programme/);
  assert.match(email.html, /cid:event-logo/);
  assert.match(email.html, /cid:event-footer/);
  assert.match(email.html, new RegExp(DEFAULT_COMMS_EMAIL));
  assert.doesNotMatch(email.html, /contact@example.org/);
  assert.doesNotMatch(email.text, /contact@example.org/);
});

test('volunteer acknowledgement confirms receipt without promising placement', () => {
  const email = buildVolunteerAcknowledgementEmail({
    firstName: 'Asha',
    interestArea: 'Speaker support',
    availability: 'Both event days',
  });

  assert.equal(
    email.subject,
    'We have received your Mash Event 2026 volunteer application'
  );
  assert.doesNotMatch(email.html, /Volunteer application received/);
  assert.match(email.text, /Speaker support/);
  assert.match(email.text, /Both event days/);
  assert.match(email.text, /does not confirm a volunteer placement/);
  assert.match(email.html, new RegExp(DEFAULT_COMMS_EMAIL));
  assert.doesNotMatch(email.html, /contact@example.org/);
});

test('media acknowledgement uses the external acknowledgement design', () => {
  const email = buildMediaAcknowledgementEmail({
    firstName: 'Asha',
    publication: 'Example News',
    coverageDays: 'both festival days',
  });

  assert.equal(
    email.subject,
    'We have received your Mash Event 2026 media accreditation request'
  );
  assert.match(email.html, /Dear Asha,/);
  assert.match(email.text, /on behalf of Example News/);
  assert.match(email.text, /does not confirm media accreditation/);
  assert.match(email.html, /cid:event-logo/);
  assert.doesNotMatch(email.html, /contact@example.org/);
});

test('exhibition and newsletter acknowledgements use the external design', () => {
  const exhibition = buildExhibitionAcknowledgementEmail({
    firstName: 'Asha',
    company: 'Example Co',
  });
  const newsletter = buildNewsletterAcknowledgementEmail({});

  assert.match(exhibition.html, /Dear Asha,/);
  assert.match(exhibition.text, /enquiry from Example Co/);
  assert.match(
    exhibition.text,
    /does not confirm an exhibition space or partnership/
  );
  assert.match(exhibition.html, /cid:event-logo/);
  assert.match(newsletter.html, /Hello,/);
  assert.match(
    newsletter.text,
    /programme announcements, speaker news, and registration updates/
  );
  assert.match(newsletter.html, /cid:event-footer/);
});

test('registration acknowledgement and confirmation use the external design', () => {
  const acknowledgement = buildRegistrationAcknowledgementEmail({
    firstName: 'Asha',
  });
  const confirmed = buildRegistrationConfirmedEmail({ firstName: 'Asha' });

  assert.equal(
    acknowledgement.subject,
    'Mash Event 2026 registration received'
  );
  assert.match(acknowledgement.html, /Dear Asha,/);
  assert.match(
    acknowledgement.text,
    /does not confirm participation in the festival/
  );
  assert.match(acknowledgement.html, /cid:event-footer/);
  assert.doesNotMatch(acknowledgement.html, /contact@example.org/);

  assert.equal(
    confirmed.subject,
    'Your Mash Event 2026 participation is confirmed'
  );
  assert.match(confirmed.html, /Dear Asha,/);
  assert.match(
    confirmed.text,
    /Your QR entry pass and practical event details/
  );
  assert.match(confirmed.html, /cid:event-logo/);
  assert.doesNotMatch(confirmed.html, /contact@example.org/);
});

test('registration waitlist and rejection updates use the external design', () => {
  const waitlisted = buildRegistrationWaitlistedEmail({ firstName: 'Asha' });
  const rejected = buildRegistrationRejectedEmail({ firstName: 'Asha' });

  assert.equal(waitlisted.subject, 'Mash Event 2026 waitlist update');
  assert.match(waitlisted.html, /Dear Asha,/);
  assert.match(waitlisted.text, /currently on the waitlist/);
  assert.match(
    waitlisted.text,
    /does not confirm participation in the festival/
  );
  assert.match(waitlisted.html, /cid:event-logo/);

  assert.equal(rejected.subject, 'Mash Event 2026 registration update');
  assert.match(rejected.html, /Dear Asha,/);
  assert.match(rejected.text, /unable to offer you a place at the festival/);
  assert.match(rejected.html, /cid:event-footer/);
  assert.doesNotMatch(rejected.html, /contact@example.org/);
});

test('guest invitation uses the fixed premium template without registration or QR language', () => {
  const invitation = buildGuestInvitationEmail({
    name: 'Asha & Team',
  });

  assert.equal(invitation.subject, 'Invitation to Mash Event 2026');
  assert.match(invitation.html, /Dear Asha &amp; Team,/);
  assert.match(invitation.html, /14-15 October/);
  assert.match(
    invitation.text,
    /two-day gathering for people working across government, industry, civil society, research, policy, and technology/
  );
  assert.match(invitation.text, /Please save the date and use the links below/);
  assert.match(invitation.text, /Team Mash/);
  assert.match(invitation.html, /Venue map/);
  assert.match(invitation.html, /Google Calendar/);
  assert.match(invitation.html, /Outlook Calendar/);
  assert.match(invitation.html, /Attached \.ics/);
  assert.match(invitation.html, /Explore the event/);
  assert.match(invitation.html, /Speakers/);
  assert.match(invitation.calendarContent, /BEGIN:VCALENDAR/);
  assert.match(invitation.html, /cid:event-logo/);
  assert.match(invitation.html, /cid:event-footer/);
  assert.match(invitation.html, new RegExp(DEFAULT_COMMS_EMAIL));
  assert.doesNotMatch(
    invitation.text,
    /QR|register|RSVP|VIP|arrival and entry|shared separately/i
  );
});

test('registration acknowledgement and confirmation render through the external template only', () => {
  const source = readSource('src/lib/registration-email.js');

  assert.match(source, /templateType === 'submission_received'/);
  assert.match(source, /buildRegistrationAcknowledgementEmail/);
  assert.match(source, /templateType === 'confirmed'/);
  assert.match(source, /buildRegistrationConfirmedEmail/);
  assert.match(source, /templateType === 'waitlisted'/);
  assert.match(source, /buildRegistrationWaitlistedEmail/);
  assert.match(source, /templateType === 'rejected'/);
  assert.match(source, /buildRegistrationRejectedEmail/);
  assert.match(source, /registrationStatusCopy\?\.html/);
  assert.match(source, /getEventEmailInlineAttachments/);
  assert.match(source, /registrationStatusCopy[\s\S]*\? \[replyEmail\]/);
});
