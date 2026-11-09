import { z } from 'zod';
import { eventRoute, rpcError } from '@core/http/event-route';

// GET/PATCH /api/admin/events/<eventId> — event settings (events.manage).
// PATCH is allowed on archived events so a super admin can unarchive; the
// update_event RPC re-checks permission and writes the audit row.

export const dynamic = 'force-dynamic';

const STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'live',
  'completed',
  'archived',
] as const;

const dateTime = z.string().datetime({ offset: true }).nullable();

const changes = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(STATUSES).optional(),
    starts_at: dateTime.optional(),
    ends_at: dateTime.optional(),
    registration_opens_at: dateTime.optional(),
    registration_closes_at: dateTime.optional(),
    capacity: z.number().int().positive().max(1_000_000).nullable().optional(),
    waitlist_enabled: z.boolean().optional(),
    review_mode: z.enum(['manual', 'auto_confirm']).optional(),
  })
  .strict();

const FIELDS =
  'id, slug, name, kind, status, timezone, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, waitlist_enabled, review_mode';

export const GET = eventRoute(
  { permission: 'events.manage' },
  async ({ db, event }) => {
    const { data, error } = await db
      .from('events')
      .select(FIELDS)
      .eq('id', event.id)
      .single();
    if (error) throw rpcError(error);
    return { event: data };
  }
);

export const PATCH = eventRoute(
  { permission: 'events.manage', body: changes, write: false },
  async ({ db, event, body }) => {
    const { error } = await db.rpc('update_event', {
      p_event_id: event.id,
      p_changes: body,
    });
    if (error) throw rpcError(error);
    const { data } = await db
      .from('events')
      .select(FIELDS)
      .eq('id', event.id)
      .single();
    return { event: data };
  }
);
