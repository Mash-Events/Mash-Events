import { platformRoute, platformRpcError } from '@core/http/platform-route';
import { RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';

// POST /api/admin/platform/members/<membershipId>/revoke — takes effect on
// the member's next request, because RLS reads memberships live (§6.4).

export const dynamic = 'force-dynamic';

export const POST = platformRoute({}, async ({ db, actor, params }) => {
  const membershipId = params.membershipId;
  if (!isUuid(membershipId)) throw new RouteError(404, 'not_found');
  const { data: own } = await db
    .from('memberships')
    .select('user_id, scope')
    .eq('id', membershipId)
    .maybeSingle();
  if (own?.user_id === actor.userId && own.scope === 'platform') {
    throw new RouteError(
      400,
      'self_revoke',
      'You cannot remove your own super admin access.'
    );
  }
  const { error } = await db.rpc('revoke_membership', {
    p_membership_id: membershipId,
  });
  if (error) throw platformRpcError(error);
  return { revoked: membershipId };
});
