const REVIEW_EMAIL_TEMPLATES = new Set(['confirmed', 'waitlisted', 'rejected']);

function getReviewEmailTemplate(previousStatus, nextStatus) {
  if (previousStatus === nextStatus) return null;
  return REVIEW_EMAIL_TEMPLATES.has(nextStatus) ? nextStatus : null;
}

module.exports = { getReviewEmailTemplate };
