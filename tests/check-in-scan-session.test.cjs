const test = require('node:test');
const assert = require('node:assert/strict');

const { createScanSession } = require('../src/lib/check-in-scan-session.cjs');

test('scan session throttles expensive decode attempts', () => {
  const session = createScanSession({
    decodeIntervalMs: 200,
    duplicateCooldownMs: 1500,
  });

  assert.equal(session.shouldDecode(0), true);
  assert.equal(session.shouldDecode(100), false);
  assert.equal(session.shouldDecode(201), true);
});

test('scan session suppresses duplicate token submissions during cooldown', () => {
  const session = createScanSession({
    decodeIntervalMs: 200,
    duplicateCooldownMs: 1500,
  });

  assert.equal(session.shouldSubmitToken('abc', 500), true);
  assert.equal(session.shouldSubmitToken('abc', 1200), false);
  assert.equal(session.shouldSubmitToken('abc', 2101), true);
  assert.equal(session.shouldSubmitToken('xyz', 2200), true);
});

test('scan session can be reset after a completed scan cycle', () => {
  const session = createScanSession({
    decodeIntervalMs: 200,
    duplicateCooldownMs: 1500,
  });

  session.markSubmitting();
  assert.equal(session.isSubmitting(), true);
  session.resetSubmission();
  assert.equal(session.isSubmitting(), false);
});
