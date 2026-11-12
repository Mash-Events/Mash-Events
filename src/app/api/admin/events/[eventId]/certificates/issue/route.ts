import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';

// POST /api/admin/events/<eventId>/certificates/issue (docs/system-design.md
// §9.1 phase 3). The RPC checks certificates.manage for this event, creates
// certificates idempotently for the audience and queues each new
// certificate's email through the standard pipeline. One audit row per call.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    audience: z.enum(['attended', 'confirmed']),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'certificates.manage', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('issue_certificates', {
      p_event_id: event.id,
      p_audience: body.audience,
    });
    if (error) throw rpcError(error);
    return data as { result: string; issued: number; skipped: number };
  }
);
