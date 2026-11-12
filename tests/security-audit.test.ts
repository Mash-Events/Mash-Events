import test from 'node:test';
import assert from 'node:assert/strict';
import { headerSafe } from '../core/messaging/header-safe.ts';
import { clientIp } from '../core/security/client-ip.ts';

// Security-audit fixes (2026-11-12): CRLF injection into email headers and
// trust of spoofable client-IP headers.

test('headerSafe strips header-splitting characters', () => {
  assert.equal(headerSafe('a\r\nb'), 'a  b'); // \r and \n each become a space
  assert.equal(headerSafe('a\tb'), 'a b');
  assert.equal(headerSafe('a\u0000b'), 'ab');
  assert.equal(headerSafe('  clean  '), 'clean');
  assert.ok(!headerSafe('Bob\r\nBcc: victim@example.org').includes('\n'));
  assert.ok(!headerSafe('Bob\r\nBcc: victim@example.org').includes('\r'));
});

test('clientIp prefers edge-verified headers and rejects junk', () => {
  const h = (obj: Record<string, string>) => new Headers(obj);

  // Vercel's own header wins over a spoofed XFF.
  assert.equal(
    clientIp(
      h({
        'x-vercel-forwarded-for': '203.0.113.9',
        'x-forwarded-for': '1.2.3.4, 9.9.9.9',
      })
    ),
    '203.0.113.9'
  );
  // x-real-ip next.
  assert.equal(clientIp(h({ 'x-real-ip': '198.51.100.7' })), '198.51.100.7');
  // XFF first entry when nothing else is present.
  assert.equal(
    clientIp(h({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' })),
    '203.0.113.5'
  );
  // Junk never becomes a rate-limit key.
  assert.equal(clientIp(h({ 'x-forwarded-for': 'not-an-ip' })), null);
  assert.equal(clientIp(h({ 'x-forwarded-for': '<script>' })), null);
  assert.equal(clientIp(h({})), null);
  // IPv6 literals pass.
  assert.equal(clientIp(h({ 'x-real-ip': '2001:db8::1' })), '2001:db8::1');
});
