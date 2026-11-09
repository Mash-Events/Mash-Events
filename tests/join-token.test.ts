import test from 'node:test';
import assert from 'node:assert/strict';
import { signJoinToken, verifyJoinToken } from '../core/passes/join-token.ts';
import { resolveRoute } from '../core/routing/resolve.ts';

// Webinar join links (docs/system-design.md §9.3, §12.6, §12.13 item 7).

const SECRET = 'test-link-secret-not-real';
const EVENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REG = '12345678-9abc-4def-8123-456789abcdef';

test('a token verifies for its own event and returns the registration', async () => {
  const token = await signJoinToken(SECRET, EVENT_A, REG);
  assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(token.length < 80, 'short enough for an email link');
  assert.equal(await verifyJoinToken(SECRET, EVENT_A, token), REG);
});

test("event A's token never verifies for event B", async () => {
  const token = await signJoinToken(SECRET, EVENT_A, REG);
  assert.equal(await verifyJoinToken(SECRET, EVENT_B, token), null);
});

test('tampering, another secret, or a rotated key version all fail', async () => {
  const token = await signJoinToken(SECRET, EVENT_A, REG);
  const other = await signJoinToken(
    SECRET,
    EVENT_A,
    '22222222-2222-4222-8222-222222222222'
  );
  const swapped = `${token.split('.').slice(0, 2).join('.')}.${other.split('.')[2]}`;
  assert.equal(await verifyJoinToken(SECRET, EVENT_A, swapped), null);
  assert.equal(await verifyJoinToken('another-secret', EVENT_A, token), null);
  assert.equal(await verifyJoinToken(SECRET, EVENT_A, token, 2), null);
  for (const bad of [
    '',
    'v1',
    'v2.a.b',
    'v1.a.b.c',
    'v1.!!.??',
    'x'.repeat(200),
  ]) {
    assert.equal(await verifyJoinToken(SECRET, EVENT_A, bad), null, bad);
  }
});

test('the proxy sends /<event>/join/<token> to that event only', async () => {
  const token = await signJoinToken(SECRET, EVENT_A, REG);
  const config = {
    adminHosts: ['admin.mash.example'],
    rootHosts: ['mash.example'],
    previewFallback: false,
    orgs: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'acme',
        hosts: ['acme.mash.example'],
        events: [{ id: EVENT_A, slug: 'launch' }],
      },
    ],
  };
  assert.deepEqual(
    resolveRoute('acme.mash.example', `/launch/join/${token}`, config),
    {
      kind: 'rewrite',
      pathname: `/api/public/events/${EVENT_A}/join/${token}`,
      orgId: '11111111-1111-4111-8111-111111111111',
      eventId: EVENT_A,
    }
  );
  for (const path of [
    '/launch/join',
    '/launch/join/x/y',
    '/launch/join/<script>',
  ]) {
    assert.equal(
      resolveRoute('acme.mash.example', path, config).kind,
      'not_found',
      path
    );
  }
});
