const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_JOB_CHUNK_SIZE,
  MAX_JOB_RETRIES,
  assertQueueInfrastructureAvailable,
  buildJobSelection,
  deriveJobProgress,
  isQueueInfrastructureUnavailable,
  shouldSkipJobItem,
} = require('../src/lib/registration-job-utils.cjs');

test('buildJobSelection defaults to confirmed status and no resend', () => {
  const selection = buildJobSelection({
    filters: {
      search: 'asha',
      category: 'NGO',
    },
  });

  assert.deepEqual(selection, {
    filters: {
      search: 'asha',
      status: 'confirmed',
      category: 'NGO',
      priorityTier: '',
      country: '',
      organization: '',
      speakerFlag: '',
      lateConfirmation: '',
    },
    selectionMode: 'filtered',
    registrationIds: [],
    resendExisting: false,
  });
});

test('buildJobSelection preserves explicit ids and resend mode', () => {
  const selection = buildJobSelection({
    registrationIds: ['r1', '', 'r2', 'r1'],
    resendExisting: true,
    filters: {
      status: 'all',
    },
  });

  assert.deepEqual(selection, {
    filters: {
      search: '',
      status: 'confirmed',
      category: '',
      priorityTier: '',
      country: '',
      organization: '',
      speakerFlag: '',
      lateConfirmation: '',
    },
    selectionMode: 'selected',
    registrationIds: ['r1', 'r2'],
    resendExisting: true,
  });
});

test('deriveJobProgress summarizes job item states for operator dashboards', () => {
  const progress = deriveJobProgress({
    status: 'processing',
    totals: {
      total: 10,
      queued: 4,
      processing: 1,
      sent: 3,
      failed: 1,
      retrying: 1,
    },
  });

  assert.equal(progress.total, 10);
  assert.equal(progress.completed, 5);
  assert.equal(progress.remaining, 5);
  assert.equal(progress.percentComplete, 50);
  assert.equal(progress.tone, 'warning');
});

test('shouldSkipJobItem skips existing pass emails unless resend mode is enabled', () => {
  assert.equal(
    shouldSkipJobItem({
      resendExisting: false,
      registration: {
        qr_pass_issued_at: '2026-03-29T00:00:00.000Z',
      },
    }),
    true
  );

  assert.equal(
    shouldSkipJobItem({
      resendExisting: true,
      registration: {
        qr_pass_issued_at: '2026-03-29T00:00:00.000Z',
      },
    }),
    false
  );
});

test('exports stable queue defaults for worker chunking and retries', () => {
  assert.equal(DEFAULT_JOB_CHUNK_SIZE > 0, true);
  assert.equal(MAX_JOB_RETRIES >= 2, true);
});

test('recognizes schema-cache queue table errors', () => {
  assert.equal(
    isQueueInfrastructureUnavailable(
      "Could not find the table 'public.pass_issue_email_jobs' in the schema cache"
    ),
    true
  );
  assert.equal(
    isQueueInfrastructureUnavailable(
      'relation "registration_email_job_items" does not exist'
    ),
    true
  );
  assert.equal(isQueueInfrastructureUnavailable('Network error'), false);
});

test('assertQueueInfrastructureAvailable throws a clear operator-facing error for unavailable queues', () => {
  assert.throws(
    () =>
      assertQueueInfrastructureAvailable(
        new Error('relation "pass_issue_email_jobs" does not exist'),
        'QR bulk delivery queue is unavailable.'
      ),
    /QR bulk delivery queue is unavailable/i
  );
});
