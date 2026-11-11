import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';

// DELETE /api/admin/events/<eventId>/check-in/device/<deviceId> — revoke a
// scanner session (docs/system-design.md §12.7).

export const dynamic = 'force-dynamic';

export const DELETE = eventRoute(
  { permission: 'checkin.scan' },
  async ({ db, event, params }) => {
    const deviceId = params.deviceId;
    if (!isUuid(deviceId)) throw new RouteError(404, 'not_found');
    const { error } = await db.rpc('revoke_checkin_device', {
      p_event_id: event.id,
      p_device_id: deviceId,
    });
    if (error) throw rpcError(error);
    return { deviceId };
  }
);
