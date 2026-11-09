// Host + path → routing decision (docs/system-design.md §4.2).
// Pure function: no Next.js imports, so it is unit-tested directly and used by
// src/proxy.ts. The public event is only ever chosen from host + slug here,
// never from anything the client sends.

export type RegistryEvent = { id: string; slug: string };
export type RegistryOrg = {
  id: string;
  slug: string;
  hosts: readonly string[];
  events: readonly RegistryEvent[];
};

export type RoutingConfig = {
  /** Hosts that serve the admin console, auth pages and admin APIs. */
  adminHosts: readonly string[];
  /** Hosts that serve the studio landing page (root domain, localhost). */
  rootHosts: readonly string[];
  /** Enables /_preview/<org>/<event>/... (never in production). */
  previewFallback: boolean;
  orgs: readonly RegistryOrg[];
};

export type RouteDecision =
  | { kind: 'not_found' }
  | { kind: 'root' }
  | { kind: 'admin'; requiresSession: boolean }
  | {
      kind: 'rewrite';
      /** Internal path to render, e.g. /site/<org>/<event>/agenda. */
      pathname: string;
      orgId: string;
      eventId: string;
    };

// Internal-only path prefixes: never reachable directly from outside.
const INTERNAL_PREFIXES = ['/site', '/api/public', '/_preview'];
// Admin-only prefixes: only on an admin host.
const ADMIN_PREFIXES = ['/admin', '/auth', '/api/admin'];
// Admin paths that do not need a signed-in session.
const ADMIN_PUBLIC_PREFIXES = ['/auth'];
// Paths any host may serve (health checks, cron).
const SHARED_PREFIXES = ['/api/health', '/api/internal'];

function hasPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function hasAnyPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => hasPrefix(pathname, prefix));
}

export function normaliseHost(host: string | null | undefined): string {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function eventRewrite(
  org: RegistryOrg,
  slug: string,
  rest: string[]
): RouteDecision {
  const event = org.events.find((candidate) => candidate.slug === slug);
  if (!event) return { kind: 'not_found' };

  // /<event>/api/<x> → /api/public/events/<eventId>/<x>
  if (rest[0] === 'api') {
    const apiRest = rest.slice(1);
    if (apiRest.length === 0) return { kind: 'not_found' };
    return {
      kind: 'rewrite',
      pathname: `/api/public/events/${event.id}/${apiRest.join('/')}`,
      orgId: org.id,
      eventId: event.id,
    };
  }

  const tail = rest.length ? `/${rest.join('/')}` : '';
  return {
    kind: 'rewrite',
    pathname: `/site/${org.slug}/${event.slug}${tail}`,
    orgId: org.id,
    eventId: event.id,
  };
}

function splitPath(pathname: string): string[] | null {
  const parts = pathname.split('/').filter(Boolean);
  // Reject traversal and encoded separators outright.
  for (const part of parts) {
    if (part === '.' || part === '..' || /%2f|%5c/i.test(part)) return null;
  }
  return parts;
}

export function resolveRoute(
  hostHeader: string | null | undefined,
  pathname: string,
  config: RoutingConfig
): RouteDecision {
  const host = normaliseHost(hostHeader);
  const parts = splitPath(pathname);
  if (!host || parts === null) return { kind: 'not_found' };

  if (hasAnyPrefix(pathname, SHARED_PREFIXES)) return { kind: 'root' };

  // Admin host: only admin paths. Public and internal paths are 404.
  if (config.adminHosts.includes(host)) {
    if (hasAnyPrefix(pathname, ADMIN_PUBLIC_PREFIXES)) {
      return { kind: 'admin', requiresSession: false };
    }
    if (hasAnyPrefix(pathname, ADMIN_PREFIXES)) {
      return { kind: 'admin', requiresSession: true };
    }
    if (pathname === '/') return { kind: 'admin', requiresSession: true };
    return { kind: 'not_found' };
  }

  // Admin and internal paths are never served on any other host.
  if (
    hasAnyPrefix(pathname, ADMIN_PREFIXES) ||
    (hasAnyPrefix(pathname, INTERNAL_PREFIXES) &&
      !(config.previewFallback && hasPrefix(pathname, '/_preview')))
  ) {
    return { kind: 'not_found' };
  }

  // Org host: first segment is the event slug.
  const org = config.orgs.find((candidate) => candidate.hosts.includes(host));
  if (org) {
    const [slug, ...rest] = parts;
    if (!slug || !SLUG.test(slug)) return { kind: 'not_found' };
    return eventRewrite(org, slug, rest);
  }

  // Root/studio host (and preview deployments).
  if (config.rootHosts.includes(host)) {
    if (config.previewFallback && parts[0] === '_preview') {
      const [, orgSlug, eventSlug, ...rest] = parts;
      const previewOrg = config.orgs.find((o) => o.slug === orgSlug);
      if (!previewOrg || !eventSlug) return { kind: 'not_found' };
      return eventRewrite(previewOrg, eventSlug, rest);
    }
    return { kind: 'root' };
  }

  return { kind: 'not_found' };
}

export function parseHostList(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => normaliseHost(entry))
    .filter(Boolean);
}
