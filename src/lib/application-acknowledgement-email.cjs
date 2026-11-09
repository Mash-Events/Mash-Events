const DEFAULT_COMMS_EMAIL = 'comms@example.org';
const DEFAULT_SITE_URL = 'https://mash.example';
const { buildEventCalendarIcs } = require('./qr-pass-email.cjs');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderAcknowledgementHtml({
  firstName,
  paragraphs,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const greeting = firstName ? `Dear ${escapeHtml(firstName)},` : 'Hello,';
  const safeReplyEmail = escapeHtml(replyEmail);
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 auto 16px;max-width:475px;color:#3c4043;font-size:16px;line-height:25px">${escapeHtml(paragraph)}</p>`
    )
    .join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#022d5d;font-family:Inter,Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#022d5d" style="background:#022d5d;background:linear-gradient(135deg,#022d5d 0%,#43358a 52%,#b34b5c 100%)"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="610" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:610px;background-color:#ffffff;border:1px solid #e8eaed"><tr><td align="center" bgcolor="#ffffff" style="padding:31px 40px 24px;background:#ffffff"><img src="cid:event-logo" width="194" height="54" alt="Mash Events" style="display:block;width:194px;height:54px;border:0;outline:none;text-decoration:none" /></td></tr><tr><td align="center" style="padding:20px 40px 12px"><p style="margin:0 0 16px;color:#202124;font-size:16px;line-height:25px">${greeting}</p>${body}</td></tr><tr><td style="padding:10px 40px 0"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px;color:#5f6368;font-size:12px;line-height:18px"><p style="margin:0 0 5px">Questions or corrections? Reply to this email or write to <a href="mailto:${safeReplyEmail}" style="color:#022d5d;text-decoration:underline">${safeReplyEmail}</a>.</p><p style="margin:0">Trust &amp; Safety India Festival 2026 &middot; People First. Safety Always.</p></td></tr><tr><td><img src="cid:event-footer" width="610" alt="Mash Event" style="display:block;width:100%;height:auto;border:0" /></td></tr></table></td></tr></table></body></html>`;
}

function buildSpeakerAcknowledgementEmail({
  firstName,
  topic,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const proposedTopic = topic || 'your proposed session';
  const paragraphs = [
    `Thank you for applying to speak at the Trust & Safety India Festival 2026. We have received your proposal, “${proposedTopic}”.`,
    'Our programme team will review submissions alongside the wider festival programme. If we need any additional context about your proposal, preferred format, or availability, we will contact you directly.',
    'There is nothing further you need to do at this stage. We will write to you once there is an update on the review.',
    'This email confirms receipt of your application. It does not confirm a place in the programme.',
  ];

  return {
    subject: 'We have received your Mash Event 2026 speaker application',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function buildVolunteerAcknowledgementEmail({
  firstName,
  interestArea,
  availability,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const area = interestArea || 'your selected area of interest';
  const timing = availability || 'your stated availability';
  const paragraphs = [
    `Thank you for offering to volunteer at the Trust & Safety India Festival 2026. We have received your application for ${area}, with availability noted as ${timing}.`,
    'Our team will review volunteer requirements and contact you when there is an update, or if we need any additional information.',
    'This email confirms receipt of your application. It does not confirm a volunteer placement.',
  ];

  return {
    subject: 'We have received your Mash Event 2026 volunteer application',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function buildMediaAcknowledgementEmail({
  firstName,
  publication,
  coverageDays,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const outlet = publication || 'your publication';
  const coverage = coverageDays || 'the festival';
  const paragraphs = [
    `Thank you for applying for media accreditation to the Trust & Safety India Festival 2026. We have received your request on behalf of ${outlet}.`,
    `You indicated that you intend to cover ${coverage}. If any of these details need correction, please reply to this email.`,
    'Our media team reviews every request individually. We will contact you with an update and, if your request is approved, with press access details and on-site media desk timings.',
    'This email confirms receipt of your request. It does not confirm media accreditation.',
  ];

  return {
    subject:
      'We have received your Mash Event 2026 media accreditation request',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function buildExhibitionAcknowledgementEmail({
  firstName,
  company,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const organisation = company || 'your organisation';
  const paragraphs = [
    `Thank you for your interest in participating in the Trust & Safety India Festival 2026. We have received the exhibition enquiry from ${organisation}.`,
    'Our team will review your requirements and contact you to discuss the most suitable participation or exhibition format.',
    'This email confirms receipt of your enquiry. It does not confirm an exhibition space or partnership.',
  ];

  return {
    subject: 'We have received your Mash Event 2026 exhibition enquiry',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function buildNewsletterAcknowledgementEmail({
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const paragraphs = [
    'Thank you for subscribing to updates from the Trust & Safety India Festival 2026.',
    'We will write when there is something worth your time: programme announcements, speaker news, and registration updates.',
    `If you did not subscribe, or would prefer not to receive these updates, reply to this email or write to ${replyEmail}.`,
  ];

  return {
    subject: "You're on the Mash Event 2026 mailing list",
    text: [
      'Hello,',
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      paragraphs,
      replyEmail,
    }),
  };
}

function buildRegistrationAcknowledgementEmail({
  firstName,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const paragraphs = [
    'Thank you for registering for the Trust & Safety India Festival 2026. We have received your registration and our team is reviewing your application.',
    'There is nothing further you need to do at this stage. We will write to you once there is an update on your registration status, or if we need any additional information.',
    'This email confirms receipt of your registration. It does not confirm participation in the festival.',
  ];

  return {
    subject: 'Mash Event 2026 registration received',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function buildRegistrationConfirmedEmail({
  firstName,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const paragraphs = [
    'We are pleased to confirm your participation in the Trust & Safety India Festival 2026.',
    'Your QR entry pass and practical event details will be shared closer to the festival. Please keep an eye on this email address for the next update.',
    'We look forward to welcoming you in New Delhi.',
  ];

  return {
    subject: 'Your Mash Event 2026 participation is confirmed',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function buildRegistrationWaitlistedEmail({
  firstName,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const paragraphs = [
    'Thank you for your interest in the Trust & Safety India Festival 2026. Due to limited capacity, your registration is currently on the waitlist.',
    'If a place becomes available, we will contact you directly. There is nothing further you need to do at this stage.',
    'This email confirms your waitlist status. It does not confirm participation in the festival.',
  ];

  return {
    subject: 'Mash Event 2026 waitlist update',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function buildRegistrationRejectedEmail({
  firstName,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const paragraphs = [
    'Thank you for taking the time to register for the Trust & Safety India Festival 2026.',
    'Due to limited capacity and the volume of registrations received, we are unable to offer you a place at the festival this year.',
    'We appreciate your interest in the festival and hope to stay connected through future Trust & Safety India initiatives.',
  ];

  return {
    subject: 'Mash Event 2026 registration update',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

function normalizeSiteUrl(siteUrl) {
  return String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

function renderGuestInvitationHtml({
  name,
  replyEmail = DEFAULT_COMMS_EMAIL,
  siteUrl = DEFAULT_SITE_URL,
}) {
  const guestName = escapeHtml(name || 'there');
  const safeReplyEmail = escapeHtml(replyEmail);
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const festivalUrl = `${normalizedSiteUrl}/`;
  const programmeUrl = `${normalizedSiteUrl}/programme`;
  const speakersUrl = `${normalizedSiteUrl}/speakers?year=2026`;
  const venueMapUrl =
    'https://www.google.com/maps/search/?api=1&query=India+International+Centre+New+Delhi';
  const googleCalendarUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Mash+Event+2026&dates=20261014%2F20261016&location=India+International+Centre%2C+New+Delhi';
  const outlookCalendarUrl =
    'https://outlook.office.com/calendar/0/deeplink/compose?subject=Mash%20Event%202026&startdt=2026-10-14T09%3A00%3A00%2B05%3A30&enddt=2026-10-15T18%3A00%3A00%2B05%3A30&location=India%20International%20Centre%2C%20New%20Delhi';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#022d5d;font-family:Inter,Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;mso-hide:all">An invitation to the Trust &amp; Safety India Festival 2026, 14-15 October in New Delhi.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#022d5d" style="background:#022d5d;background:linear-gradient(135deg,#022d5d 0%,#43358a 52%,#b34b5c 100%)"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="610" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:610px;background-color:#ffffff;border:1px solid #e8eaed"><tr><td align="center" bgcolor="#ffffff" style="padding:31px 40px 18px;background:#ffffff"><img src="cid:event-logo" width="194" height="54" alt="Mash Events" style="display:block;width:194px;height:54px;border:0;outline:none;text-decoration:none" /></td></tr><tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:16px;line-height:25px"><p style="margin:0 0 16px">Dear ${guestName},</p><p style="margin:0 auto;max-width:470px">We are pleased to invite you to the Trust &amp; Safety India Festival 2026, a two-day gathering for people working across government, industry, civil society, research, policy, and technology to advance safer digital spaces.</p><p style="margin:16px auto 0;max-width:470px">It would be our pleasure to have you with us. Please save the date and use the links below to view the programme and speakers, find the venue, or add the festival to your calendar.</p><p style="margin:16px auto 0;max-width:470px">We look forward to welcoming you in New Delhi.</p><p style="margin:18px auto 0;max-width:470px">With warm regards,<br /><strong style="color:#202124">Team Mash</strong></p></td></tr><tr><td style="padding:25px 40px 0"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:15px;line-height:24px"><p style="margin:0 0 5px;font-size:16px;font-weight:600;color:#202124">14-15 October 2026</p><p style="margin:0"><a href="${venueMapUrl}" style="color:#022d5d;text-decoration:underline">India International Centre, New Delhi &middot; Venue map</a></p></td></tr><tr><td style="padding:25px 40px 0"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px 27px;color:#3c4043;font-size:14px;line-height:23px"><p style="margin:0 0 13px;font-size:16px;font-weight:600;color:#202124">Plan ahead</p><p style="margin:0 0 5px;color:#5f6368;font-size:12px;line-height:18px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Add to calendar</p><p style="margin:0 0 15px"><a href="${googleCalendarUrl}" style="color:#022d5d;text-decoration:underline">Google Calendar</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><a href="${outlookCalendarUrl}" style="color:#022d5d;text-decoration:underline">Outlook Calendar</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><span style="color:#5f6368">Attached .ics</span></p><p style="margin:0 0 5px;color:#5f6368;font-size:12px;line-height:18px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Explore the event</p><p style="margin:0"><a href="${festivalUrl}" style="color:#022d5d;text-decoration:underline">Mash Event 2026</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><a href="${programmeUrl}" style="color:#022d5d;text-decoration:underline">Programme</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><a href="${speakersUrl}" style="color:#022d5d;text-decoration:underline">Speakers</a></p></td></tr><tr><td style="padding:0 40px"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px;color:#5f6368;font-size:12px;line-height:18px"><p style="margin:0 0 5px">Questions or corrections? Reply to this email or write to <a href="mailto:${safeReplyEmail}" style="color:#022d5d;text-decoration:underline">${safeReplyEmail}</a>.</p><p style="margin:0">Trust &amp; Safety India Festival 2026 &middot; People First. Safety Always.</p></td></tr><tr><td><img src="cid:event-footer" width="610" alt="Mash Event" style="display:block;width:100%;height:auto;border:0" /></td></tr></table></td></tr></table></body></html>`;
}

function buildGuestInvitationEmail({
  name,
  replyEmail = DEFAULT_COMMS_EMAIL,
  siteUrl = DEFAULT_SITE_URL,
}) {
  const guestName = name || 'there';
  const paragraphs = [
    'We are pleased to invite you to the Trust & Safety India Festival 2026, a two-day gathering for people working across government, industry, civil society, research, policy, and technology to advance safer digital spaces.',
    'It would be our pleasure to have you with us. Please save the date and use the links below to view the programme and speakers, find the venue, or add the festival to your calendar.',
    'We look forward to welcoming you in New Delhi.',
  ];
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const venueMapUrl =
    'https://www.google.com/maps/search/?api=1&query=India+International+Centre+New+Delhi';

  return {
    subject: 'Invitation to Mash Event 2026',
    text: [
      `Dear ${guestName},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      'With warm regards,',
      'Team Mash',
      '',
      'Plan ahead',
      `Venue map: ${venueMapUrl}`,
      `Google Calendar: https://calendar.google.com/calendar/render?action=TEMPLATE&text=Mash+Event+2026&dates=20261014%2F20261016&location=India+International+Centre%2C+New+Delhi`,
      `Outlook Calendar: https://outlook.office.com/calendar/0/deeplink/compose?subject=Mash%20Event%202026&startdt=2026-10-14T09%3A00%3A00%2B05%3A30&enddt=2026-10-15T18%3A00%3A00%2B05%3A30&location=India%20International%20Centre%2C%20New%20Delhi`,
      'An .ics calendar file is attached.',
      '',
      'Explore the event',
      `Mash Event 2026: ${normalizedSiteUrl}/`,
      `Programme: ${normalizedSiteUrl}/programme`,
      `Speakers: ${normalizedSiteUrl}/speakers?year=2026`,
      '',
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderGuestInvitationHtml({
      name: guestName,
      replyEmail,
      siteUrl: normalizedSiteUrl,
    }),
    calendarContent: buildEventCalendarIcs(),
  };
}

function buildSpotRegistrationEmail({
  firstName,
  eventDay,
  replyEmail = DEFAULT_COMMS_EMAIL,
}) {
  const name = firstName || 'there';
  const date = eventDay === 2 ? '15 October 2026' : '14 October 2026';
  const paragraphs = [
    `Thank you for registering at the Trust & Safety India Festival 2026 desk on ${date}. Your registration and check-in for today have been recorded.`,
    'You are all set to join the festival today. We are glad you could be here for the programme and conversations.',
    ...(eventDay === 1
      ? [
          'If you join us again tomorrow, please check in at the registration desk.',
        ]
      : []),
  ];

  return {
    subject: 'Your Mash Event 2026 on-site registration is confirmed',
    text: [
      `Dear ${name},`,
      '',
      ...paragraphs.flatMap((paragraph) => [paragraph, '']),
      `Questions or corrections? Reply to this email or write to ${replyEmail}.`,
      '',
      'Trust & Safety India Festival 2026',
      'People First. Safety Always.',
    ].join('\n'),
    html: renderAcknowledgementHtml({
      firstName: name,
      paragraphs,
      replyEmail,
    }),
  };
}

module.exports = {
  DEFAULT_COMMS_EMAIL,
  buildExhibitionAcknowledgementEmail,
  buildSpeakerAcknowledgementEmail,
  buildVolunteerAcknowledgementEmail,
  buildMediaAcknowledgementEmail,
  buildNewsletterAcknowledgementEmail,
  buildRegistrationAcknowledgementEmail,
  buildRegistrationConfirmedEmail,
  buildRegistrationWaitlistedEmail,
  buildRegistrationRejectedEmail,
  buildGuestInvitationEmail,
  buildSpotRegistrationEmail,
  escapeHtml,
};
