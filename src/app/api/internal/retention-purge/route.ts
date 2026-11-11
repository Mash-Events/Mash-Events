import { authorizeJobProcessorRequest } from '@/lib/job-processor-auth';
import { purgeDueEventData } from '@core/db/privileged/retention';

// GET /api/internal/retention-purge — daily cron (docs/system-design.md §13):
// attendee data past the event's retention window is deleted; the audit log
// is append-only and stays. Backups expire after 14 days, so purged data is
// gone from them too (S21).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await authorizeJobProcessorRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const report = await purgeDueEventData(50);
    return Response.json({ ok: true, ...report });
  } catch (error) {
    console.error('retention purge failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
