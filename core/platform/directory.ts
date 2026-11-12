import 'server-only';
import { unstable_cache } from 'next/cache';
import { getPrivilegedClient } from '../db/privileged/client';
import { directoryTag } from '../content/revalidate';

// The public events directory data for the platform's main domain
// (docs/system-design.md §16.4). Only events the org explicitly lists
// appear. Host/URL resolution is deliberately left to the caller — hosts
// live in the deployment's site registry, which core must not import.

export type DirectoryEvent = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  timezone: string;
  starts_at: string | null;
  org_id: string;
  org_name: string;
};

export type Directory = {
  upcoming: DirectoryEvent[];
  past: DirectoryEvent[];
};

async function fetchDirectory(): Promise<Directory> {
  const { data, error } = await getPrivilegedClient()
    .from('events')
    .select(
      'id, slug, name, kind, status, timezone, starts_at, organizations(id, name)'
    )
    .eq('listed', true)
    .neq('status', 'draft')
    .neq('status', 'archived')
    .order('starts_at', { ascending: true });
  if (error) throw error;

  const now = Date.now();
  const upcoming: DirectoryEvent[] = [];
  const past: DirectoryEvent[] = [];

  for (const row of data ?? []) {
    const org = row.organizations as unknown as {
      id: string;
      name: string;
    } | null;
    const item: DirectoryEvent = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      status: row.status,
      timezone: row.timezone,
      starts_at: row.starts_at,
      org_id: org?.id ?? '',
      org_name: org?.name ?? '',
    };
    if (row.starts_at && Date.parse(row.starts_at) < now) {
      past.push(item);
    } else {
      upcoming.push(item);
    }
  }

  past.reverse(); // most recent first
  return { upcoming, past };
}

export function getDirectory(): Promise<Directory> {
  return unstable_cache(fetchDirectory, ['platform', 'directory'], {
    tags: [directoryTag],
    revalidate: 300,
  })();
}
