import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';
import { revalidateEventContent } from '@core/content/revalidate';

// POST /api/admin/events/<eventId>/announcements/hide — take an
// announcement off the site stripe (content.edit; audited in the RPC;
// revalidates the cached content).

export const dynamic = 'force-dynamic';

const body = z
  .object({
    announcementId: z.string().uuid(),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'content.edit', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('hide_announcement', {
      p_event_id: event.id,
      p_announcement_id: body.announcementId,
    });
    if (error) throw rpcError(error);
    revalidateEventContent(event.id);
    return data as { result: string };
  }
);
