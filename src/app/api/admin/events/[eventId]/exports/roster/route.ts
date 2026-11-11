import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { storeExportFile } from '@core/db/privileged/exports';
import {
  buildRosterCsv,
  buildRosterExcel,
} from '@/lib/admin-roster-export.cjs';

// POST /api/admin/events/<eventId>/exports/roster (docs/system-design.md
// §12.11): the roster is written to the private bucket under
// <event_id>/exports/ and returned as a 10-minute signed URL. Every export
// is audited (format and count only — no PII in the audit row).

export const dynamic = 'force-dynamic';

const body = z
  .object({
    format: z.enum(['csv', 'xlsx']).default('csv'),
  })
  .strict();

const COLUMNS = [
  { key: 'code', label: 'Code' },
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'phone_e164', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
  { key: 'created_at', label: 'Registered' },
] as const;

export const POST = eventRoute(
  { permission: 'exports.pii', body },
  async ({ db, event, body }) => {
    const { data: rows, error } = await db
      .from('registrations')
      .select(
        'code, first_name, last_name, email, organisation, phone_e164, status, source, created_at'
      )
      .eq('event_id', event.id)
      .order('created_at', { ascending: true });
    if (error) throw rpcError(error);

    const records = rows ?? [];
    const stamped = records.map((row) => ({
      ...row,
      created_at: new Date(row.created_at).toISOString(),
    }));

    const date = new Date().toISOString().slice(0, 10);
    if (body.format === 'xlsx') {
      const content = await buildRosterExcel(
        COLUMNS as unknown as { key: string; label: string }[],
        stamped,
        event.name
      );
      const stored = await storeExportFile(
        event.id,
        `roster-${event.slug}-${date}.xlsx`,
        content,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const { error: auditError } = await db.rpc('record_export', {
        p_event_id: event.id,
        p_format: 'xlsx',
        p_count: records.length,
      });
      if (auditError) throw rpcError(auditError);
      return { format: 'xlsx', count: records.length, ...stored };
    }

    if (records.length === 0) {
      throw new RouteError(
        409,
        'empty',
        'There are no registrations to export yet.'
      );
    }
    const csv = buildRosterCsv(
      COLUMNS as unknown as { key: string; label: string }[],
      stamped
    );
    const stored = await storeExportFile(
      event.id,
      `roster-${event.slug}-${date}.csv`,
      Buffer.from(csv, 'utf-8'),
      'text/csv'
    );
    const { error: auditError } = await db.rpc('record_export', {
      p_event_id: event.id,
      p_format: 'csv',
      p_count: records.length,
    });
    if (auditError) throw rpcError(auditError);
    return { format: 'csv', count: records.length, ...stored };
  }
);
