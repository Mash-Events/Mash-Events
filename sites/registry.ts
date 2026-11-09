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

export const orgs: readonly OrgEntry[] = [];

export function findOrgByHost(host: string): OrgEntry | undefined {
  const normalised = host.toLowerCase().replace(/:\d+$/, '');
  return orgs.find((org) => org.hosts.includes(normalised));
}

export function findEvent(org: OrgEntry, slug: string): EventEntry | undefined {
  return org.events.find((event) => event.slug === slug);
}
