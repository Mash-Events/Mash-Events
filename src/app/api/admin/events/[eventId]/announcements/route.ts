import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';
import { revalidateEventContent } from '@core/content/revalidate';

// GET/POST /api/admin/events/<eventId>/announcements (docs/system-design.md
// §10.1): the admin publishes short status posts; the latest appear as a
// stripe under the event site's hero. content.edit both ways. Publishing
// revalidates the event's cached content so the stripe appears at once.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    body: z.string().trim().min(1).max(500),
    level: z.enum(['info', 'highlight']).default('info'),
  })
  .strict();

export const GET = eventRoute(
  { permission: 'content.edit', write: false },
  async ({ db, event }) => {
    const { data, error } = await db
      .from('event_announcements')
      .select('id, body, level, status, published_at')
      .eq('event_id', event.id)
      .order('published_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return { announcements: data ?? [] };
  }
);

export const POST = eventRoute(
  { permission: 'content.edit', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('publish_announcement', {
      p_event_id: event.id,
      p_body: body.body,
      p_level: body.level,
    });
    if (error) throw rpcError(error);
    revalidateEventContent(event.id);
    return data as { result: string; id: string };
  }
);
