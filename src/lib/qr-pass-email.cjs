const DEFAULT_SITE_URL = 'https://mash.example';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeSiteUrl(siteUrl) {
  return String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

function buildEventCalendarIcs({ dtstamp = '20260921T000000Z' } = {}) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mash Events//Mash Event 2026//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:events@example.org',
    `DTSTAMP:${dtstamp}`,
    'DTSTART;VALUE=DATE:20261014',
    'DTEND;VALUE=DATE:20261016',
    'SUMMARY:Mash Event 2026 - Trust & Safety India Festival',
    'LOCATION:India International Centre, New Delhi',
    'DESCRIPTION:Trust & Safety India Festival 2026.',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function buildQrPassEmail({
  firstName,
  qrImageUrl,
  registrationCode,
  siteUrl = DEFAULT_SITE_URL,
}) {
  const safeFirstName = escapeHtml(firstName || 'Participant');
  const safeQrImageUrl = escapeHtml(qrImageUrl);
  const safeRegistrationCode = escapeHtml(registrationCode || '-');
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

  const text = `Dear ${firstName || 'Participant'},

We’re looking forward to welcoming you to the Trust & Safety India Festival 2026. Your participation is confirmed, and the QR code in this email is your entry pass.

Registration ID: ${registrationCode || '-'}

Please keep it ready at the registration desk, along with a valid government-issued photo ID.

14-15 October 2026
India International Centre, New Delhi
Check-in from 9:00 AM

For support, reply to contact@example.org.`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#022d5d;font-family:Inter,Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;mso-hide:all">Your Mash Event 2026 QR entry pass is ready for 14-15 October in New Delhi.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#022d5d" style="background:#022d5d;background:linear-gradient(135deg,#022d5d 0%,#43358a 52%,#b34b5c 100%)"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="610" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:610px;background-color:#ffffff;border:1px solid #e8eaed"><tr><td align="center" bgcolor="#ffffff" style="padding:31px 40px 18px;background:#ffffff"><img src="cid:event-logo" width="194" height="54" alt="Mash Events" style="display:block;width:194px;height:54px;border:0;outline:none;text-decoration:none" /></td></tr><tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:16px;line-height:25px"><p style="margin:0 0 16px">Dear ${safeFirstName},</p><p style="margin:0 auto;max-width:470px">We’re looking forward to welcoming you to the Trust &amp; Safety India Festival 2026. Your participation is confirmed, and the QR code below is your entry pass.</p><p style="margin:16px auto 0;max-width:470px">Please keep it ready at the registration desk, along with a valid government-issued photo ID.</p></td></tr><tr><td align="center" style="padding:27px 40px 12px"><img src="${safeQrImageUrl}" width="230" height="230" alt="Mash Event 2026 QR entry pass" style="display:block;width:230px;height:230px;border:0" /><p style="margin:11px 0 0;color:#6b7280;font-size:12px;line-height:18px">Registration ID: ${safeRegistrationCode}</p><p style="margin:6px 0 0;color:#6b7280;font-size:12px;line-height:18px">If the QR image does not display, use the attached PDF entry pass.</p></td></tr><tr><td style="padding:25px 40px 0"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px 0;color:#3c4043;font-size:15px;line-height:24px"><p style="margin:0 0 5px;font-size:16px;font-weight:600;color:#202124">14&ndash;15 October 2026</p><p style="margin:0"><a href="${venueMapUrl}" style="color:#022d5d;text-decoration:underline">India International Centre, New Delhi &middot; Venue map</a></p><p style="margin:9px 0 0">Check-in from 9:00 AM</p></td></tr><tr><td style="padding:25px 40px 0"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px 27px;color:#3c4043;font-size:14px;line-height:23px"><p style="margin:0 0 13px;font-size:16px;font-weight:600;color:#202124">Plan ahead</p><p style="margin:0 0 5px;color:#5f6368;font-size:12px;line-height:18px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Add to calendar</p><p style="margin:0 0 15px"><a href="${googleCalendarUrl}" style="color:#022d5d;text-decoration:underline">Google Calendar</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><a href="${outlookCalendarUrl}" style="color:#022d5d;text-decoration:underline">Outlook Calendar</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><span style="color:#5f6368">Attached .ics</span></p><p style="margin:0 0 5px;color:#5f6368;font-size:12px;line-height:18px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Explore the event</p><p style="margin:0"><a href="${festivalUrl}" style="color:#022d5d;text-decoration:underline">Mash Event 2026</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><a href="${programmeUrl}" style="color:#022d5d;text-decoration:underline">Programme</a><span style="color:#9aa0a6;padding:0 8px">&middot;</span><a href="${speakersUrl}" style="color:#022d5d;text-decoration:underline">Speakers</a></p></td></tr><tr><td style="padding:0 40px"><div style="border-top:1px solid #dadce0"></div></td></tr><tr><td align="center" style="padding:20px 40px;color:#5f6368;font-size:12px;line-height:18px"><p style="margin:0 0 4px">Trust &amp; Safety India Festival 2026</p><p style="margin:0 0 4px">People First. Safety Always.</p><p style="margin:0">For support, reply to this email or write to <a href="mailto:contact@example.org" style="color:#022d5d;text-decoration:underline">contact@example.org</a>.</p></td></tr><tr><td><img src="cid:event-footer" width="610" alt="Mash Event" style="display:block;width:100%;height:auto;border:0" /></td></tr></table></td></tr></table></body></html>`;

  return {
    subject: 'Your Mash Event 2026 QR entry pass',
    text,
    html,
    calendarContent: buildEventCalendarIcs(),
  };
}

module.exports = {
  buildQrPassEmail,
  buildEventCalendarIcs,
  escapeHtml,
};
