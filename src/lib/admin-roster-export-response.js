import rosterExport from '@/lib/admin-roster-export.cjs';
import { ADMIN_NO_STORE_HEADERS } from '@/lib/admin-api-cache';
import { recordExportAuditEvent } from '@/lib/admin-audit';

const { buildRosterCsv, buildRosterExcel } = rosterExport;

export async function rosterExportResponse({
  operator,
  format,
  columns,
  rows,
  basename,
  sheetName,
}) {
  const isExcel = format === 'xlsx';
  const file = isExcel
    ? await buildRosterExcel(columns, rows, sheetName)
    : buildRosterCsv(columns, rows);
  await recordExportAuditEvent(operator, basename, {
    format,
    rows: rows.length,
  });
  return new Response(file, {
    headers: {
      ...ADMIN_NO_STORE_HEADERS,
      'Content-Disposition': `attachment; filename="${basename}.${format}"`,
      'Content-Type': isExcel
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8',
      'X-Export-Row-Count': String(rows.length),
    },
  });
}
