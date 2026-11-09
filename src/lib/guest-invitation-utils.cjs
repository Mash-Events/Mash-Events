const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;
const MULTISPACE_REGEX = /\s+/g;
const HTML_DELIMITER_REGEX = /[<>]/g;
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GUEST_INVITATION_STATUSES = new Set([
  'draft',
  'sending',
  'sent',
  'failed',
  'withdrawn',
]);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(CONTROL_CHARS_REGEX, ' ')
    .trim();
}

function sanitizeGuestText(
  value,
  { fieldName, maxLength, required = false } = {}
) {
  const normalized = normalizeText(value)
    .replace(HTML_DELIMITER_REGEX, '')
    .replace(MULTISPACE_REGEX, ' ');

  if (required && !normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function sanitizeGuestEmail(value) {
  return normalizeText(value).toLowerCase().replace(MULTISPACE_REGEX, '');
}

function isValidGuestEmail(email) {
  if (!email || email.length > 320 || !BASIC_EMAIL_REGEX.test(email)) {
    return false;
  }

  const [localPart, domainPart] = email.split('@');
  return Boolean(
    localPart &&
    domainPart &&
    localPart.length <= 64 &&
    domainPart.length <= 255 &&
    !domainPart.startsWith('.') &&
    !domainPart.endsWith('.')
  );
}

function normalizeGuestInvitationInput(input = {}) {
  const guestName = sanitizeGuestText(input.name, {
    fieldName: 'Guest name',
    maxLength: 160,
    required: true,
  });
  const email = sanitizeGuestEmail(input.email);

  if (!isValidGuestEmail(email)) {
    throw new Error('A valid email address is required.');
  }

  const designation = sanitizeGuestText(input.designation, {
    fieldName: 'Designation',
    maxLength: 160,
  });
  const organization = sanitizeGuestText(input.organization, {
    fieldName: 'Organisation',
    maxLength: 160,
  });

  return {
    guestName,
    email,
    designation: designation || null,
    organization: organization || null,
  };
}

function normalizeGuestInvitationRow(row = {}) {
  return {
    id: row.id,
    name: row.guest_name || '',
    email: row.email || '',
    designation: row.designation || '',
    organization: row.organization || '',
    status: GUEST_INVITATION_STATUSES.has(row.status) ? row.status : 'draft',
    templateVersion: row.template_version || 'guest_invitation_v1',
    sendCount: Number(row.send_count || 0),
    firstSentAt: row.first_sent_at || null,
    lastSentAt: row.last_sent_at || null,
    lastProviderMessageId: row.last_provider_message_id || null,
    lastError: row.last_error || null,
    createdByEmail: row.created_by_email || null,
    lastSentByEmail: row.last_sent_by_email || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeGuestInvitationDelivery(row = {}) {
  return {
    id: row.id,
    status: row.delivery_status || 'failed',
    recipientEmail: row.recipient_email || '',
    providerMessageId: row.provider_message_id || null,
    failureReason: row.failure_reason || null,
    actorEmail: row.actor_email || null,
    createdAt: row.created_at || null,
  };
}

module.exports = {
  GUEST_INVITATION_STATUSES,
  normalizeGuestInvitationInput,
  normalizeGuestInvitationRow,
  normalizeGuestInvitationDelivery,
  sanitizeGuestText,
};
