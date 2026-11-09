import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseHost,
  resolveRoute,
  type RoutingConfig,
} from '../core/routing/resolve.ts';

// Event isolation at the edge (docs/system-design.md §4.2, §12.13 item 10).

const FLIPKART = '11111111-1111-4111-8111-111111111111';
const IDH = '22222222-2222-4222-8222-222222222222';
const WEBINAR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUMMIT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const config: RoutingConfig = {
  adminHosts: ['admin.mash.example'],
  rootHosts: ['mash.example'],
  previewFallback: false,
  orgs: [
    {
      id: FLIPKART,
      slug: 'flipkart',
      hosts: ['flipkart.mash.example'],
      events: [{ id: WEBINAR, slug: 'webinar-2026' }],
    },
    {
      id: IDH,
      slug: 'idh',
      hosts: ['idh.mash.example'],
      events: [{ id: SUMMIT, slug: 'summit' }],
    },
  ],
};

test('an org host rewrites its own event to the internal site path', () => {
  assert.deepEqual(
    resolveRoute('flipkart.mash.example', '/webinar-2026/agenda', config),
    {
      kind: 'rewrite',
      pathname: '/site/flipkart/webinar-2026/agenda',
      orgId: FLIPKART,
      eventId: WEBINAR,
    }
  );
});

test('public API calls get the event id from host + slug only', () => {
  assert.deepEqual(
    resolveRoute('flipkart.mash.example', '/webinar-2026/api/register', config),
    {
      kind: 'rewrite',
      pathname: `/api/public/events/${WEBINAR}/register`,
      orgId: FLIPKART,
      eventId: WEBINAR,
    }
  );
});

test("one org's host cannot serve or reach another org's event", () => {
  assert.equal(
    resolveRoute('idh.mash.example', '/webinar-2026', config).kind,
    'not_found'
  );
  assert.equal(
    resolveRoute('idh.mash.example', '/site/flipkart/webinar-2026', config)
      .kind,
    'not_found'
  );
  assert.equal(
    resolveRoute(
      'idh.mash.example',
      `/api/public/events/${WEBINAR}/register`,
      config
    ).kind,
    'not_found'
  );
});

test('admin and auth paths only exist on the admin host', () => {
  for (const path of ['/admin', '/auth/sign-in', '/api/admin/events/x']) {
    assert.equal(
      resolveRoute('flipkart.mash.example', path, config).kind,
      'not_found',
      path
    );
    assert.equal(resolveRoute('mash.example', path, config).kind, 'not_found');
  }
  assert.deepEqual(resolveRoute('admin.mash.example', '/admin', config), {
    kind: 'admin',
    requiresSession: true,
  });
  assert.deepEqual(
    resolveRoute('admin.mash.example', '/auth/sign-in', config),
    { kind: 'admin', requiresSession: false }
  );
});

test('the admin host serves no public or internal paths', () => {
  for (const path of ['/webinar-2026', '/site/flipkart/webinar-2026', '/x']) {
    assert.equal(
      resolveRoute('admin.mash.example', path, config).kind,
      'not_found',
      path
    );
  }
});

test('unknown hosts, unknown events and odd paths are 404', () => {
  assert.equal(
    resolveRoute('evil.example', '/webinar-2026', config).kind,
    'not_found'
  );
  assert.equal(
    resolveRoute('flipkart.mash.example', '/nope', config).kind,
    'not_found'
  );
  assert.equal(
    resolveRoute('flipkart.mash.example', '/', config).kind,
    'not_found'
  );
  assert.equal(
    resolveRoute('flipkart.mash.example', '/webinar-2026/../x', config).kind,
    'not_found'
  );
  assert.equal(
    resolveRoute('flipkart.mash.example', '/webinar-2026/api', config).kind,
    'not_found'
  );
});

test('hosts are normalised: case, port, trailing dot', () => {
  assert.equal(
    normaliseHost('FlipKart.Mash.Example.:443'),
    'flipkart.mash.example'
  );
  assert.equal(
    resolveRoute('FLIPKART.mash.example:3000', '/webinar-2026', config).kind,
    'rewrite'
  );
});

test('the preview fallback is off unless enabled, and never on org hosts', () => {
  const path = '/_preview/flipkart/webinar-2026/agenda';
  assert.equal(resolveRoute('mash.example', path, config).kind, 'not_found');
  const preview = { ...config, previewFallback: true };
  assert.deepEqual(resolveRoute('mash.example', path, preview), {
    kind: 'rewrite',
    pathname: '/site/flipkart/webinar-2026/agenda',
    orgId: FLIPKART,
    eventId: WEBINAR,
  });
  assert.equal(
    resolveRoute('idh.mash.example', path, preview).kind,
    'not_found'
  );
});

test('health and cron endpoints pass through on any host', () => {
  assert.equal(
    resolveRoute('flipkart.mash.example', '/api/health', config).kind,
    'root'
  );
  assert.equal(
    resolveRoute('admin.mash.example', '/api/internal/keep-alive', config).kind,
    'root'
  );
});
