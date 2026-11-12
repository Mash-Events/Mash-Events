import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { storeExportFile } from '@core/db/privileged/exports';
import {
  buildRosterCsv,
  buildRosterExcel,
} from '@/lib/admin-roster-export.cjs';

// POST /api/admin/events/<eventId>/exports/submissions (docs/system-design.md
// §12.11, §16.4): the submissions inbox is written to the private bucket
// under <event_id>/exports/ and returned as a 10-minute signed URL. Every
// export is audited (format, count and kind only — no PII in the audit row).

export const dynamic = 'force-dynamic';

const body = z
  .object({
    format: z.enum(['csv', 'xlsx']).default('csv'),
  })
  .strict();

const COLUMNS = [
  { key: 'received_at', label: 'Received' },
  { key: 'kind', label: 'Kind' },
  { key: 'status', label: 'Status' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'message', label: 'Message' },
  { key: 'details', label: 'Details' },
] as const;

export const POST = eventRoute(
  { permission: 'exports.pii', body },
  async ({ db, event, body }) => {
    const { data: rows, error } = await db
      .from('event_submissions')
      .select('kind, name, email, message, payload, status, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true });
    if (error) throw rpcError(error);

    const records = (rows ?? []).map((row) => ({
      received_at: new Date(row.created_at).toISOString(),
      kind: row.kind,
      status: row.status,
      name: row.name,
      email: row.email,
      message: row.message,
      details:
        row.payload && Object.keys(row.payload).length
          ? JSON.stringify(row.payload)
          : '',
    }));

    const date = new Date().toISOString().slice(0, 10);
    if (body.format === 'xlsx') {
      const content = await buildRosterExcel(
        COLUMNS as unknown as { key: string; label: string }[],
        records,
        event.name
      );
      const stored = await storeExportFile(
        event.id,
        `submissions-${event.slug}-${date}.xlsx`,
        content,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const { error: auditError } = await db.rpc('record_export', {
        p_event_id: event.id,
        p_format: 'xlsx',
        p_count: records.length,
        p_kind: 'submissions',
      });
      if (auditError) throw rpcError(auditError);
      return { format: 'xlsx', count: records.length, ...stored };
    }

    if (records.length === 0) {
      throw new RouteError(
        409,
        'empty',
        'There are no submissions to export yet.'
      );
    }
    const csv = buildRosterCsv(
      COLUMNS as unknown as { key: string; label: string }[],
      records
    );
    const stored = await storeExportFile(
      event.id,
      `submissions-${event.slug}-${date}.csv`,
      Buffer.from(csv, 'utf-8'),
      'text/csv'
    );
    const { error: auditError } = await db.rpc('record_export', {
      p_event_id: event.id,
      p_format: 'csv',
      p_count: records.length,
      p_kind: 'submissions',
    });
    if (auditError) throw rpcError(auditError);
    return { format: 'csv', count: records.length, ...stored };
  }
);
