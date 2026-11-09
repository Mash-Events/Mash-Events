const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPassImageStoragePath,
  normalizeEntryPasses,
  getIssuedEntryPass,
  normalizeRegistrationRecord,
} = require('../src/lib/registration-pass-utils.cjs');

test('normalizeEntryPasses returns an array for singleton relation objects', () => {
  const result = normalizeEntryPasses({
    id: 'pass_1',
    status: 'issued',
    token: 'abc',
  });

  assert.deepEqual(result, [{ id: 'pass_1', status: 'issued', token: 'abc' }]);
});

test('normalizeEntryPasses preserves arrays and drops nullish values', () => {
  const result = normalizeEntryPasses([
    { id: 'pass_1' },
    null,
    undefined,
    { id: 'pass_2' },
  ]);

  assert.deepEqual(result, [{ id: 'pass_1' }, { id: 'pass_2' }]);
});

test('getIssuedEntryPass finds the issued pass after normalization', () => {
  assert.deepEqual(
    getIssuedEntryPass({ id: 'pass_1', status: 'issued', token: 'abc' }),
    { id: 'pass_1', status: 'issued', token: 'abc' }
  );
});

test('normalizeRegistrationRecord always exposes entry_passes as an array', () => {
  const result = normalizeRegistrationRecord({
    id: 'reg_1',
    entry_passes: { id: 'pass_1', status: 'issued' },
  });

  assert.deepEqual(result.entry_passes, [{ id: 'pass_1', status: 'issued' }]);
});

test('buildPassImageStoragePath returns a stable storage path for hosted email QR images', () => {
  assert.equal(
    buildPassImageStoragePath({
      passId: 'pass_123',
      registrationId: 'reg_123',
    }),
    'reg_123/pass-pass_123.png'
  );
});
