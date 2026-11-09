const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { isCheckInWindowOpen } = require('../src/lib/check-in-day-utils.cjs');

// India is UTC+5:30, so these instants are checked against IST dates.
test('check-in opens the day before the event and closes the day after', () => {
  assert.equal(isCheckInWindowOpen(new Date('2026-10-12T18:00:00Z')), false); // 12 Oct 23:30 IST
  assert.equal(isCheckInWindowOpen(new Date('2026-10-12T18:31:00Z')), true); // 13 Oct 00:01 IST
  assert.equal(isCheckInWindowOpen(new Date('2026-10-15T06:00:00Z')), true);
  assert.equal(isCheckInWindowOpen(new Date('2026-10-16T18:29:00Z')), true); // 16 Oct 23:59 IST
  assert.equal(isCheckInWindowOpen(new Date('2026-10-16T18:31:00Z')), false); // 17 Oct IST
  assert.equal(isCheckInWindowOpen(new Date('2026-10-20T10:00:00Z')), false);
});
