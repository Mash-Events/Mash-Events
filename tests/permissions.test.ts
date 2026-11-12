import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissions,
  isPlatformAdmin,
  type Membership,
} from '../core/auth/permissions.ts';

// Roles and permissions (docs/system-design.md §6.5).

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const EVENT_A1 = { id: 'event-a1', orgId: ORG_A };
const EVENT_A2 = { id: 'event-a2', orgId: ORG_A };
const EVENT_B1 = { id: 'event-b1', orgId: ORG_B };

function member(partial: Partial<Membership>): Membership {
  return {
    scope: 'event',
    role: 'reviewer',
    org_id: ORG_A,
    event_id: EVENT_A1.id,
    revoked_at: null,
    ...partial,
  };
}

test('an event reviewer has access to that event only, even within the org', () => {
  const memberships = [member({})];
  assert.ok(
    effectivePermissions(memberships, EVENT_A1).has('registrations.review')
  );
  assert.equal(effectivePermissions(memberships, EVENT_A2).size, 0);
  assert.equal(effectivePermissions(memberships, EVENT_B1).size, 0);
});

test('an org admin covers every event of their org and none of another', () => {
  const memberships = [
    member({ scope: 'org', role: 'org_admin', event_id: null }),
  ];
  assert.ok(effectivePermissions(memberships, EVENT_A2).has('messages.bulk'));
  assert.equal(effectivePermissions(memberships, EVENT_B1).size, 0);
  assert.equal(
    effectivePermissions(memberships, EVENT_A1).has('members.manage'),
    false
  );
});

test('an event membership whose org does not match the event grants nothing', () => {
  const memberships = [member({ org_id: ORG_B })];
  assert.equal(effectivePermissions(memberships, EVENT_A1).size, 0);
});

test('revoked memberships grant nothing', () => {
  const revoked = [
    member({
      scope: 'platform',
      role: 'super_admin',
      org_id: null,
      event_id: null,
      revoked_at: '2026-11-09T00:00:00Z',
    }),
  ];
  assert.equal(effectivePermissions(revoked, EVENT_A1).size, 0);
  assert.equal(isPlatformAdmin(revoked), false);
});

test('check-in staff can only scan', () => {
  const memberships = [member({ role: 'checkin_staff' })];
  assert.deepEqual(
    [...effectivePermissions(memberships, EVENT_A1)],
    ['checkin.scan']
  );
});

test('the SQL role_permissions seed matches core/auth/permissions.ts', () => {
  const migrations = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(`supabase/migrations/${name}`, 'utf8'))
    .join('\n');
  // Later migrations may add permission rows; every insert counts.
  const inserts = migrations.match(
    /insert into public\.role_permissions[^;]*;/g
  );
  assert.ok(inserts?.length, 'role_permissions seed not found');
  const seed = new Set(
    inserts
      .flatMap((insert) => [...insert.matchAll(/\('(\w+)', '([\w.]+)'\)/g)])
      .map(([, role, permission]) => `${role}:${permission}`)
  );
  const code = new Set(
    Object.entries(ROLE_PERMISSIONS).flatMap(([role, permissions]) =>
      permissions.map((permission) => `${role}:${permission}`)
    )
  );
  assert.deepEqual([...seed].sort(), [...code].sort());
  for (const permissions of Object.values(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      assert.ok(PERMISSIONS.includes(permission));
    }
  }
});
