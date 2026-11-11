import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { passSecret, verifyPassToken } from '@core/passes/pass-token';
import { sha256Hex } from '@core/security/rate-limit';

// POST /api/admin/events/<eventId>/check-in/scan (docs/system-design.md
// §9.2, S14). The token is verified against THIS event's key here; the RPC
// re-checks the device secret, the pass row and the registration status.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    device_id: z.string().uuid(),
    device_secret: z.string().min(16).max(200),
    pass_token: z.string().min(10).max(400),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'checkin.scan', body },
  async ({ db, event, body }) => {
    const secret = passSecret();
    const passId = secret
      ? await verifyPassToken(
          secret,
          event.id,
          body.pass_token,
          event.passKeyVersion
        )
      : null;
    if (!passId) {
      return {
        result: 'pass_not_found',
        registration_code: null,
        name: null,
      };
    }

    const { data, error } = await db.rpc('record_check_in', {
      p_event_id: event.id,
      p_device_id: body.device_id,
      p_device_secret: body.device_secret,
      p_pass_id: passId,
      p_token_hash_hex: await sha256Hex(body.pass_token),
    });
    if (error) throw rpcError(error);
    const result = data as {
      result: string;
      registration_code?: string;
      name?: string;
    };
    if (result.result === 'device_rejected') {
      throw new RouteError(
        403,
        'device_rejected',
        'This scanner session was rejected. Start check-in again.'
      );
    }
    return result;
  }
);
