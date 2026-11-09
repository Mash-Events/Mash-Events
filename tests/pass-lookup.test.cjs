const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PASS_LOOKUP_COOLDOWN_MS,
  PASS_LOOKUP_OPERATOR,
  canQueuePassLookup,
  isPassLookupDrainActive,
  isPassLookupOpen,
} = require('../src/lib/pass-lookup-window.cjs');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const ist = (value) => new Date(`${value}+05:30`);

test('find my pass is only open from 9 Oct 00:00 to 15 Oct 23:59 IST', () => {
  assert.equal(isPassLookupOpen(ist('2026-10-08T23:59:59')), false);
  assert.equal(isPassLookupOpen(ist('2026-10-09T00:00:00')), true);
  assert.equal(isPassLookupOpen(ist('2026-10-12T00:00:00')), true);
  assert.equal(isPassLookupOpen(ist('2026-10-14T09:00:00')), true);
  assert.equal(isPassLookupOpen(ist('2026-10-15T23:59:59')), true);
  assert.equal(isPassLookupOpen(ist('2026-10-16T00:00:00')), false);
  assert.equal(isPassLookupOpen(ist('2027-10-14T09:00:00')), false);
});

test('the pass lookup drain keeps running a few hours after close, then stops', () => {
  assert.equal(isPassLookupDrainActive(ist('2026-10-08T23:00:00')), false);
  assert.equal(isPassLookupDrainActive(ist('2026-10-09T00:00:00')), true);
  assert.equal(isPassLookupDrainActive(ist('2026-10-16T05:59:00')), true);
  assert.equal(isPassLookupDrainActive(ist('2026-10-16T06:00:00')), false);
  assert.equal(isPassLookupDrainActive(ist('2027-10-14T09:00:00')), false);
});

test('a registration gets at most one resend per cooldown and three per day', () => {
  const now = ist('2026-10-14T10:00:00');
  const minutesAgo = (minutes) =>
    new Date(now.getTime() - minutes * 60 * 1000).toISOString();

  assert.equal(canQueuePassLookup([], now), true);
  assert.equal(canQueuePassLookup([minutesAgo(5)], now), false);
  assert.equal(
    canQueuePassLookup(
      [new Date(now.getTime() - PASS_LOOKUP_COOLDOWN_MS).toISOString()],
      now
    ),
    true
  );
  assert.equal(
    canQueuePassLookup(
      [minutesAgo(300), minutesAgo(200), minutesAgo(100)],
      now
    ),
    false
  );
});

test('the service only resends an already issued pass, tagged as public', () => {
  const source = read('src/lib/pass-lookup-service.js');
  const passCheck = source.indexOf('getIssuedEntryPass(');
  const createJob = source.indexOf('createPassIssueEmailJob({');

  assert.ok(passCheck > -1 && passCheck < createJob);
  assert.match(source, /resendExisting: true/);
  assert.match(source, /operator: PASS_LOOKUP_OPERATOR/);
  assert.equal(PASS_LOOKUP_OPERATOR.userId, 'public-pass-lookup');
});

test('an issued pass is recognised whether Supabase returns an object or an array', () => {
  const {
    getIssuedEntryPass,
  } = require('../src/lib/registration-pass-utils.cjs');

  assert.ok(getIssuedEntryPass({ id: 'p1', status: 'issued' }));
  assert.ok(getIssuedEntryPass([{ id: 'p1', status: 'issued' }]));
  assert.equal(getIssuedEntryPass({ id: 'p1', status: 'revoked' }), null);
  assert.equal(getIssuedEntryPass(null), null);
});
