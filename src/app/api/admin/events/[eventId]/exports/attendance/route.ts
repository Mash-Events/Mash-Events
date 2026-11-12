import { z } from 'zod';
import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { storeExportFile } from '@core/db/privileged/exports';
import {
  buildRosterCsv,
  buildRosterExcel,
} from '@/lib/admin-roster-export.cjs';

// POST /api/admin/events/<eventId>/exports/attendance (docs/system-design.md
// §12.11, §9.2): the check-in list is written to the private bucket under
// <event_id>/exports/ and returned as a 10-minute signed URL. Audited with
// kind 'attendance' (format and count only — no PII in the audit row).

export const dynamic = 'force-dynamic';

const body = z
  .object({
    format: z.enum(['csv', 'xlsx']).default('csv'),
  })
  .strict();

const COLUMNS = [
  { key: 'event_day', label: 'Day' },
  { key: 'code', label: 'Code' },
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'method', label: 'Method' },
  { key: 'checked_in_at', label: 'Checked in' },
] as const;

export const POST = eventRoute(
  { permission: 'exports.pii', body },
  async ({ db, event, body }) => {
    const { data: rows, error } = await db
      .from('check_ins')
      .select(
        'event_day, method, created_at, registrations(code, first_name, last_name, email)'
      )
      .eq('event_id', event.id)
      .order('created_at', { ascending: true });
    if (error) throw rpcError(error);

    const records = (rows ?? []).map((row) => {
      const reg = (row.registrations ?? {}) as {
        code?: string;
        first_name?: string;
        last_name?: string;
        email?: string;
      };
      return {
        event_day: row.event_day,
        code: reg.code ?? '',
        first_name: reg.first_name ?? '',
        last_name: reg.last_name ?? '',
        email: reg.email ?? '',
        method: row.method,
        checked_in_at: new Date(row.created_at).toISOString(),
      };
    });

    const date = new Date().toISOString().slice(0, 10);
    if (body.format === 'xlsx') {
      const content = await buildRosterExcel(
        COLUMNS as unknown as { key: string; label: string }[],
        records,
        event.name
      );
      const stored = await storeExportFile(
        event.id,
        `attendance-${event.slug}-${date}.xlsx`,
        content,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const { error: auditError } = await db.rpc('record_export', {
        p_event_id: event.id,
        p_format: 'xlsx',
        p_count: records.length,
        p_kind: 'attendance',
      });
      if (auditError) throw rpcError(auditError);
      return { format: 'xlsx', count: records.length, ...stored };
    }

    if (records.length === 0) {
      throw new RouteError(
        409,
        'empty',
        'There is no check-in data to export yet.'
      );
    }
    const csv = buildRosterCsv(
      COLUMNS as unknown as { key: string; label: string }[],
      records
    );
    const stored = await storeExportFile(
      event.id,
      `attendance-${event.slug}-${date}.csv`,
      Buffer.from(csv, 'utf-8'),
      'text/csv'
    );
    const { error: auditError } = await db.rpc('record_export', {
      p_event_id: event.id,
      p_format: 'csv',
      p_count: records.length,
      p_kind: 'attendance',
    });
    if (auditError) throw rpcError(auditError);
    return { format: 'csv', count: records.length, ...stored };
  }
);
