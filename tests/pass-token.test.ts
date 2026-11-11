import test from 'node:test';
import assert from 'node:assert/strict';
import {
  passSecret,
  signPassToken,
  verifyPassToken,
} from '../core/passes/pass-token.ts';
import { resolveRoute } from '../core/routing/resolve.ts';

// QR pass tokens (docs/system-design.md §9.1, §12.6, §12.13 item 7).

const SECRET = 'test-pass-secret-not-real';
const EVENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PASS = '12345678-9abc-4def-8123-456789abcdef';

test('a token verifies for its own event and returns the pass id', async () => {
  const token = await signPassToken(SECRET, EVENT_A, PASS);
  assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(token.length < 140, 'short enough for a QR code');
  assert.equal(await verifyPassToken(SECRET, EVENT_A, token), PASS);
});

test("event A's token never verifies for event B", async () => {
  const token = await signPassToken(SECRET, EVENT_A, PASS);
  assert.equal(await verifyPassToken(SECRET, EVENT_B, token), null);
});

test('tampering, another secret, or a rotated key version all fail', async () => {
  const token = await signPassToken(SECRET, EVENT_A, PASS);
  const other = await signPassToken(
    SECRET,
    EVENT_A,
    '22222222-2222-4222-8222-222222222222'
  );
  const swapped = `${token.split('.').slice(0, 3).join('.')}.${other.split('.')[3]}`;
  assert.equal(await verifyPassToken(SECRET, EVENT_A, swapped), null);
  assert.equal(await verifyPassToken('another-secret', EVENT_A, token), null);
  assert.equal(await verifyPassToken(SECRET, EVENT_A, token, 2), null);
  for (const bad of [
    '',
    'v1',
    'v2.a.b.c',
    'v1.a.b.c.d',
    'v1.!!.??.##',
    'x'.repeat(500),
  ]) {
    assert.equal(await verifyPassToken(SECRET, EVENT_A, bad), null, bad);
  }
});

test('pass secret falls back outside production only', () => {
  const before = process.env.MASH_ENV;
  const saved = process.env.PASS_MASTER_SECRET;
  delete process.env.PASS_MASTER_SECRET;
  process.env.MASH_ENV = 'development';
  assert.ok(passSecret());
  process.env.MASH_ENV = 'production';
  assert.equal(passSecret(), null);
  process.env.MASH_ENV = before ?? 'development';
  if (saved) process.env.PASS_MASTER_SECRET = saved;
});

test('the proxy sends /<event>/pass/<token> to that event only', async () => {
  const token = await signPassToken(SECRET, EVENT_A, PASS);
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
    resolveRoute('acme.mash.example', `/launch/pass/${token}`, config),
    {
      kind: 'rewrite',
      pathname: `/api/public/events/${EVENT_A}/pass/${token}`,
      orgId: '11111111-1111-4111-8111-111111111111',
      eventId: EVENT_A,
    }
  );
  for (const path of [
    '/launch/pass',
    '/launch/pass/x/y',
    '/launch/pass/<script>',
    `/launch/pass/${'x'.repeat(500)}`,
  ]) {
    assert.equal(
      resolveRoute('acme.mash.example', path, config).kind,
      'not_found',
      path
    );
  }
});
