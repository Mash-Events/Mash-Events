const DEFAULT_JOB_CHUNK_SIZE = 20;
const MAX_JOB_RETRIES = 3;

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeFilters(filters = {}) {
  return {
    search: normalizeString(filters.search),
    status: 'confirmed',
    category: normalizeString(filters.category),
    priorityTier: normalizeString(filters.priorityTier),
    country: normalizeString(filters.country),
    organization: normalizeString(filters.organization),
    speakerFlag: normalizeString(filters.speakerFlag),
    lateConfirmation: normalizeString(filters.lateConfirmation),
  };
}

function uniqueValues(values = []) {
  return [...new Set(values.map(normalizeString).filter(Boolean))];
}

function buildJobSelection({
  filters = {},
  registrationIds = [],
  resendExisting = false,
} = {}) {
  const normalizedIds = uniqueValues(registrationIds);

  return {
    filters: normalizeFilters(filters),
    selectionMode: normalizedIds.length ? 'selected' : 'filtered',
    registrationIds: normalizedIds,
    resendExisting: Boolean(resendExisting),
  };
}

function shouldSkipJobItem({ resendExisting = false, registration } = {}) {
  return !resendExisting && Boolean(registration?.qr_pass_issued_at);
}

function deriveJobProgress({ status = 'queued', totals = {} } = {}) {
  const total = Number(totals.total || 0);
  const queued = Number(totals.queued || 0);
  const processing = Number(totals.processing || 0);
  const sent = Number(totals.sent || 0);
  const failed = Number(totals.failed || 0);
  const retrying = Number(totals.retrying || 0);
  const completed = sent + failed + retrying;
  const remaining = Math.max(total - completed, 0);
  const percentComplete = total ? Math.round((completed / total) * 100) : 0;

  let tone = 'default';
  if (queued > 0 || processing > 0 || retrying > 0) {
    tone = 'warning';
  } else if (status === 'failed' || failed > 0) {
    tone = 'danger';
  } else if (status === 'completed' || (total > 0 && sent === total)) {
    tone = 'success';
  }

  return {
    total,
    queued,
    processing,
    sent,
    failed,
    retrying,
    completed,
    remaining,
    percentComplete,
    tone,
  };
}

function isQueueInfrastructureUnavailable(errorOrMessage) {
  const message =
    errorOrMessage instanceof Error
      ? errorOrMessage.message
      : String(errorOrMessage || '');

  return (
    message.includes('pass_issue_email_jobs') ||
    message.includes('pass_issue_email_job_items') ||
    message.includes('registration_email_jobs') ||
    message.includes('registration_email_job_items') ||
    message.includes('schema cache')
  );
}

function assertQueueInfrastructureAvailable(
  errorOrMessage,
  message = 'Queue infrastructure is unavailable.'
) {
  if (isQueueInfrastructureUnavailable(errorOrMessage)) {
    throw new Error(message);
  }

  throw errorOrMessage instanceof Error
    ? errorOrMessage
    : new Error(String(errorOrMessage || message));
}

// An item stays "processing" only while a request is sending it (seconds).
// If a request is cut off mid-chunk, nothing else moves the item on, so it
// would be stuck for good. After this long it is treated as interrupted.
const STALE_PROCESSING_MS = 10 * 60 * 1000;

// Splits items left "processing" by an interrupted request into those to
// send again and those already out of attempts.
function planStaleJobItemRecovery(items = [], now = Date.now()) {
  const retry = [];
  const fail = [];

  for (const item of items) {
    if (item.status !== 'processing' || !item.last_attempt_at) continue;
    const lastAttempt = Date.parse(item.last_attempt_at);
    if (!Number.isFinite(lastAttempt)) continue;
    if (now - lastAttempt < STALE_PROCESSING_MS) continue;

    const attempts = Number(item.attempt_count || 0);
    const maxAttempts = Number(item.max_attempts || MAX_JOB_RETRIES);
    (attempts < maxAttempts ? retry : fail).push(item);
  }

  return { retry, fail };
}

module.exports = {
  DEFAULT_JOB_CHUNK_SIZE,
  MAX_JOB_RETRIES,
  STALE_PROCESSING_MS,
  planStaleJobItemRecovery,
  assertQueueInfrastructureAvailable,
  buildJobSelection,
  deriveJobProgress,
  isQueueInfrastructureUnavailable,
  shouldSkipJobItem,
};
