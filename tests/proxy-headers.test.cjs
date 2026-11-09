const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Design §4.2 step 6: client-sent x-mash-* headers are stripped before
// anything else reads them.
test('the proxy strips client-sent internal x-mash-* headers', () => {
  const proxy = fs.readFileSync('src/proxy.ts', 'utf8');
  assert.match(proxy, /INTERNAL_HEADER_PREFIX = 'x-mash-'/);
  assert.match(proxy, /headers\.delete\(name\)/);
  assert.match(
    proxy,
    /request: \{ headers: withoutInternalHeaders\(request\) \}/
  );
});

test('the proxy matcher covers API routes and pages, not just static files', () => {
  const proxy = fs.readFileSync('src/proxy.ts', 'utf8');
  assert.doesNotMatch(proxy, /matcher:[\s\S]*\(\?!api/);
});
