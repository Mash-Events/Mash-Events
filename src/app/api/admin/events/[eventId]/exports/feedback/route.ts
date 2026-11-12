import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { storeExportFile } from '@core/db/privileged/exports';
import { buildRosterCsv } from '@/lib/admin-roster-export.cjs';

// POST /api/admin/events/<eventId>/exports/feedback (docs/system-design.md
// §12.11, §16.4): the feedback responses written to the private bucket and
// returned as a 10-minute signed URL. Audited with kind 'feedback'.

export const dynamic = 'force-dynamic';

const body = z
  .object({
    format: z.enum(['csv', 'xlsx']).default('csv'),
  })
  .strict();

const COLUMNS = [
  { key: 'submitted_at', label: 'Submitted' },
  { key: 'code', label: 'Registration code' },
  { key: 'name', label: 'Name' },
  { key: 'rating', label: 'Rating' },
  { key: 'answers', label: 'Answers' },
] as const;

export const POST = eventRoute(
  { permission: 'exports.pii', body },
  async ({ db, event, body }) => {
    const { data: rows, error } = await db
      .from('event_feedback_responses')
      .select(
        'rating, answers, submitted_at, registrations(code, first_name, last_name)'
      )
      .eq('event_id', event.id)
      .order('submitted_at', { ascending: true });
    if (error) throw rpcError(error);

    const records = (rows ?? []).map((row) => {
      const reg = (row.registrations ?? {}) as {
        code?: string;
        first_name?: string;
        last_name?: string;
      };
      return {
        submitted_at: new Date(row.submitted_at).toISOString(),
        code: reg.code ?? '',
        name: `${reg.first_name ?? ''} ${reg.last_name ?? ''}`.trim(),
        rating: row.rating ?? '',
        answers:
          row.answers && Object.keys(row.answers).length
            ? JSON.stringify(row.answers)
            : '',
      };
    });

    if (records.length === 0) {
      throw new RouteError(409, 'empty', 'There is no feedback to export yet.');
    }

    const date = new Date().toISOString().slice(0, 10);
    const csv = buildRosterCsv(
      COLUMNS as unknown as { key: string; label: string }[],
      records
    );
    const stored = await storeExportFile(
      event.id,
      `feedback-${event.slug}-${date}.csv`,
      Buffer.from(csv, 'utf-8'),
      'text/csv'
    );
    const { error: auditError } = await db.rpc('record_export', {
      p_event_id: event.id,
      p_format: 'csv',
      p_count: records.length,
      p_kind: 'feedback',
    });
    if (auditError) throw rpcError(auditError);
    return { format: 'csv', count: records.length, ...stored };
  }
);
