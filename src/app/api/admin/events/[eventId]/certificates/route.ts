import { eventRoute } from '@core/http/event-route';

// GET /api/admin/events/<eventId>/certificates (docs/system-design.md §9.1
// phase 3): the issued-certificate list for the admin tab. RLS pins the read
// to this event; the join adds the attendee name.

export const dynamic = 'force-dynamic';

export type CertificateRow = {
  id: string;
  code: string;
  status: string;
  issued_at: string;
  revoked_at: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export const GET = eventRoute(
  { permission: 'certificates.manage', write: false },
  async ({ db, event }) => {
    const { data, error } = await db
      .from('event_certificates')
      .select(
        'id, code, status, issued_at, revoked_at, registrations(first_name, last_name, email)'
      )
      .eq('event_id', event.id)
      .order('issued_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const rows: CertificateRow[] = (data ?? []).map(
      (row: Record<string, unknown>) => {
        const reg = (row.registrations ?? {}) as Record<string, string | null>;
        return {
          id: row.id as string,
          code: row.code as string,
          status: row.status as string,
          issued_at: row.issued_at as string,
          revoked_at: (row.revoked_at as string | null) ?? null,
          first_name: reg.first_name ?? null,
          last_name: reg.last_name ?? null,
          email: reg.email ?? null,
        };
      }
    );
    return { certificates: rows };
  }
);
