const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEntryScanSearchFilters,
} = require('../src/lib/check-in-scan-search.cjs');

test('builds no filters for an empty search', () => {
  assert.deepEqual(buildEntryScanSearchFilters(''), []);
  assert.deepEqual(buildEntryScanSearchFilters('   '), []);
  assert.deepEqual(buildEntryScanSearchFilters(null), []);
});

test('builds one name/code filter per word', () => {
  assert.deepEqual(buildEntryScanSearchFilters('Riya  Sharma'), [
    'first_name.ilike.%Riya%,last_name.ilike.%Riya%,registration_code.ilike.%Riya%',
    'first_name.ilike.%Sharma%,last_name.ilike.%Sharma%,registration_code.ilike.%Sharma%',
  ]);
});

test('strips PostgREST filter syntax characters', () => {
  assert.deepEqual(buildEntryScanSearchFilters('a,b(c)'), [
    'first_name.ilike.%a%,last_name.ilike.%a%,registration_code.ilike.%a%',
    'first_name.ilike.%b%,last_name.ilike.%b%,registration_code.ilike.%b%',
    'first_name.ilike.%c%,last_name.ilike.%c%,registration_code.ilike.%c%',
  ]);
  assert.deepEqual(buildEntryScanSearchFilters('%_*.:\'"\\'), []);
});

test('caps the number of search words', () => {
  assert.equal(buildEntryScanSearchFilters('a b c d e f').length, 4);
});
