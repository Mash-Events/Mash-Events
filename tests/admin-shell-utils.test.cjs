const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAdminNavigation } = require('../src/lib/admin-shell-utils.cjs');

test('buildAdminNavigation marks the active route and hides zero-value delivery badge', () => {
  const sections = buildAdminNavigation({
    pathname: '/admin/check-in',
    summary: { pending: 9 },
    jobs: [{ failed_items: 0 }],
  });

  assert.equal(sections[0].items[0].href, '/admin/submissions');
  assert.equal(sections[0].items[0].active, false);
  assert.equal(sections[0].items[1].badgeCount, 9);
  assert.equal(sections[0].items[2].badgeCount, 0);
  assert.equal(sections[0].items[2].showBadge, false);
  assert.equal(sections[0].items[3].active, true);
});

test('buildAdminNavigation exposes and activates the submissions route', () => {
  const sections = buildAdminNavigation({ pathname: '/admin/submissions' });
  const item = sections[0].items.find(
    ({ href }) => href === '/admin/submissions'
  );
  assert.equal(item.label, 'Submissions');
  assert.equal(item.active, true);
});

test('buildAdminNavigation exposes the isolated guest invitations route', () => {
  const sections = buildAdminNavigation({
    pathname: '/admin/guest-invitations',
  });
  const item = sections[0].items.find(
    ({ href }) => href === '/admin/guest-invitations'
  );
  assert.equal(item.label, 'Guest Invitations');
  assert.equal(item.active, true);
  assert.equal(item.showBadge, false);
});
