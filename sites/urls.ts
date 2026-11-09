import { orgs } from './registry';

/** Public URL of an event page, from the org's first registered host. */
export function eventPublicUrl(
  orgId: string,
  eventSlug: string
): string | null {
  const host = orgs.find((org) => org.id === orgId)?.hosts[0];
  if (!host) return null;
  const local = host === 'localhost' || host.endsWith('.localhost');
  return `${local ? 'http' : 'https'}://${host}${local ? ':3000' : ''}/${eventSlug}`;
}
