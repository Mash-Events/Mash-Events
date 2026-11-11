// In-code registry of organisations and events (docs/system-design.md §4.2).
// The proxy compiles this in, so host → event resolution needs no DB call.
// Event UUIDs come from the `events` table; the page loader re-checks that the
// row's org and slug match before rendering.

export type EventEntry = {
  /** UUID of the row in `events`. */
  id: string;
  /** URL slug under the org host: <org>.mash.example/<slug>. */
  slug: string;
};

export type OrgEntry = {
  /** UUID of the row in `organizations`. */
  id: string;
  slug: string;
  /** Hostnames that serve this org's events (production, staging, local). */
  hosts: readonly string[];
  events: readonly EventEntry[];
};

/** Real client organisations. Add one entry per org; events by UUID. */
const productionOrgs: readonly OrgEntry[] = [];

/** Local demo events (supabase/demo.sql). Never served in production. */
export const DEMO_ORG_ID = '0d6b6f5e-4a1c-4c3e-9a2b-6d3c1e7f8a10';
export const DEMO_EVENT_ID = '5f2c8e3a-7b4d-4e19-8c6a-2a9d4b7e1c35';
export const DEMO_SUMMIT_EVENT_ID = '9f8e7d6c-5b4a-4c3d-9e2f-1a2b3c4d5e6f';
const devOrgs: readonly OrgEntry[] = [
  {
    id: DEMO_ORG_ID,
    slug: 'demo',
    hosts: ['demo.localhost'],
    events: [
      { id: DEMO_EVENT_ID, slug: 'launch-webinar' },
      { id: DEMO_SUMMIT_EVENT_ID, slug: 'orbit-summit' },
    ],
  },
];

export const orgs: readonly OrgEntry[] =
  process.env.MASH_ENV === 'production'
    ? productionOrgs
    : [...productionOrgs, ...devOrgs];

export function findOrgByHost(host: string): OrgEntry | undefined {
  const normalised = host.toLowerCase().replace(/:\d+$/, '');
  return orgs.find((org) => org.hosts.includes(normalised));
}

export function findEvent(org: OrgEntry, slug: string): EventEntry | undefined {
  return org.events.find((event) => event.slug === slug);
}
