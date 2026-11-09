import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IDLE_SECONDS,
  MAX_SESSION_AGE_SECONDS,
  checkIdle,
  firstFactorTime,
  isSessionTooOld,
  readSeen,
  signSeen,
} from '../core/auth/session-limits.ts';

// App-enforced session limits for the Free plan (docs/system-design.md §6.4).

const NOW = 1_800_000_000;
const SECRET = 'test-secret-not-real';

test('session age counts from the first factor, not the MFA step', () => {
  const amr = [
    { method: 'totp', timestamp: NOW - 60 },
    { method: 'password', timestamp: NOW - 3600 },
  ];
  assert.equal(firstFactorTime(amr), NOW - 3600);
  assert.equal(isSessionTooOld(amr, NOW), false);
  assert.equal(
    isSessionTooOld(
      [{ method: 'oauth', timestamp: NOW - MAX_SESSION_AGE_SECONDS - 1 }],
      NOW
    ),
    true
  );
});

test('missing amr falls back to iat; nothing at all counts as expired', () => {
  assert.equal(isSessionTooOld(undefined, NOW, NOW - 10), false);
  assert.equal(isSessionTooOld(undefined, NOW), true);
});

test('the activity cookie is bound to one session and tamper-proof', async () => {
  const cookie = await signSeen(SECRET, 'session-a', NOW);
  assert.equal(await readSeen(SECRET, 'session-a', cookie), NOW);
  assert.equal(await readSeen(SECRET, 'session-b', cookie), null);
  assert.equal(await readSeen('other-secret', 'session-a', cookie), null);
  const forged = cookie.replace(`.${NOW}.`, `.${NOW + 9999}.`);
  assert.equal(await readSeen(SECRET, 'session-a', forged), null);
  assert.equal(await readSeen(SECRET, 'session-a', undefined), null);
});

test('idle sessions expire after two hours; activity refreshes at most once a minute', () => {
  assert.deepEqual(checkIdle(null, NOW), { status: 'ok', refresh: true });
  assert.deepEqual(checkIdle(NOW - 30, NOW), { status: 'ok', refresh: false });
  assert.deepEqual(checkIdle(NOW - 90, NOW), { status: 'ok', refresh: true });
  assert.deepEqual(checkIdle(NOW - MAX_IDLE_SECONDS - 1, NOW), {
    status: 'expired',
  });
});
