const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createMemoryCache,
  applyRegistrationListCache,
  readRegistrationListCache,
  applySavedRegistrationsToList,
  applyRegistrationDetailCache,
  readRegistrationDetailCache,
  invalidateRegistrationCaches,
} = require('../src/lib/admin-registration-cache.cjs');

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('admin registration memory cache honors ttl, force bypass callers, and invalidation', () => {
  let now = 1_000;
  const getNow = () => now;
  const listCache = createMemoryCache({ ttlMs: 60_000, getNow });
  const detailCache = createMemoryCache({ ttlMs: 120_000, getNow });

  applyRegistrationListCache(listCache, 'status=pending', {
    registrations: [{ id: 'r1' }],
  });
  applyRegistrationDetailCache(detailCache, 'r1', {
    registration: { id: 'r1' },
  });

  assert.deepEqual(readRegistrationListCache(listCache, 'status=pending'), {
    registrations: [{ id: 'r1' }],
  });
  assert.deepEqual(readRegistrationDetailCache(detailCache, 'r1'), {
    registration: { id: 'r1' },
  });

  now += 61_000;
  assert.equal(readRegistrationListCache(listCache, 'status=pending'), null);
  assert.deepEqual(readRegistrationDetailCache(detailCache, 'r1'), {
    registration: { id: 'r1' },
  });

  invalidateRegistrationCaches({
    listCache,
    detailCache,
    registrationIds: ['r1'],
  });

  assert.equal(readRegistrationDetailCache(detailCache, 'r1'), null);
});

test('successful status saves update visible rows without exposing review notes or changing conflict rows', () => {
  const state = {
    registrations: [
      {
        id: 'saved',
        status: 'pending',
        updated_at: 'old',
        has_review_note: false,
      },
      { id: 'conflict', status: 'pending', updated_at: 'unchanged' },
    ],
    count: 2,
  };
  const next = applySavedRegistrationsToList(state, [
    {
      id: 'saved',
      status: 'confirmed',
      updated_at: 'new',
      reviewed_at: 'reviewed',
      speaker_flag: true,
      vip_flag: false,
      exception_badge_required: true,
      badge_color_label: 'Gold',
      badge_color_hex: '#123456',
      review_notes: 'Private note',
    },
  ]);

  assert.equal(next.registrations[0].status, 'confirmed');
  assert.equal(next.registrations[0].updated_at, 'new');
  assert.equal(next.registrations[0].has_review_note, true);
  assert.equal('review_notes' in next.registrations[0], false);
  assert.strictEqual(next.registrations[1], state.registrations[1]);
  assert.equal(next.count, 2);
  assert.strictEqual(applySavedRegistrationsToList(state, []), state);
});

test('admin registration client keeps attendee cache in memory only', () => {
  const source = readSource(
    'src/components/admin/registrations-admin-panel.jsx'
  );

  assert.match(source, /createMemoryCache/);
  assert.match(source, /readRegistrationListCache/);
  assert.match(source, /readRegistrationDetailCache/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /sessionStorage/);
});

test('registrations grid hides low-value columns on narrow screens while keeping core columns', () => {
  const source = readSource(
    'src/components/admin/registrations-admin-panel.jsx'
  );

  assert.match(source, /COMPACT_HIDDEN_COLUMN_IDS/);
  assert.match(source, /\(min-width: 1400px\)/);
  assert.match(source, /matchMedia/);
  assert.match(source, /'location', 'qr', 'checkin'/);
  // Core review columns remain unconditional.
  assert.match(source, /id: 'registrant'/);
  assert.match(source, /id: 'email'/);
  assert.match(source, /id: 'status'/);
  assert.match(source, /id: 'notes'/);
  assert.match(source, /id: 'actions'/);
});

test('queue returns only note presence to the list while detail retains note text', () => {
  const queue = readSource('src/lib/registration-ops-db.js');
  const panel = readSource(
    'src/components/admin/registrations-admin-panel.jsx'
  );

  assert.match(queue, /has_review_note: Boolean\(reviewNotes\?\.trim\(\)\)/);
  assert.match(panel, /row\.data\.has_review_note/);
  assert.match(panel, /detailDraft\.reviewNotes/);
});

test('review queue gets its total from the summary instead of a second exact count', () => {
  const source = readSource('src/lib/registration-ops-db.js');
  const queueFunction = source
    .split('export async function listRegistrationQueue')[1]
    .split('function normalizeSummaryRow')[0];
  assert.match(queueFunction, /const totalCount = summary\.total \|\| 0/);
  assert.doesNotMatch(queueFunction, /count: 'exact'/);
});

test('event crons are switched off between editions', () => {
  const config = JSON.parse(readSource('vercel.json'));

  assert.deepEqual(
    config.crons.map((cron) => cron.path),
    ['/api/internal/keep-alive']
  );
});
