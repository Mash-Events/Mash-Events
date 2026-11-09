const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  itemFilterOptions,
  itemMatchesFilter,
  itemTone,
  jobCounts,
  jobResultText,
  jobStatusLabel,
  jobTone,
} = require('../src/lib/admin-job-view.cjs');

test('job rows summarise progress in plain words, leaving out zero counts', () => {
  const running = {
    status: 'processing',
    total_items: 50,
    sent_items: 31,
    queued_items: 17,
    processing_items: 1,
    retrying_items: 1,
  };
  assert.equal(jobResultText(running), '31 sent · 19 waiting');
  assert.deepEqual(jobCounts(running), {
    total: 50,
    sent: 31,
    skipped: 0,
    failed: 0,
    waiting: 19,
    done: 31,
    percent: 62,
  });
  assert.equal(jobTone(running), 'warning');
  assert.equal(jobStatusLabel(running), 'Sending');

  const withFailure = {
    status: 'failed',
    total_items: 50,
    sent_items: 48,
    skipped_items: 1,
    failed_items: 1,
  };
  assert.equal(jobResultText(withFailure), '48 sent · 1 skipped · 1 failed');
  assert.equal(jobCounts(withFailure).percent, 100);
  assert.equal(jobTone(withFailure), 'danger');
  assert.equal(jobStatusLabel(withFailure), 'Has failures');

  const done = { status: 'completed', total_items: 1, sent_items: 1 };
  assert.equal(jobResultText(done), '1 sent');
  assert.equal(jobTone(done), 'success');
  assert.equal(jobStatusLabel(done), 'Done');
});

test('recipient filters only offer statuses that exist, with counts', () => {
  const items = [
    { status: 'sent' },
    { status: 'sent' },
    { status: 'failed' },
    { status: 'retrying' },
  ];
  assert.deepEqual(
    itemFilterOptions(items).map((option) => [option.key, option.count]),
    [
      ['all', 4],
      ['sent', 2],
      ['failed', 1],
      ['waiting', 1],
    ]
  );
  assert.ok(itemMatchesFilter({ status: 'queued' }, 'waiting'));
  assert.ok(!itemMatchesFilter({ status: 'sent' }, 'failed'));
  assert.equal(itemTone('sent'), 'success');
  assert.equal(itemTone('failed'), 'danger');
  assert.equal(itemTone('retrying'), 'warning');
});

test('sends are one aligned table; a send opens in place to show its recipients', () => {
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'src/components/admin/job-manager-panel.jsx'),
    'utf8'
  );
  assert.ok(!panel.includes('xl:grid-cols-[minmax(0,1fr)_400px]'));
  assert.ok(panel.includes('aria-expanded={open}'));
  assert.ok(
    panel.includes(
      "selectedJobId: current.selectedJobId === jobId ? '' : jobId"
    )
  );
  assert.ok(panel.includes('max-h-[360px] overflow-y-auto'));
  // Header and rows share one grid, so the columns line up.
  assert.ok(panel.split('${JOB_GRID}').length >= 3);
  assert.ok(!panel.includes('Attempts: {item.attempt_count}'));
});

test('sends are grouped by IST day, with time taken and coverage', () => {
  const {
    coverageSummary,
    groupJobsByDay,
    jobDuration,
    sentOnDay,
  } = require('../src/lib/admin-job-view.cjs');
  const now = Date.parse('2026-10-03T18:40:00+05:30');
  const jobs = [
    { id: 'a', created_at: '2026-10-03T17:48:00+05:30', sent_items: 50 },
    { id: 'b', created_at: '2026-10-03T00:10:00+05:30', sent_items: 1 },
    { id: 'c', created_at: '2026-10-02T23:50:00+05:30', sent_items: 1 },
    { id: 'd', created_at: '2026-09-24T11:39:00+05:30', sent_items: 1 },
  ];
  const groups = groupJobsByDay(jobs, now);
  assert.deepEqual(
    groups.map((group) => [group.label, group.jobs.length, group.sent]),
    [
      ['Today', 2, 51],
      ['Yesterday', 1, 1],
      ['24 Sept 2026', 1, 1],
    ]
  );
  assert.equal(sentOnDay(jobs, now), 51);

  assert.equal(
    jobDuration({
      created_at: '2026-10-03T17:48:00Z',
      completed_at: '2026-10-03T17:49:22Z',
    }),
    '1m 22s'
  );
  assert.equal(
    jobDuration({
      created_at: '2026-10-03T17:48:00Z',
      completed_at: '2026-10-03T17:48:03Z',
    }),
    '3s'
  );
  assert.equal(jobDuration({ created_at: '2026-10-03T17:48:00Z' }), '');

  assert.deepEqual(coverageSummary({ confirmed: 316, issued: 252 }), {
    issued: 252,
    confirmed: 316,
    remaining: 64,
    percent: 80,
  });
  assert.equal(coverageSummary(null), null);
  assert.equal(coverageSummary({ confirmed: 0, issued: 0 }), null);
});
