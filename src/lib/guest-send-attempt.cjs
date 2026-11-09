const { createHash } = require('node:crypto');

const RETRY_AFTER_MS = 10 * 60 * 1000;
const RETRY_BEFORE_MS = 23 * 60 * 60 * 1000;

function guestSendIdempotencyKey(attemptId) {
  return `guest-invitation/${attemptId}`;
}

function hashGuestEmailRequest({
  from,
  to,
  subject,
  text,
  html,
  replyTo,
  attachments,
}) {
  const canonical = {
    from,
    to,
    subject,
    text,
    html,
    replyTo,
    attachments: (attachments || []).map(
      ({ filename, contentId, content }) => ({
        filename,
        contentId: contentId || null,
        contentSha256: createHash('sha256').update(content).digest('hex'),
      })
    ),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function canRetryGuestSend(attempt, now = Date.now()) {
  const started = Date.parse(attempt?.created_at || attempt?.createdAt || '');
  const age = now - started;
  return (
    attempt?.delivery_status === 'sending' &&
    Boolean(attempt?.request_sha256) &&
    Number.isFinite(started) &&
    age >= RETRY_AFTER_MS &&
    age < RETRY_BEFORE_MS
  );
}

module.exports = {
  RETRY_AFTER_MS,
  RETRY_BEFORE_MS,
  guestSendIdempotencyKey,
  hashGuestEmailRequest,
  canRetryGuestSend,
};
