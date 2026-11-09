const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { isCrossSiteStateChange } = require('../src/lib/cross-site-request.cjs');

const url = 'https://mash.example/api/admin/registrations/status';

test('reads are never blocked', () => {
  assert.equal(
    isCrossSiteStateChange({
      method: 'GET',
      url,
      origin: 'https://evil.example',
      secFetchSite: 'cross-site',
    }),
    false
  );
});

test('same-origin browser writes pass', () => {
  assert.equal(
    isCrossSiteStateChange({
      method: 'POST',
      url,
      origin: 'https://mash.example',
      secFetchSite: 'same-origin',
    }),
    false
  );
});

test('cross-site and same-site browser writes are blocked', () => {
  for (const secFetchSite of ['cross-site', 'same-site']) {
    assert.equal(
      isCrossSiteStateChange({ method: 'POST', url, secFetchSite }),
      true
    );
  }
  assert.equal(
    isCrossSiteStateChange({
      method: 'DELETE',
      url,
      origin: 'https://evil.example',
    }),
    true
  );
  assert.equal(
    isCrossSiteStateChange({ method: 'PATCH', url, origin: 'null' }),
    true
  );
});

test('server-to-server callers without browser headers pass', () => {
  assert.equal(isCrossSiteStateChange({ method: 'POST', url }), false);
});

test('the proxy applies the check to protected routes before passing the request on', () => {
  const proxy = fs.readFileSync('src/proxy.ts', 'utf8');
  const guard = proxy.indexOf('isCrossSiteStateChange({');
  const next = proxy.indexOf('return NextResponse.next(');
  assert.ok(guard > 0 && guard < next);
  // Admin-host requests are checked before the session is touched.
  assert.ok(
    proxy.indexOf('isCrossSiteStateChange({') <
      proxy.indexOf('handleAdminSession(')
  );
});
