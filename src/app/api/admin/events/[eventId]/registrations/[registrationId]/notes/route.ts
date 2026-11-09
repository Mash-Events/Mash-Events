import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';

// GET/POST /api/admin/events/<eventId>/registrations/<registrationId>/notes

export const dynamic = 'force-dynamic';

export const GET = eventRoute(
  { permission: 'registrations.read' },
  async ({ db, params }) => {
    const registrationId = params.registrationId;
    if (!isUuid(registrationId)) throw new RouteError(404, 'not_found');
    const [notes, history] = await Promise.all([
      db
        .from('review_notes')
        .select('id, body, author_user_id, created_at')
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: false }),
      db
        .from('registration_status_history')
        .select('from_status, to_status, reason, actor_user_id, created_at')
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: false }),
    ]);
    if (notes.error || history.error) throw new RouteError(500, 'server_error');
    return { registrationId, notes: notes.data, history: history.data };
  }
);

export const POST = eventRoute(
  {
    permission: 'registrations.review',
    body: z.object({ body: z.string().trim().min(1).max(2000) }).strict(),
  },
  async ({ db, event, body, params }) => {
    const registrationId = params.registrationId;
    if (!isUuid(registrationId)) throw new RouteError(404, 'not_found');
    const { data, error } = await db.rpc('add_review_note', {
      p_event_id: event.id,
      p_registration_id: registrationId,
      p_body: body.body,
    });
    if (error) throw rpcError(error);
    return { registrationId, noteId: data };
  }
);
