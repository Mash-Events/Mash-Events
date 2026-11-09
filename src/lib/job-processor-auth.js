import { timingSafeEqual } from 'node:crypto';

// The Clerk admin-session fallback is removed: a manual
// "process now" from the admin goes through the event-scoped admin route
// wrapper instead (docs/system-design.md §12.4, §16.2). This module only
// authorises cron/system callers that present the shared secret.

function secretsMatch(provided, configured) {
  const providedBuf = Buffer.from(provided);
  const configuredBuf = Buffer.from(configured);
  if (providedBuf.length !== configuredBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, configuredBuf);
}

function buildSystemProcessorOperator() {
  return {
    authorized: true,
    userId: 'system-job-processor',
    primaryEmail: 'system-job-processor@local',
    displayName: 'System Job Processor',
  };
}

export async function authorizeJobProcessorRequest(request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get('authorization') || '';
  const providedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (configuredSecret && secretsMatch(providedSecret, configuredSecret)) {
    return {
      ok: true,
      operator: buildSystemProcessorOperator(),
      internal: true,
    };
  }

  return {
    ok: false,
    response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
  };
}
