// Roles and permissions (docs/system-design.md §6.5). This table is mirrored
// by the `role_permissions` seed in supabase/migrations; a test asserts both
// stay identical. Postgres (`app.has_event_permission`) and the app
// (`effectivePermissions`) apply the same rules.

export const ROLES = [
  'super_admin',
  'org_admin',
  'reviewer',
  'checkin_staff',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'events.manage',
  'members.manage',
  'content.edit',
  'registrations.read',
  'registrations.review',
  'messages.send',
  'messages.bulk',
  'exports.pii',
  'checkin.scan',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  org_admin: [
    'content.edit',
    'registrations.read',
    'registrations.review',
    'messages.send',
    'messages.bulk',
    'exports.pii',
    'checkin.scan',
    'audit.read',
  ],
  reviewer: ['registrations.read', 'registrations.review'],
  checkin_staff: ['checkin.scan'],
};

export type Membership = {
  scope: 'platform' | 'org' | 'event';
  role: Role;
  org_id: string | null;
  event_id: string | null;
  revoked_at: string | null;
};

export type EventRef = { id: string; orgId: string };

function covers(membership: Membership, event: EventRef): boolean {
  if (membership.revoked_at) return false;
  switch (membership.scope) {
    case 'platform':
      return true;
    case 'org':
      return membership.org_id === event.orgId;
    case 'event':
      return (
        membership.event_id === event.id && membership.org_id === event.orgId
      );
    default:
      return false;
  }
}

/** Union of permissions from every live membership that covers the event. */
export function effectivePermissions(
  memberships: readonly Membership[],
  event: EventRef
): Set<Permission> {
  const result = new Set<Permission>();
  for (const membership of memberships) {
    if (!covers(membership, event)) continue;
    for (const permission of ROLE_PERMISSIONS[membership.role] ?? []) {
      result.add(permission);
    }
  }
  return result;
}

export function isPlatformAdmin(memberships: readonly Membership[]): boolean {
  return memberships.some(
    (m) => !m.revoked_at && m.scope === 'platform' && m.role === 'super_admin'
  );
}
