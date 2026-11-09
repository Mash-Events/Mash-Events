const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCheckInDayNumber,
  getDefaultCheckInDay,
  getCheckInForDay,
  isCheckedInForDay,
  normalizeCheckInDay,
  normalizeCheckIns,
} = require('../src/lib/check-in-day-utils.cjs');

test('normalizes supported check-in day inputs', () => {
  assert.equal(normalizeCheckInDay('day_1'), 'day_1');
  assert.equal(normalizeCheckInDay('Day 2'), 'day_2');
  assert.equal(normalizeCheckInDay(1), 'day_1');
  assert.equal(normalizeCheckInDay(2), 'day_2');
  assert.equal(getCheckInDayNumber('day_2'), 2);
});

test('defaults to the matching event day in India time', () => {
  assert.equal(
    getDefaultCheckInDay(new Date('2026-10-14T04:00:00.000Z')),
    'day_1'
  );
  assert.equal(
    getDefaultCheckInDay(new Date('2026-10-15T04:00:00.000Z')),
    'day_2'
  );
});

test('keeps day 1 and day 2 check-ins independent', () => {
  const checkIns = normalizeCheckIns([
    {
      event_day: 1,
      checked_in_at: '2026-10-14T04:00:00.000Z',
      desk_label: 'Main Desk',
    },
  ]);
  const record = { check_ins: checkIns };

  assert.equal(isCheckedInForDay(record, 'day_1'), true);
  assert.equal(isCheckedInForDay(record, 'day_2'), false);
  assert.equal(getCheckInForDay(record, 'day_1').desk_label, 'Main Desk');
});

test('treats legacy checked_in_at as day 1 only when no daily rows exist', () => {
  const legacy = normalizeCheckIns([], '2026-10-14T04:00:00.000Z');
  assert.equal(Boolean(legacy.day_1?.checked_in_at), true);
  assert.equal(Boolean(legacy.day_2?.checked_in_at), false);

  const withDailyRows = normalizeCheckIns(
    [{ event_day: 2, checked_in_at: '2026-10-15T04:00:00.000Z' }],
    '2026-10-15T04:00:00.000Z'
  );
  assert.equal(Boolean(withDailyRows.day_1?.checked_in_at), false);
  assert.equal(Boolean(withDailyRows.day_2?.checked_in_at), true);
});
