import { headers } from 'next/headers';
import { z } from 'zod';
import { platformRoute, platformRpcError } from '@core/http/platform-route';
import { RouteError } from '@core/http/event-route';
import {
  deleteInvitedUser,
  emailsForUsers,
  findOrInviteUser,
  recordInvite,
} from '@core/db/privileged/members';

// GET/POST /api/admin/platform/members — super admin only (§6.2).
// Uses the privileged module only for the Auth admin API (invite, emails);
// the membership itself is granted with the super admin's own session.

export const dynamic = 'force-dynamic';

export const GET = platformRoute({}, async ({ db }) => {
  const { data, error } = await db
    .from('memberships')
    .select(
      'id, user_id, scope, role, org_id, event_id, created_at, organizations(name), events(name)'
    )
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new RouteError(500, 'server_error');
  const emails = await emailsForUsers([
    ...new Set((data ?? []).map((m) => m.user_id as string)),
  ]);
  return {
    members: (data ?? []).map((m) => ({
      ...m,
      email: emails[m.user_id] ?? null,
    })),
  };
});

const invite = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    scope: z.enum(['platform', 'org', 'event']),
    role: z.enum(['super_admin', 'org_admin', 'reviewer', 'checkin_staff']),
    org_id: z.string().uuid().nullable().optional(),
    event_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const POST = platformRoute(
  { body: invite },
  async ({ db, actor, body }) => {
    const h = await headers();
    const host = h.get('host') ?? 'admin.localhost:3000';
    const proto =
      h.get('x-forwarded-proto') ??
      (host.includes('localhost') ? 'http' : 'https');
    const outcome = await findOrInviteUser(
      body.email,
      `${proto}://${host}/auth/confirm`
    );

    const { data, error } = await db.rpc('grant_membership', {
      p_user_id: outcome.userId,
      p_scope: body.scope,
      p_role: body.role,
      p_org_id: body.org_id ?? null,
      p_event_id: body.event_id ?? null,
    });
    if (error) {
      // Do not leave a freshly invited user without any membership.
      if (outcome.invited) await deleteInvitedUser(outcome.userId);
      if (error.code === '23505') {
        throw new RouteError(
          409,
          'exists',
          'This person already has that access.'
        );
      }
      if (error.code === '23514') {
        throw new RouteError(
          400,
          'invalid',
          'That role does not fit the chosen scope.'
        );
      }
      throw platformRpcError(error);
    }

    await recordInvite({
      email: body.email,
      scope: body.scope,
      role: body.role,
      orgId: body.org_id ?? null,
      eventId: body.event_id ?? null,
      invitedBy: actor.userId,
      userId: outcome.userId,
      invited: outcome.invited,
    });
    return { membershipId: data, invited: outcome.invited };
  }
);
