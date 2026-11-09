import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getMyMemberships } from '../auth/server';
import { effectivePermissions, type Permission } from '../auth/permissions';
import { loadEventBySlugs } from '../db/events';

// Resolves /admin/o/<org>/e/<event> for one request (§12.4: the event is in
// the URL of every admin page; nothing comes from session state).

export const loadWorkspace = cache(
  async (orgSlug: string, eventSlug: string) => {
    const event = await loadEventBySlugs(orgSlug, eventSlug);
    if (!event) notFound();
    const permissions = effectivePermissions(await getMyMemberships(), {
      id: event.id,
      orgId: event.orgId,
    });
    if (permissions.size === 0) notFound();
    return { event, permissions: [...permissions] as Permission[] };
  }
);

/** A stable, distinct colour per event so staff can tell workspaces apart. */
export function eventColour(eventId: string): string {
  let hash = 0;
  for (const char of eventId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 65% 42%)`;
}
