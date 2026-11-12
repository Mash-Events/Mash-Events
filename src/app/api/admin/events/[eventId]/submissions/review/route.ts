import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';

// POST /api/admin/events/<eventId>/submissions/review (docs/system-design.md
// §16.4 phase 3). The RPC checks submissions.review for this event, moves
// the inbox status and audits it.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    submissionId: z.string().uuid(),
    status: z.enum(['new', 'in_review', 'done']),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'submissions.review', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('review_submission', {
      p_event_id: event.id,
      p_submission_id: body.submissionId,
      p_status: body.status,
    });
    if (error) throw rpcError(error);
    return data as { result: string };
  }
);
