const { findUnknownPlaceholders } = require('./reminder-email.cjs');

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Uploads go through a route, so each file stays under the hosting
// request-body limit; the total keeps every email well inside Resend's.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

const ATTACHMENT_TYPES = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const RECIPIENT_STATES = new Set(['not_sent', 'sending', 'sent', 'failed']);

function normalizeLine(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(CONTROL_CHARS_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBody(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_REGEX, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function requireLength(value, { fieldName, max }) {
  if (!value) throw new Error(`${fieldName} is required.`);
  if (value.length > max) {
    throw new Error(`${fieldName} must be ${max} characters or fewer.`);
  }
  return value;
}

function rejectUnknownPlaceholders(text, fieldName) {
  const unknown = findUnknownPlaceholders(text);
  if (unknown.length) {
    throw new Error(
      `${fieldName} uses an unknown placeholder: ${unknown
        .map((key) => `{{${key}}}`)
        .join(', ')}.`
    );
  }
}

function normalizeCampaignInput(input = {}) {
  const name = requireLength(normalizeLine(input.name), {
    fieldName: 'Reminder name',
    max: 120,
  });
  const subject = requireLength(normalizeLine(input.subject), {
    fieldName: 'Subject',
    max: 200,
  });
  const body = requireLength(normalizeBody(input.body), {
    fieldName: 'Email copy',
    max: 10000,
  });
  rejectUnknownPlaceholders(subject, 'Subject');
  rejectUnknownPlaceholders(body, 'Email copy');
  return { name, subject, body };
}

function isValidEmail(email) {
  const value = String(email || '');
  return value.length <= 320 && BASIC_EMAIL_REGEX.test(value);
}

// Keeps the name people see in their mail app, minus paths and characters
// that break headers, with the extension matching the detected type.
function sanitizeAttachmentFilename(filename, contentType) {
  const extension = ATTACHMENT_TYPES[contentType];
  const base = normalizeLine(
    String(filename || '')
      .split(/[\\/]/)
      .pop()
  )
    .replace(/["<>:|?*;]/g, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .slice(0, 120)
    .trim();
  return `${base || 'attachment'}.${extension}`;
}

function normalizeCampaignRow(row = {}) {
  return {
    id: row.id,
    name: row.name || '',
    subject: row.subject || '',
    body: row.body || '',
    contentVersion: Number(row.content_version || 1),
    createdByEmail: row.created_by_email || null,
    updatedByEmail: row.updated_by_email || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeAttachmentRow(row = {}) {
  return {
    id: row.id,
    filename: row.filename || '',
    contentType: row.content_type || '',
    sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256 || null,
    createdAt: row.created_at || null,
  };
}

// One status per registrant for this reminder, from their deliveries
// (newest first). An open attempt wins; then any accepted send.
function deriveRecipientState(deliveries = []) {
  const active = deliveries.find((row) => row.delivery_status === 'sending');
  const accepted = deliveries.filter(
    (row) => row.delivery_status === 'accepted'
  );
  const latest = deliveries[0] || null;
  let state = 'not_sent';
  if (active) state = 'sending';
  else if (accepted.length) state = 'sent';
  else if (latest?.delivery_status === 'failed') state = 'failed';

  return {
    state,
    sendCount: accepted.length,
    lastSentAt: accepted[0]?.created_at || null,
    lastSentVersion: accepted[0] ? Number(accepted[0].content_version) : null,
    lastError:
      latest?.delivery_status === 'failed'
        ? latest.failure_reason || 'Email was not sent.'
        : null,
    activeAttempt: active
      ? {
          id: active.id,
          created_at: active.created_at,
          delivery_status: active.delivery_status,
          request_sha256: active.request_sha256 || null,
        }
      : null,
  };
}

function buildRecipientRows({ registrations = [], deliveries = [] }) {
  const byRegistration = new Map();
  for (const delivery of deliveries) {
    if (!delivery.registration_id) continue;
    const list = byRegistration.get(delivery.registration_id) || [];
    list.push(delivery);
    byRegistration.set(delivery.registration_id, list);
  }
  return registrations.map((registration) => {
    const history = (byRegistration.get(registration.id) || []).sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    );
    return {
      id: registration.id,
      firstName: registration.first_name || '',
      lastName: registration.last_name || '',
      email: registration.email || '',
      organization: registration.organization || '',
      category: registration.attendee_category || '',
      ...deriveRecipientState(history),
    };
  });
}

function summarizeRecipients(rows = []) {
  const summary = { total: rows.length, sent: 0, notSent: 0, attention: 0 };
  for (const row of rows) {
    if (row.state === 'sent') summary.sent += 1;
    else if (row.state === 'not_sent') summary.notSent += 1;
    else summary.attention += 1;
  }
  return summary;
}

// Resend error codes that mean the email was certainly not sent, so the
// attempt can close as failed and be sent again. Server and idempotency
// errors are left out: after those, the outcome is unknown.
const DEFINITE_PROVIDER_REJECTIONS = new Set([
  'validation_error',
  'missing_required_field',
  'invalid_parameter',
  'invalid_attachment',
  'invalid_from_address',
  'invalid_access',
  'missing_api_key',
  'invalid_api_key',
  'restricted_api_key',
  'security_error',
  'rate_limit_exceeded',
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
]);

function isDefiniteProviderRejection(error) {
  return DEFINITE_PROVIDER_REJECTIONS.has(error?.providerErrorName);
}

// Bulk send covers everyone who has not had this reminder, including
// earlier failures. Open attempts are left for a safe retry.
function isBulkSendable(row) {
  return row.state === 'not_sent' || row.state === 'failed';
}

function reminderErrorStatus(message) {
  const text = String(message || '');
  if (/not found/i.test(text)) return 404;
  if (/Resend is not configured/i.test(text)) return 503;
  if (
    /required|valid|characters|at most|unknown placeholder|must be|too large|only PDF|first\./i.test(
      text
    )
  ) {
    return 400;
  }
  if (
    /already|cannot|changed|locked|uncertain|unresolved|no longer/i.test(text)
  ) {
    return 409;
  }
  return 500;
}

module.exports = {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  RECIPIENT_STATES,
  buildRecipientRows,
  deriveRecipientState,
  isBulkSendable,
  isDefiniteProviderRejection,
  isValidEmail,
  normalizeAttachmentRow,
  normalizeCampaignInput,
  normalizeCampaignRow,
  reminderErrorStatus,
  sanitizeAttachmentFilename,
  summarizeRecipients,
};
