import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';

// POST /api/admin/events/<eventId>/check-in/spot (docs/system-design.md
// §16.4: walk-up registration at the gate). The RPC checks
// registrations.review for this event, creates the spot registration
// confirmed, checks it in for today and audits it. No emails are queued.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().max(100).default(''),
    email: z
      .string()
      .trim()
      .max(320)
      .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
      .optional(),
    organisation: z.string().trim().max(200).optional(),
  })
  .strict();

export const POST = eventRoute(
  { permission: 'registrations.review', body },
  async ({ db, event, body }) => {
    const { data, error } = await db.rpc('create_spot_registration', {
      p_event_id: event.id,
      p_first_name: body.first_name,
      p_last_name: body.last_name,
      p_email: body.email ?? null,
      p_organisation: body.organisation ?? null,
    });
    if (error) throw rpcError(error);
    return data as { result: string; code: string; registration_id: string };
  }
);
