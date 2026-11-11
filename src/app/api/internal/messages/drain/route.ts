import { authorizeJobProcessorRequest } from '@/lib/job-processor-auth';
import { drainEmail, drainWhatsapp } from '@core/messaging/drain';
import { eventPublicUrl } from '@sites/urls';

// GET /api/internal/messages/drain — cron fallback for queued/retrying
// email and WhatsApp (docs/system-design.md §8, §8.1). New items are also
// drained right after the request that created them (see kickEmailDrain).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await authorizeJobProcessorRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const email = await drainEmail({
      eventUrl: eventPublicUrl,
      budgetMs: 40_000,
    });
    const whatsapp = await drainWhatsapp({
      eventUrl: eventPublicUrl,
      budgetMs: 15_000,
    });
    return Response.json({ ok: true, email, whatsapp });
  } catch (error) {
    console.error('email drain failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
