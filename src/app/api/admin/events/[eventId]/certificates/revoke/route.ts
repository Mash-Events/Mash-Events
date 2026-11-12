import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';

// POST /api/admin/events/<eventId>/certificates/revoke (docs/system-design.md
// §9.1 phase 3). The RPC checks certificates.manage for this event and
// revokes the certificate; the claim link and verify page stop working.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    certificateId: z.string().uuid(),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'certificates.manage', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('revoke_certificate', {
      p_event_id: event.id,
      p_certificate_id: body.certificateId,
    });
    if (error) throw rpcError(error);
    return data as { result: string };
  }
);
