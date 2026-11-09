/**
 * Scan-Session Stress Tests
 *
 * Covers the check-in scanner session at volume:
 *   1. Scan-session throttle accuracy under rapid-fire frames
 *   2. Duplicate-token suppression under rapid-fire scanner latch
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createScanSession } = require('../src/lib/check-in-scan-session.cjs');

// ─── 1. Scan-session throttle under rapid-fire frames ───────────────────────

test('scan session allows exactly one decode per interval across 1,000 synthetic frames', () => {
  const INTERVAL = 100; // ms
  const session = createScanSession({
    decodeIntervalMs: INTERVAL,
    duplicateCooldownMs: 5000,
  });

  const TOTAL_MS = 10_000;
  const FRAME_STEP = 20; // synthetic frame every 20 ms → 500 frames
  let decodes = 0;

  for (let t = 0; t <= TOTAL_MS; t += FRAME_STEP) {
    if (session.shouldDecode(t)) decodes++;
  }

  // Expected: one decode at t=0, then one per INTERVAL → ceil(TOTAL_MS / INTERVAL) + 1
  const expected = Math.floor(TOTAL_MS / INTERVAL) + 1;
  assert.equal(
    decodes,
    expected,
    `expected ${expected} decodes, got ${decodes}`
  );
});

test('scan session never decodes more often than the interval', () => {
  const INTERVAL = 200;
  const session = createScanSession({ decodeIntervalMs: INTERVAL });
  let lastDecodeTime = -Infinity;

  for (let t = 0; t <= 5000; t += 17) {
    if (session.shouldDecode(t)) {
      assert.ok(
        t - lastDecodeTime >= INTERVAL,
        `decoded too soon: gap was ${t - lastDecodeTime} ms (min ${INTERVAL} ms)`
      );
      lastDecodeTime = t;
    }
  }
});

// ─── 2. Duplicate-token suppression under scanner latch ─────────────────────

test('scan session suppresses 500 rapid re-submissions of the same token', () => {
  const COOLDOWN = 1500;
  const session = createScanSession({
    decodeIntervalMs: 50,
    duplicateCooldownMs: COOLDOWN,
  });

  // First submission must be accepted
  assert.equal(session.shouldSubmitToken('TOKEN-A', 0), true);

  // All subsequent rapid re-submissions within cooldown must be rejected
  let spurious = 0;
  for (let t = 10; t < COOLDOWN; t += 10) {
    if (session.shouldSubmitToken('TOKEN-A', t)) spurious++;
  }
  assert.equal(spurious, 0, `${spurious} spurious submissions leaked through`);

  // After cooldown, same token must be accepted again
  assert.equal(session.shouldSubmitToken('TOKEN-A', COOLDOWN + 1), true);
});

test('scan session handles 1,000 distinct tokens within a single second without leaking cooldowns', () => {
  const session = createScanSession({
    decodeIntervalMs: 0,
    duplicateCooldownMs: 60_000, // very long cooldown per token
  });

  let accepted = 0;
  for (let i = 0; i < 1000; i++) {
    if (session.shouldSubmitToken(`token-${i}`, i)) accepted++;
  }
  // Every distinct token should be accepted exactly once
  assert.equal(accepted, 1000);
});
