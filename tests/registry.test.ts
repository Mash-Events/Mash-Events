import test from 'node:test';
import assert from 'node:assert/strict';

// The registry is compiled into the proxy; mistakes here would route traffic
// to the wrong event (docs/system-design.md §4.2).

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadRegistry(env: string) {
  process.env.MASH_ENV = env;
  return import(`../sites/registry.ts?env=${env}`);
}

test('hosts, org slugs, event ids and per-org event slugs are unique and valid', async () => {
  const { orgs } = await loadRegistry('development');
  const hosts = orgs.flatMap((o: { hosts: string[] }) => o.hosts);
  assert.equal(new Set(hosts).size, hosts.length, 'duplicate host');
  const orgSlugs = orgs.map((o: { slug: string }) => o.slug);
  assert.equal(new Set(orgSlugs).size, orgSlugs.length, 'duplicate org slug');
  const eventIds: string[] = [];
  for (const org of orgs) {
    assert.match(org.id, UUID);
    for (const host of org.hosts) assert.equal(host, host.toLowerCase());
    const slugs = org.events.map((e: { slug: string }) => e.slug);
    assert.equal(
      new Set(slugs).size,
      slugs.length,
      `duplicate slug in ${org.slug}`
    );
    for (const event of org.events) {
      assert.match(event.id, UUID);
      eventIds.push(event.id);
    }
  }
  assert.equal(new Set(eventIds).size, eventIds.length, 'duplicate event id');
});

test('the demo org is never part of the production registry', async () => {
  const { orgs, DEMO_ORG_ID } = await loadRegistry('production');
  assert.equal(
    orgs.some((o: { id: string }) => o.id === DEMO_ORG_ID),
    false
  );
});
