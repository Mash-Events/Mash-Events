import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';

// POST /api/admin/events/<eventId>/messages/<intentId>/cancel
// Cancels a preview or a scheduled message before it is released.

export const dynamic = 'force-dynamic';

export const POST = eventRoute(
  { permission: 'messages.bulk' },
  async ({ db, event, params }) => {
    const intentId = params.intentId;
    if (!isUuid(intentId)) throw new RouteError(404, 'not_found');
    const { error } = await db.rpc('cancel_message_intent', {
      p_event_id: event.id,
      p_intent_id: intentId,
    });
    if (error) throw rpcError(error);
    return { intentId, cancelled: true };
  }
);
