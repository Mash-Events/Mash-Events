const guestUtils = require('./guest-invitation-utils.cjs');
const checkInUtils = require('./check-in-day-utils.cjs');

const { normalizeGuestInvitationInput, sanitizeGuestText } = guestUtils;
const { CHECK_IN_DAYS, formatDateInTimeZone } = checkInUtils;

function eventDayNow(now = new Date()) {
  const localDate = formatDateInTimeZone(now);
  return CHECK_IN_DAYS.find((day) => day.date === localDate) || null;
}

function normalizeSpotInput(input = {}) {
  const details = normalizeGuestInvitationInput(input);

  return {
    fullName: details.guestName,
    email: details.email,
    designation: details.designation,
    organization: details.organization,
    deskLabel: sanitizeGuestText(input.deskLabel, {
      fieldName: 'Desk',
      maxLength: 80,
    }),
  };
}

function normalizeSpotRow(row = {}) {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    designation: row.designation || '',
    organization: row.organization || '',
    eventDay: row.event_day,
    deskLabel: row.desk_label || '',
    checkedInAt: row.checked_in_at,
    emailStatus: row.email_status,
    providerMessageId: row.provider_message_id || null,
    lastEmailError: row.last_email_error || null,
    createdByEmail: row.created_by_email || null,
  };
}

function returningSpotEmailStatus(earlier) {
  return ['sent', 'not_required'].includes(earlier?.email_status)
    ? 'not_required'
    : 'needs_review';
}

module.exports = {
  eventDayNow,
  normalizeSpotInput,
  normalizeSpotRow,
  returningSpotEmailStatus,
};
