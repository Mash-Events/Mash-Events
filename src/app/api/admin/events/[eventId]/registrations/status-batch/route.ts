import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';
import { REGISTRATION_STATUSES } from '@core/registration/transitions';
import { kickEmailDrain } from '@/lib/kick-email-drain';

// POST /api/admin/events/<eventId>/registrations/status-batch
// Bulk review (the TASI admin pattern, ported): one request from the
// browser, the server walks the same audited transition_registration RPC
// per registration, so every row keeps its own status-machine check,
// history row, email enqueue and audit_log entry with the real admin as
// the actor (§5.7). No new SQL surface.

export const dynamic = 'force-dynamic';

const MAX_BATCH = 200;

const body = z
  .object({
    ids: z.array(z.string()).min(1).max(MAX_BATCH),
    to: z.enum(REGISTRATION_STATUSES),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

type TransitionResult = {
  result: string;
  status: string;
  updated_at: string;
};

export const POST = eventRoute(
  { permission: 'registrations.review', body },
  async ({ db, event, body }) => {
    const ids = [...new Set(body.ids)].filter(isUuid);
    if (!ids.length) throw new RouteError(400, 'invalid_ids');

    const rows: {
      registrationId: string;
      result: 'updated' | 'skipped' | 'error';
      status?: string;
      error?: string;
    }[] = [];
    let changed = 0;

    for (const registrationId of ids) {
      try {
        const { data, error } = await db.rpc('transition_registration', {
          p_event_id: event.id,
          p_registration_id: registrationId,
          p_to: body.to,
          p_reason: body.reason ?? null,
          p_expected_updated_at: null,
        });
        if (error) throw rpcError(error);
        const result = data as TransitionResult;
        // 'unchanged' means the row already had the target status: skip,
        // not an error — matches the single-row UI's friendly behaviour.
        if (result.result === 'unchanged' || result.result === 'updated') {
          rows.push({
            registrationId,
            result: result.result === 'updated' ? 'updated' : 'skipped',
            status: result.status,
          });
          if (result.result === 'updated') changed += 1;
        } else {
          rows.push({ registrationId, result: 'error', error: result.result });
        }
      } catch (error) {
        // One bad row must not abort the batch: record it, keep going.
        rows.push({
          registrationId,
          result: 'error',
          error:
            error instanceof RouteError || error instanceof Error
              ? error.message.slice(0, 200)
              : 'failed',
        });
      }
    }

    if (changed > 0) kickEmailDrain(event.id);
    return {
      requested: ids.length,
      changed,
      skipped: rows.filter((r) => r.result === 'skipped').length,
      failed: rows.filter((r) => r.result === 'error').length,
      rows,
    };
  }
);
