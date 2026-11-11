import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';

// POST /api/admin/events/<eventId>/check-in/device — the scanner screen
// creates its device session (docs/system-design.md §9.2, §12.7). The raw
// secret is generated in the browser and never sent: only its sha256 (hex).

export const dynamic = 'force-dynamic';

const body = z
  .object({
    label: z.string().trim().min(1).max(200),
    secret_hash: z.string().regex(/^[0-9a-f]{64}$/),
    expires_hours: z.number().int().min(1).max(48).optional(),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'checkin.scan', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('create_checkin_device', {
      p_event_id: event.id,
      p_label: body.label,
      p_device_secret_hash_hex: body.secret_hash,
      p_expires_hours: body.expires_hours ?? 12,
    });
    if (error) throw rpcError(error);
    return { deviceId: data as string };
  }
);
