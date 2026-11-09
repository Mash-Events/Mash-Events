// Display helpers for the admin email job pages (QR Pass Emails and the
// registration email queue): what a job's row says, its colour, and how the
// recipient list is filtered.

function count(value) {
  return Number(value || 0);
}

function jobCounts(job = {}) {
  const total = count(job.total_items);
  const sent = count(job.sent_items);
  const skipped = count(job.skipped_items);
  const failed = count(job.failed_items);
  const waiting =
    count(job.queued_items) +
    count(job.processing_items) +
    count(job.retrying_items);
  const done = Math.min(sent + skipped + failed, total);
  return {
    total,
    sent,
    skipped,
    failed,
    waiting,
    done,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

// "48 sent · 1 skipped · 1 failed · 2 waiting", leaving out zero counts
// other than sent.
function jobResultText(job) {
  const counts = jobCounts(job);
  const parts = [`${counts.sent} sent`];
  if (counts.skipped) parts.push(`${counts.skipped} skipped`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (counts.waiting) parts.push(`${counts.waiting} waiting`);
  return parts.join(' · ');
}

function jobTone(job = {}) {
  const counts = jobCounts(job);
  if (counts.waiting > 0 || job.status === 'processing') return 'warning';
  if (counts.failed > 0 || job.status === 'failed') return 'danger';
  if (job.status === 'completed') return 'success';
  return 'default';
}

const STATUS_LABELS = {
  queued: 'Queued',
  processing: 'Sending',
  completed: 'Done',
  failed: 'Has failures',
};

function jobStatusLabel(job = {}) {
  if (job.status === 'failed') return STATUS_LABELS.failed;
  return STATUS_LABELS[job.status] || job.status || 'Unknown';
}

function itemTone(status) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'skipped') return 'default';
  return 'warning';
}

const ITEM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'failed', label: 'Failed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'waiting', label: 'Waiting' },
];

function itemMatchesFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'waiting') {
    return ['queued', 'processing', 'retrying'].includes(item.status);
  }
  return item.status === filter;
}

// Filter chips that have at least one recipient, with counts. "All" is
// always present.
function itemFilterOptions(items = []) {
  return ITEM_FILTERS.map((option) => ({
    ...option,
    count: items.filter((item) => itemMatchesFilter(item, option.key)).length,
  })).filter((option) => option.key === 'all' || option.count > 0);
}

const IST = 'Asia/Kolkata';

function istDayKey(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dayLabel(key, now = Date.now()) {
  const today = istDayKey(now);
  const yesterday = istDayKey(now - 24 * 60 * 60 * 1000);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  if (!key) return 'Unknown date';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${key}T12:00:00+05:30`));
}

// Groups jobs (newest first) by the IST day they started, with a per-day
// count of sends and passes sent.
function groupJobsByDay(jobs = [], now = Date.now()) {
  const groups = [];
  for (const job of jobs) {
    const key = istDayKey(job.created_at);
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      group = { key, label: dayLabel(key, now), jobs: [], sent: 0 };
      groups.push(group);
    }
    group.jobs.push(job);
    group.sent += count(job.sent_items);
  }
  return groups;
}

function sentOnDay(jobs = [], now = Date.now()) {
  const today = istDayKey(now);
  return jobs
    .filter((job) => istDayKey(job.created_at) === today)
    .reduce((sum, job) => sum + count(job.sent_items), 0);
}

// How long a finished send took, e.g. "1m 22s". Blank while it runs.
function jobDuration(job = {}) {
  if (!job.completed_at || !job.created_at) return '';
  const seconds = Math.max(
    0,
    Math.round(
      (Date.parse(job.completed_at) - Date.parse(job.created_at)) / 1000
    )
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function coverageSummary(coverage) {
  if (!coverage || !coverage.confirmed) return null;
  const issued = Math.min(count(coverage.issued), count(coverage.confirmed));
  const confirmed = count(coverage.confirmed);
  return {
    issued,
    confirmed,
    remaining: confirmed - issued,
    percent: Math.round((issued / confirmed) * 100),
  };
}

// Summary strip numbers across every job, not just the page on screen.
function summarizeJobs(jobs = [], now = Date.now()) {
  return jobs.reduce(
    (summary, job) => ({
      queued:
        summary.queued + count(job.queued_items) + count(job.retrying_items),
      processing: summary.processing + count(job.processing_items),
      failed: summary.failed + count(job.failed_items),
      sent: summary.sent,
    }),
    { queued: 0, processing: 0, failed: 0, sent: sentOnDay(jobs, now) }
  );
}

module.exports = {
  summarizeJobs,
  coverageSummary,
  groupJobsByDay,
  jobDuration,
  sentOnDay,
  itemFilterOptions,
  itemMatchesFilter,
  itemTone,
  jobCounts,
  jobResultText,
  jobStatusLabel,
  jobTone,
};
