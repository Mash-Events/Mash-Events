import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';
import { REGISTRATION_STATUSES } from '@core/registration/transitions';

// POST /api/admin/events/<eventId>/registrations/<registrationId>/status
// The RPC re-checks pin, permission and the allowed transition (§5.7, §7).

export const dynamic = 'force-dynamic';

const body = z
  .object({
    to: z.enum(REGISTRATION_STATUSES),
    reason: z.string().trim().max(500).optional(),
    expected_updated_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'registrations.review', body },
  async ({ db, event, body, params }) => {
    const registrationId = params.registrationId;
    if (!isUuid(registrationId)) throw new RouteError(404, 'not_found');

    const { data, error } = await db.rpc('transition_registration', {
      p_event_id: event.id,
      p_registration_id: registrationId,
      p_to: body.to,
      p_reason: body.reason ?? null,
      p_expected_updated_at: body.expected_updated_at ?? null,
    });
    if (error) throw rpcError(error);

    const result = data as {
      result: string;
      status: string;
      updated_at: string;
    };
    if (result.result === 'stale') {
      throw new RouteError(
        409,
        'stale',
        'This registration changed since you loaded it. Refresh and try again.'
      );
    }
    return { registrationId, ...result };
  }
);
