const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampPage,
  pageNumbers,
  pageRange,
  totalPagesFor,
} = require('../src/lib/admin-pagination.cjs');
const {
  countByStatus,
  eventLabel,
  eventTone,
  filterEmails,
  mergeNewest,
  statusGroup,
} = require('../src/lib/email-history.cjs');

test('pager maths: ranges, clamping and page numbers with gaps', () => {
  assert.equal(totalPagesFor(340, 25), 14);
  assert.equal(totalPagesFor(0, 25), 1);
  assert.equal(clampPage('9', 3), 3);
  assert.equal(clampPage('0', 3), 1);
  assert.equal(clampPage('abc', 3), 1);
  assert.deepEqual(pageRange(2, 25, 340), { from: 26, to: 50, total: 340 });
  assert.deepEqual(pageRange(14, 25, 340), { from: 326, to: 340, total: 340 });
  assert.deepEqual(pageRange(1, 25, 0), { from: 0, to: 0, total: 0 });
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(pageNumbers(7, 14), [1, null, 6, 7, 8, null, 14]);
  assert.deepEqual(pageNumbers(2, 14), [1, 2, 3, null, 14]);
});

test('Resend events are grouped so bounced and suppressed are easy to find', () => {
  assert.equal(statusGroup('opened'), 'delivered');
  assert.equal(statusGroup('delivery_delayed'), 'pending');
  assert.equal(statusGroup('bounced'), 'bounced');
  assert.equal(statusGroup('suppressed'), 'suppressed');
  assert.equal(statusGroup(undefined), 'pending');
  assert.equal(eventLabel('delivery_delayed'), 'Delayed');
  assert.equal(eventLabel('complained'), 'Marked as spam');
  assert.equal(eventTone('suppressed'), 'danger');
  assert.equal(eventTone('delivered'), 'success');

  const emails = [
    { id: '1', to: ['a@x.org'], subject: 'QR pass', lastEvent: 'bounced' },
    { id: '2', to: ['b@x.org'], subject: 'QR pass', lastEvent: 'suppressed' },
    { id: '3', to: ['c@x.org'], subject: 'Confirmed', lastEvent: 'delivered' },
    { id: '4', to: ['d@x.org'], subject: 'Confirmed', lastEvent: 'sent' },
  ];
  assert.deepEqual(countByStatus(emails), {
    all: 4,
    problems: 2,
    delivered: 1,
    pending: 1,
    bounced: 1,
    suppressed: 1,
    complained: 0,
    failed: 0,
  });
  assert.deepEqual(
    filterEmails(emails, { status: 'problems' }).map((email) => email.id),
    ['1', '2']
  );
  assert.deepEqual(
    filterEmails(emails, { status: 'suppressed' }).map((email) => email.id),
    ['2']
  );
  assert.deepEqual(
    filterEmails(emails, { query: 'B@X' }).map((email) => email.id),
    ['2']
  );
});

test('a quick re-check updates recent statuses and adds new emails on top', () => {
  const cached = [
    { id: 'old-2', createdAt: '2026-10-03T10:00:00Z', lastEvent: 'sent' },
    { id: 'old-1', createdAt: '2026-10-03T09:00:00Z', lastEvent: 'delivered' },
  ];
  const fresh = [
    { id: 'new-1', createdAt: '2026-10-03T11:00:00Z', lastEvent: 'sent' },
    { id: 'old-2', createdAt: '2026-10-03T10:00:00Z', lastEvent: 'bounced' },
  ];
  assert.deepEqual(
    mergeNewest(cached, fresh).map((email) => [email.id, email.lastEvent]),
    [
      ['new-1', 'sent'],
      ['old-2', 'bounced'],
      ['old-1', 'delivered'],
    ]
  );
});
