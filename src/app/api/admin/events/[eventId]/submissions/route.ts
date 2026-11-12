import { eventRoute } from '@core/http/event-route';

// GET /api/admin/events/<eventId>/submissions (docs/system-design.md §16.4
// phase 3): the inbox list for the admin tab. RLS pins the read to this
// event.

export const dynamic = 'force-dynamic';

export type SubmissionRow = {
  id: string;
  kind: string;
  name: string;
  email: string;
  message: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

export const GET = eventRoute(
  { permission: 'submissions.review', write: false },
  async ({ db, event }) => {
    const { data, error } = await db
      .from('event_submissions')
      .select('id, kind, name, email, message, payload, status, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return { submissions: (data ?? []) as SubmissionRow[] };
  }
);
