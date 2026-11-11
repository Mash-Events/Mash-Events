import 'server-only';
import { createAuthClient } from '../auth/server';

export type WorkspaceEvent = {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  /** Current pass signing key version (events.pass_key_version). */
  passKeyVersion: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

type EventRow = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  pass_key_version: number;
};

function toWorkspaceEvent(row: EventRow): WorkspaceEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    timezone: row.timezone,
    passKeyVersion: Number(row.pass_key_version ?? 1),
  };
}

/** Workspace URL /admin/o/<org>/e/<event> → event, if the user may see it. */
export async function loadEventBySlugs(
  orgSlug: string,
  eventSlug: string
): Promise<(WorkspaceEvent & { orgName: string; orgSlug: string }) | null> {
  const supabase = await createAuthClient();
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, org_id, slug, name, status, timezone, pass_key_version, organizations!inner(slug, name)'
    )
    .eq('slug', eventSlug)
    .eq('organizations.slug', orgSlug)
    .maybeSingle();
  if (error || !data) return null;
  const org = data.organizations as unknown as { slug: string; name: string };
  return {
    ...toWorkspaceEvent(data as EventRow),
    orgName: org.name,
    orgSlug: org.slug,
  };
}

/**
 * Loads an event the signed-in admin may see. RLS on `events` returns nothing
 * for events outside the user's memberships, so a foreign id is just "not
 * found" (§12.4).
 */
export async function loadVisibleEvent(
  eventId: string
): Promise<WorkspaceEvent | null> {
  if (!isUuid(eventId)) return null;
  const supabase = await createAuthClient();
  const { data, error } = await supabase
    .from('events')
    .select('id, org_id, slug, name, status, timezone, pass_key_version')
    .eq('id', eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    orgId: data.org_id,
    slug: data.slug,
    name: data.name,
    status: data.status,
    timezone: data.timezone,
    passKeyVersion: Number(data.pass_key_version ?? 1),
  };
}
