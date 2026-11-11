import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';

// POST /api/admin/events/<eventId>/check-in/manual (docs/system-design.md
// §9.2) — check in by badge code; the RPC checks permission, code and
// confirmation status itself.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    code: z.string().trim().min(4).max(40),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'checkin.scan', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('record_manual_check_in', {
      p_event_id: event.id,
      p_code: body.code,
    });
    if (error) throw rpcError(error);
    return data as {
      result: string;
      registration_code?: string;
      name?: string;
    };
  }
);
