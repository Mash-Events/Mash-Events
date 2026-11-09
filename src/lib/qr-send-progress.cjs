// Live progress for a QR pass send started from the Registrations page.
// Turns a pass_issue_email_jobs row into the counts and wording the
// progress card shows while the page works through the job.

function toCount(value) {
  return Number(value || 0);
}

function summarizeQrSendJob(job = {}) {
  const total = toCount(job.total_items);
  const sent = toCount(job.sent_items);
  const skipped = toCount(job.skipped_items);
  const failed = toCount(job.failed_items);
  const retrying = toCount(job.retrying_items);
  const waiting = toCount(job.queued_items) + toCount(job.processing_items);
  const done = Math.min(sent + skipped + failed, total);

  return {
    total,
    sent,
    skipped,
    failed,
    retrying,
    done,
    pending: waiting + retrying,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 'es'}`;
}

function describeQrSend(summary, { running = true } = {}) {
  const parts = [`${summary.sent} sent`];
  if (summary.skipped) {
    parts.push(`${summary.skipped} skipped (already had a pass)`);
  }
  if (summary.retrying) parts.push(`${summary.retrying} retrying`);
  if (summary.failed) parts.push(`${summary.failed} failed`);

  if (running) {
    return {
      tone: 'info',
      title: `Sending QR passes… ${summary.done} of ${summary.total}`,
      detail: parts.join(' · '),
    };
  }

  const finishedTitle = summary.pending
    ? `${summary.done} of ${summary.total} done. The rest will finish in the background`
    : `${plural(summary.sent, 'QR pass')} accepted for delivery`;

  return {
    tone: summary.failed || summary.pending ? 'warning' : 'success',
    title: finishedTitle,
    detail: parts.join(' · '),
  };
}

module.exports = {
  describeQrSend,
  summarizeQrSendJob,
};
