import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { REGISTRATION_STATUSES } from '@core/registration/transitions';

// GET/POST /api/admin/events/<eventId>/messages — bulk and scheduled email
// (docs/system-design.md §12.11). POST creates a preview (the selection is
// frozen); sending needs a test send and a typed confirmation.

export const dynamic = 'force-dynamic';

export const GET = eventRoute(
  { permission: 'messages.bulk' },
  async ({ db }) => {
    const { data: intents, error } = await db
      .from('bulk_action_intents')
      .select(
        'id, audience, subject, include_join_link, send_at, count, status, tested_at, created_at, confirmed_at, executed_at, expires_at, job_id'
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new RouteError(500, 'server_error');

    const jobIds = (intents ?? []).map((i) => i.job_id).filter(Boolean);
    const progress: Record<string, Record<string, number>> = {};
    if (jobIds.length) {
      const { data: items } = await db
        .from('message_job_items')
        .select('job_id, status')
        .in('job_id', jobIds);
      for (const item of items ?? []) {
        progress[item.job_id] ??= {};
        progress[item.job_id][item.status] =
          (progress[item.job_id][item.status] ?? 0) + 1;
      }
    }
    return {
      messages: (intents ?? []).map((intent) => ({
        ...intent,
        progress: intent.job_id ? (progress[intent.job_id] ?? {}) : null,
      })),
    };
  }
);

const draft = z
  .object({
    audience: z.array(z.enum(REGISTRATION_STATUSES)).min(1).max(5),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
    include_join_link: z.boolean().default(false),
    send_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'messages.bulk', body: draft },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('create_message_intent', {
      p_event_id: event.id,
      p_audience: [...new Set(body.audience)],
      p_subject: body.subject,
      p_body: body.body,
      p_include_join_link: body.include_join_link,
      p_send_at: body.send_at ?? null,
    });
    if (error) throw rpcError(error);
    return { preview: data };
  }
);
