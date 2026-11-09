// Outgoing email history (from Resend): status groups, counts, search and
// paging. Resend's list API cannot filter by status, so the server keeps the
// whole history and these helpers slice it.

const STATUS_GROUPS = [
  {
    key: 'delivered',
    label: 'Delivered',
    events: ['delivered', 'opened', 'clicked'],
  },
  {
    key: 'pending',
    label: 'Not delivered yet',
    events: ['sent', 'queued', 'scheduled', 'delivery_delayed'],
  },
  { key: 'bounced', label: 'Bounced', events: ['bounced'] },
  { key: 'suppressed', label: 'Suppressed', events: ['suppressed'] },
  { key: 'complained', label: 'Marked as spam', events: ['complained'] },
  { key: 'failed', label: 'Failed', events: ['failed', 'canceled'] },
];

const PROBLEM_GROUPS = new Set([
  'bounced',
  'suppressed',
  'complained',
  'failed',
]);

function statusGroup(lastEvent) {
  const event = String(lastEvent || '').toLowerCase();
  const group = STATUS_GROUPS.find((entry) => entry.events.includes(event));
  return group ? group.key : 'pending';
}

function eventLabel(lastEvent) {
  const event = String(lastEvent || 'unknown').toLowerCase();
  const labels = {
    delivery_delayed: 'Delayed',
    complained: 'Marked as spam',
  };
  if (labels[event]) return labels[event];
  return event.charAt(0).toUpperCase() + event.slice(1).replaceAll('_', ' ');
}

function eventTone(lastEvent) {
  const group = statusGroup(lastEvent);
  if (group === 'delivered') return 'success';
  if (PROBLEM_GROUPS.has(group)) return 'danger';
  return 'warning';
}

function countByStatus(emails = []) {
  const counts = { all: emails.length, problems: 0 };
  for (const group of STATUS_GROUPS) counts[group.key] = 0;
  for (const email of emails) {
    const group = statusGroup(email.lastEvent);
    counts[group] += 1;
    if (PROBLEM_GROUPS.has(group)) counts.problems += 1;
  }
  return counts;
}

function matchesSearch(email, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [...(email.to || []), email.subject || '']
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function filterEmails(emails = [], { status = 'all', query = '' } = {}) {
  const search = String(query || '').trim();
  return emails.filter((email) => {
    const group = statusGroup(email.lastEvent);
    const statusOk =
      status === 'all' ||
      (status === 'problems' ? PROBLEM_GROUPS.has(group) : group === status);
    return statusOk && matchesSearch(email, search);
  });
}

// Merges a freshly fetched batch (newest emails) into the cached history:
// updates the status of emails already known, and adds new ones on top.
function mergeNewest(cached = [], fresh = []) {
  const freshById = new Map(fresh.map((email) => [email.id, email]));
  const kept = cached.filter((email) => !freshById.has(email.id));
  return [...fresh, ...kept].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

module.exports = {
  PROBLEM_GROUPS,
  STATUS_GROUPS,
  countByStatus,
  eventLabel,
  eventTone,
  filterEmails,
  mergeNewest,
  statusGroup,
};
