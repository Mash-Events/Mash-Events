const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getBatchStatusTone,
  buildDashboardQueryString,
  summarizeQrSelection,
  summarizeSelection,
  prioritizeRegistrationQueue,
  getQuickActionOptions,
  getLinkedInProfileUrl,
} = require('../src/lib/admin-dashboard-utils.cjs');

test('review queue opens only valid LinkedIn hosts', () => {
  assert.equal(
    getLinkedInProfileUrl('http://www.linkedin.com/in/example-user'),
    'https://www.linkedin.com/in/example-user'
  );
  assert.equal(
    getLinkedInProfileUrl('https://linkedin.com.evil.test/in/x'),
    ''
  );
  assert.equal(getLinkedInProfileUrl('javascript:alert(1)'), '');
  assert.equal(getLinkedInProfileUrl(''), '');
});

test('QR selection counts first sends, repeats and ineligible people without broadening scope', () => {
  assert.deepEqual(
    summarizeQrSelection(
      ['new', 'issued', 'pending'],
      [
        { id: 'new', status: 'confirmed', qr_pass_issued_at: null },
        { id: 'issued', status: 'confirmed', qr_pass_issued_at: '2026-09-23' },
        { id: 'pending', status: 'pending', qr_pass_issued_at: null },
        { id: 'unselected', status: 'confirmed', qr_pass_issued_at: null },
      ]
    ),
    {
      registrationIds: ['new', 'issued'],
      firstSendCount: 1,
      repeatCount: 1,
      ineligibleCount: 1,
    }
  );
});

test('bulk QR control appears only with multiple selections and has no filter-wide send action', () => {
  const panel = fs.readFileSync(
    path.join(
      process.cwd(),
      'src/components/admin/registrations-admin-panel.jsx'
    ),
    'utf8'
  );
  assert.match(panel, /selectedIds\.length > 1/);
  assert.match(panel, /Send QR to selected/);
  assert.doesNotMatch(panel, /handleSendQr\('filtered'\)/);
  assert.doesNotMatch(panel, /handleResendQr/);
});

test('buildDashboardQueryString omits empty filter values', () => {
  const query = buildDashboardQueryString({
    search: 'india',
    status: 'confirmed',
    category: '',
    priorityTier: 'Purple Tier',
    country: '',
  });

  assert.equal(query, 'search=india&status=confirmed&priorityTier=Purple+Tier');
});

test('summarizeSelection reports selected and matched counts for bulk actions', () => {
  assert.deepEqual(
    summarizeSelection({
      selectedCount: 12,
      matchedCount: 48,
    }),
    {
      selectedLabel: '12 selected',
      matchedLabel: '48 matched',
    }
  );

  assert.deepEqual(
    summarizeSelection({
      selectedCount: 0,
      matchedCount: 48,
    }),
    {
      selectedLabel: '0 selected',
      matchedLabel: '48 matched',
    }
  );
});

test('getBatchStatusTone marks in-flight queue processing as warning', () => {
  assert.equal(getBatchStatusTone('Job queued for 40 attendees.'), 'warning');
  assert.equal(getBatchStatusTone('Retrying 3 failed sends.'), 'warning');
});

test('prioritizeRegistrationQueue brings pending and higher-priority registrants to the top', () => {
  const sorted = prioritizeRegistrationQueue([
    {
      id: '3',
      status: 'confirmed',
      priority_tier: 'Blue Tier',
      qr_pass_issued_at: '2026-01-01',
      created_at: '2026-03-01T10:00:00.000Z',
    },
    {
      id: '1',
      status: 'pending',
      priority_tier: 'Purple Tier',
      qr_pass_issued_at: null,
      created_at: '2026-03-02T10:00:00.000Z',
    },
    {
      id: '2',
      status: 'pending',
      priority_tier: 'Gold Tier',
      qr_pass_issued_at: null,
      created_at: '2026-03-01T10:00:00.000Z',
    },
    {
      id: '4',
      status: 'confirmed',
      priority_tier: 'Purple Tier',
      qr_pass_issued_at: null,
      created_at: '2026-03-03T10:00:00.000Z',
    },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['1', '2', '4', '3']
  );
});

test('getQuickActionOptions adapts row actions to registrant state', () => {
  assert.deepEqual(
    getQuickActionOptions({
      status: 'pending',
      qr_pass_issued_at: null,
    }).map((action) => action.key),
    ['confirm', 'waitlist', 'reject']
  );

  assert.deepEqual(
    getQuickActionOptions({
      status: 'confirmed',
      qr_pass_issued_at: null,
    }).map((action) => action.key),
    ['sendQr', 'waitlist', 'reject']
  );

  assert.deepEqual(
    getQuickActionOptions({
      status: 'confirmed',
      qr_pass_issued_at: '2026-09-23',
    }).map((action) => action.key),
    ['sendQr', 'waitlist', 'reject']
  );

  assert.deepEqual(
    getQuickActionOptions({
      status: 'confirmed',
      qr_pass_issued_at: '2026-03-01T10:00:00.000Z',
    }).map((action) => action.key),
    ['sendQr', 'waitlist', 'reject']
  );
});

test('registrations speaker filter only narrows the list when set to speakers', () => {
  assert.equal(
    buildDashboardQueryString({ status: 'all', speakerFlag: '' }),
    'status=all'
  );
  assert.equal(
    buildDashboardQueryString({ status: 'all', speakerFlag: 'yes' }),
    'status=all&speakerFlag=yes'
  );

  const fs = require('node:fs');
  const path = require('node:path');
  const panel = fs.readFileSync(
    path.join(
      process.cwd(),
      'src/components/admin/registrations-admin-panel.jsx'
    ),
    'utf8'
  );
  assert.match(panel, /speakerFlag: '',/);
  assert.match(panel, /<option value="yes">Speakers only<\/option>/);
  // Changing a filter must clear the selection, so a bulk QR send never
  // carries rows over from another view. Select filters clear at once; text
  // filters clear when their debounced value actually changes.
  assert.match(
    panel,
    /if \(!TEXT_FILTER_KEYS\.includes\(key\)\) setSelectedIds\(\[\]\);/
  );
  assert.match(
    panel,
    /debouncedTextRef\.current = next;\s*setSelectedIds\(\[\]\);/
  );
});
