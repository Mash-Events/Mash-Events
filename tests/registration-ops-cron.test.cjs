const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('claiming QR pass items first recovers items stuck by an interrupted send', () => {
  const source = readSource('src/lib/registration-ops-db.js');
  const claimStart = source.indexOf(
    'export async function claimPassIssueEmailJobItems'
  );
  const claimBody = source.slice(claimStart, claimStart + 300);

  assert.match(claimBody, /await releaseStalePassIssueEmailJobItems\(jobId\)/);
  // Recovery only moves an item if it is still exactly as read.
  assert.match(
    source,
    /\.eq\('status', 'processing'\)\s*\.eq\('last_attempt_at', item\.last_attempt_at\)/
  );
});

test('stuck processing items are retried, or failed when out of attempts, only after 10 minutes', () => {
  const {
    STALE_PROCESSING_MS,
    planStaleJobItemRecovery,
  } = require('../src/lib/registration-job-utils.cjs');
  const now = Date.parse('2026-10-03T12:00:00Z');
  const minutesAgo = (minutes) =>
    new Date(now - minutes * 60 * 1000).toISOString();

  assert.equal(STALE_PROCESSING_MS, 10 * 60 * 1000);

  const { retry, fail } = planStaleJobItemRecovery(
    [
      {
        id: 'fresh',
        status: 'processing',
        attempt_count: 1,
        max_attempts: 3,
        last_attempt_at: minutesAgo(2),
      },
      {
        id: 'stuck',
        status: 'processing',
        attempt_count: 1,
        max_attempts: 3,
        last_attempt_at: minutesAgo(11),
      },
      {
        id: 'spent',
        status: 'processing',
        attempt_count: 3,
        max_attempts: 3,
        last_attempt_at: minutesAgo(30),
      },
      {
        id: 'sent',
        status: 'sent',
        attempt_count: 1,
        max_attempts: 3,
        last_attempt_at: minutesAgo(60),
      },
      {
        id: 'no-time',
        status: 'processing',
        attempt_count: 1,
        max_attempts: 3,
        last_attempt_at: null,
      },
    ],
    now
  );

  assert.deepEqual(
    retry.map((item) => item.id),
    ['stuck']
  );
  assert.deepEqual(
    fail.map((item) => item.id),
    ['spent']
  );
});
