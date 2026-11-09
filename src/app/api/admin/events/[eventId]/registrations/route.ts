import { eventRoute, RouteError } from '@core/http/event-route';
import { REGISTRATION_STATUSES } from '@core/registration/transitions';

// GET /api/admin/events/<eventId>/registrations?status=&q=&page=
// Reads through the event-pinned client: RLS returns only this event's rows.

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export const GET = eventRoute(
  { permission: 'registrations.read' },
  async ({ db, event, request }) => {
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    // Search terms are limited to characters that cannot alter the filter.
    const q = (params.get('q') ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9@.+\- ]/g, '')
      .trim()
      .slice(0, 100);
    const page = Math.max(
      0,
      Number.parseInt(params.get('page') ?? '0', 10) || 0
    );

    let query = db
      .from('registrations')
      .select(
        'id, code, first_name, last_name, email, organisation, category, status, source, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (status) {
      if (!(REGISTRATION_STATUSES as readonly string[]).includes(status)) {
        throw new RouteError(400, 'invalid_status');
      }
      query = query.eq('status', status);
    }
    if (q) {
      query = query.or(
        `email.ilike.*${q}*,first_name.ilike.*${q}*,last_name.ilike.*${q}*,code.ilike.*${q}*`
      );
    }

    const [{ data, count, error }, summary] = await Promise.all([
      query,
      db.rpc('registration_summary', { p_event_id: event.id }),
    ]);
    if (error) throw new RouteError(500, 'server_error');

    return {
      registrations: data ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      summary: Object.fromEntries(
        (summary.data ?? []).map((row: { status: string; total: number }) => [
          row.status,
          Number(row.total),
        ])
      ),
    };
  }
);
