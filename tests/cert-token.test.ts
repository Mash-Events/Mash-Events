import test from 'node:test';
import assert from 'node:assert/strict';
import {
  certSecret,
  signCertToken,
  verifyCertToken,
} from '../core/certificates/cert-token.ts';

// Same suite shape as tests/pass-token.test.ts.

const SECRET = 'test-cert-secret-not-real';
const EVENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CERT = '12345678-9abc-4def-8123-456789abcdef';

test('signs and verifies a certificate token', async () => {
  const token = await signCertToken(SECRET, EVENT_A, CERT);
  assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(await verifyCertToken(SECRET, EVENT_A, token), CERT);
});

test('tokens are deterministic (re-drains re-derive the same link)', async () => {
  const a = await signCertToken(SECRET, EVENT_A, CERT);
  const b = await signCertToken(SECRET, EVENT_A, CERT);
  assert.equal(a, b);
});

test("event A's token never verifies for event B", async () => {
  const token = await signCertToken(SECRET, EVENT_A, CERT);
  assert.equal(await verifyCertToken(SECRET, EVENT_B, token), null);
});

test('the wrong secret or a rotated key version fails', async () => {
  const token = await signCertToken(SECRET, EVENT_A, CERT);
  assert.equal(await verifyCertToken('another-secret', EVENT_A, token), null);
  assert.equal(await verifyCertToken(SECRET, EVENT_A, token, 2), null);
});

test('a pass token never verifies as a certificate (domains never cross)', async () => {
  const { signPassToken, verifyPassToken } =
    await import('../core/passes/pass-token.ts');
  const pass = await signPassToken(SECRET, EVENT_A, CERT);
  assert.equal(await verifyCertToken(SECRET, EVENT_A, pass), null);

  const cert = await signCertToken(SECRET, EVENT_A, CERT);
  assert.equal(await verifyPassToken(SECRET, EVENT_A, cert), null);
});

test('rejects malformed tokens', async () => {
  assert.equal(await verifyCertToken(SECRET, EVENT_A, ''), null);
  assert.equal(await verifyCertToken(SECRET, EVENT_A, 'v1.only.one'), null);
  assert.equal(await verifyCertToken(SECRET, EVENT_A, 'v2.a.b.c'), null);
  assert.equal(await verifyCertToken(SECRET, EVENT_A, 'v1.a.b.c.d'), null);
  assert.equal(await verifyCertToken(SECRET, EVENT_A, 'v1.!!!.???.zzz'), null);
});

test('certSecret falls back to a dev secret outside production', () => {
  const prev = process.env.MASH_ENV;
  const prevSecret = process.env.CERT_MASTER_SECRET;
  delete process.env.CERT_MASTER_SECRET;
  process.env.MASH_ENV = 'production';
  assert.equal(certSecret(), null);
  process.env.MASH_ENV = 'development';
  assert.equal(certSecret(), 'dev-only-cert-secret-not-for-production');
  process.env.CERT_MASTER_SECRET = 'real-secret';
  assert.equal(certSecret(), 'real-secret');
  process.env.MASH_ENV = prev ?? 'development';
  if (prevSecret) process.env.CERT_MASTER_SECRET = prevSecret;
  else delete process.env.CERT_MASTER_SECRET;
});
