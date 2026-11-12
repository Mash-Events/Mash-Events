import { eventRoute, rpcError } from '@core/http/event-route';

// POST /api/admin/events/<eventId>/feedback/request (docs/system-design.md
// §16.4): queue a "please share feedback" email to every confirmed
// registration (messages.bulk). Idempotent per registration.

export const dynamic = 'force-dynamic';

export const POST = eventRoute(
  { permission: 'messages.bulk' },
  async ({ db, event }) => {
    const { data, error } = await db.rpc('request_feedback', {
      p_event_id: event.id,
    });
    if (error) throw rpcError(error);
    return data as { result: string; queued?: number };
  }
);
