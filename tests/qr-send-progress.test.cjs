const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  describeQrSend,
  summarizeQrSendJob,
} = require('../src/lib/qr-send-progress.cjs');

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('progress counts sent, skipped and failed as done, and the rest as pending', () => {
  const summary = summarizeQrSendJob({
    total_items: 50,
    queued_items: 30,
    processing_items: 1,
    sent_items: 15,
    skipped_items: 2,
    failed_items: 1,
    retrying_items: 1,
  });
  assert.deepEqual(summary, {
    total: 50,
    sent: 15,
    skipped: 2,
    failed: 1,
    retrying: 1,
    done: 18,
    pending: 32,
    percent: 36,
  });
});

test('the card counts up while sending and reports the outcome at the end', () => {
  const running = describeQrSend(
    summarizeQrSendJob({ total_items: 50, sent_items: 12, queued_items: 38 })
  );
  assert.equal(running.title, 'Sending QR passes… 12 of 50');
  assert.equal(running.detail, '12 sent');
  assert.equal(running.tone, 'info');

  const clean = describeQrSend(
    summarizeQrSendJob({ total_items: 50, sent_items: 48, skipped_items: 2 }),
    { running: false }
  );
  assert.equal(clean.title, '48 QR passes accepted for delivery');
  assert.equal(clean.detail, '48 sent · 2 skipped (already had a pass)');
  assert.equal(clean.tone, 'success');

  const single = describeQrSend(
    summarizeQrSendJob({ total_items: 1, sent_items: 1 }),
    { running: false }
  );
  assert.equal(single.title, '1 QR pass accepted for delivery');

  const withFailure = describeQrSend(
    summarizeQrSendJob({ total_items: 3, sent_items: 2, failed_items: 1 }),
    { running: false }
  );
  assert.equal(withFailure.tone, 'warning');
  assert.equal(withFailure.detail, '2 sent · 1 failed');

  const leftOver = describeQrSend(
    summarizeQrSendJob({ total_items: 10, sent_items: 6, queued_items: 4 }),
    { running: false }
  );
  assert.equal(
    leftOver.title,
    '6 of 10 done. The rest will finish in the background'
  );
});

test('the Registrations page sends one pass per request and shows live progress', () => {
  const card = readSource('src/components/admin/qr-send-progress.jsx');
  assert.match(card, /const SEND_CHUNK_SIZE = 1;/);
  assert.match(card, /\/api\/admin\/passes\/jobs\/process/);
  assert.match(card, /jobId: job\.id, chunkSize: SEND_CHUNK_SIZE/);

  const panel = readSource(
    'src/components/admin/registrations-admin-panel.jsx'
  );
  assert.match(panel, /void qrSend\.start\(data\.job\)/);
  assert.match(panel, /<QrSendProgressCard/);
  assert.match(panel, /Boolean\(qrSend\.run\?\.running\)/);
});
