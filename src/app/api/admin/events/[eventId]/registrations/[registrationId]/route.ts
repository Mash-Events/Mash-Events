import { eventRoute, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';

// GET /api/admin/events/<eventId>/registrations/<registrationId>
// Through the event-pinned client: another event's id is simply not found.

export const dynamic = 'force-dynamic';

export const GET = eventRoute(
  { permission: 'registrations.read' },
  async ({ db, params }) => {
    const registrationId = params.registrationId;
    if (!isUuid(registrationId)) throw new RouteError(404, 'not_found');
    const { data, error } = await db
      .from('registrations')
      .select(
        'id, code, first_name, last_name, email, organisation, category, phone_e164, whatsapp_opt_in_at, answers, status, status_changed_at, source, consent_at, consent_version, created_at, updated_at'
      )
      .eq('id', registrationId)
      .maybeSingle();
    if (error) throw new RouteError(500, 'server_error');
    if (!data) throw new RouteError(404, 'not_found');
    return { registration: data };
  }
);
