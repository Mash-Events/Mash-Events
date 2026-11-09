const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldAutoSignOutAdminNavigation,
  normalizeAdminExitTarget,
} = require('../src/lib/admin-exit-utils.cjs');

test('auto signs out when leaving admin for a public route', () => {
  assert.equal(
    shouldAutoSignOutAdminNavigation('/admin/registrations', '/about'),
    true
  );
  assert.equal(shouldAutoSignOutAdminNavigation('/admin/check-in', '/'), true);
});

test('does not auto sign out for admin-to-admin navigation', () => {
  assert.equal(
    shouldAutoSignOutAdminNavigation('/admin/registrations', '/admin/check-in'),
    false
  );
  assert.equal(
    shouldAutoSignOutAdminNavigation('/admin/check-in', '/admin'),
    false
  );
});

test('normalizes only safe relative exit targets', () => {
  assert.equal(normalizeAdminExitTarget('/register'), '/register');
  assert.equal(normalizeAdminExitTarget('https://evil.example'), '/');
  assert.equal(normalizeAdminExitTarget('//evil.example'), '/');
});
