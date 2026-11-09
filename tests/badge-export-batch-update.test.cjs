const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function loadRegistrationDb(supabase) {
  const source = fs.readFileSync('src/lib/registration-db.js', 'utf8');
  const { code } = transformSync(source, { format: 'cjs' });
  const testModule = { exports: {} };
  const dependencies = {
    '@/lib/supabase-admin': { getSupabaseAdmin: () => supabase },
    '@/lib/registration-utils': {},
    '@/lib/registration-pass-utils.cjs': require('../src/lib/registration-pass-utils.cjs'),
    '@/lib/registration-review-update.cjs': require('../src/lib/registration-review-update.cjs'),
    '@/lib/check-in-day-utils.cjs': require('../src/lib/check-in-day-utils.cjs'),
  };
  vm.runInNewContext(code, {
    module: testModule,
    exports: testModule.exports,
    require: (specifier) => dependencies[specifier],
    console,
  });
  return testModule.exports;
}

test('badge export marks every registration in URL-safe batches', async () => {
  const batches = [];
  const supabase = {
    from(table) {
      assert.equal(table, 'event_registrations');
      return {
        update(values) {
          assert.equal(values.last_badge_export_batch_id, 'batch-1');
          return {
            in(field, ids) {
              assert.equal(field, 'id');
              batches.push(ids);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  const ids = Array.from(
    { length: 645 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  );

  await loadRegistrationDb(supabase).setLastBadgeExportBatch('batch-1', ids);

  assert.deepEqual(batches.flat(), ids);
  for (const batch of batches) {
    // UUID plus an encoded comma is 39 URL characters.
    assert.ok(batch.length * 39 < 8000, `batch of ${batch.length} ids`);
  }
});

test('badge export stops and reports the first failed batch', async () => {
  let calls = 0;
  const supabase = {
    from: () => ({
      update: () => ({
        in() {
          calls += 1;
          return Promise.resolve({ error: { message: 'Bad Request' } });
        },
      }),
    }),
  };
  const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);

  await assert.rejects(
    loadRegistrationDb(supabase).setLastBadgeExportBatch('batch-1', ids),
    /Bad Request/
  );
  assert.equal(calls, 1);
});
