import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';
import { getAdminUserFresh } from '@core/auth/server';
import { kickEmailDrain } from '@/lib/kick-email-drain';

// POST /api/admin/events/<eventId>/messages/<intentId>/confirm
// Typed event name + unchanged selection + prior test send (§12.11 step 3).

export const dynamic = 'force-dynamic';

export const POST = eventRoute(
  {
    permission: 'messages.bulk',
    body: z
      .object({
        typed_name: z.string().trim().min(1).max(200),
        selection_hash: z.string().regex(/^[0-9a-f]{32}$/),
      })
      .strict(),
  },
  async ({ db, event, body, params }) => {
    const intentId = params.intentId;
    if (!isUuid(intentId)) throw new RouteError(404, 'not_found');
    // A revoked session must not be able to send to a whole list (§6.4).
    if (!(await getAdminUserFresh()))
      throw new RouteError(401, 'unauthenticated');

    const { data, error } = await db.rpc('confirm_message_intent', {
      p_event_id: event.id,
      p_intent_id: intentId,
      p_typed_name: body.typed_name,
      p_selection_hash: body.selection_hash,
    });
    if (error) {
      if (error.code === '23514') {
        throw new RouteError(409, 'not_allowed', error.message);
      }
      throw rpcError(error);
    }
    const result = data as { result: string };
    if (result.result === 'queued') kickEmailDrain(event.id);
    return { intentId, ...result };
  }
);
