import { eventRoute } from '@core/http/event-route';

// GET /api/admin/events/<eventId>/check-in — today's activity feed for the
// scanner screen (docs/system-design.md §9.2). RLS: checkin.scan on the pin.

export const dynamic = 'force-dynamic';

export const GET = eventRoute(
  { permission: 'checkin.scan' },
  async ({ db, event }) => {
    const today = new Date().toISOString().slice(0, 10);
    const [recent, counts] = await Promise.all([
      db
        .from('scan_log')
        .select(
          'outcome, reason, created_at, registrations(code, first_name, last_name)'
        )
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })
        .limit(15),
      db
        .from('check_ins')
        .select('event_day', { count: 'exact', head: true })
        .eq('event_id', event.id),
    ]);
    const total = counts.count ?? 0;
    return {
      eventId: event.id,
      today,
      totalCheckIns: total,
      recent: (recent.data ?? []).map((row) => {
        const reg = row.registrations as unknown as {
          code: string;
          first_name: string;
          last_name: string;
        } | null;
        return {
          outcome: row.outcome,
          reason: row.reason,
          created_at: row.created_at,
          code: reg?.code ?? null,
          name: reg ? `${reg.first_name} ${reg.last_name}`.trim() : null,
        };
      }),
    };
  }
);
