import 'server-only';
import { after } from 'next/server';
import { drainEmail } from '@core/messaging/drain';
import { eventPublicUrl } from '@sites/urls';

/**
 * After the response is sent, drain this event's email queue so the
 * acknowledgement or decision email goes out within seconds. Failures stay
 * queued for the cron drain.
 */
export function kickEmailDrain(eventId: string) {
  after(async () => {
    try {
      await drainEmail({
        eventUrl: eventPublicUrl,
        onlyEventId: eventId,
        budgetMs: 15_000,
      });
    } catch (error) {
      console.error('post-response email drain failed', {
        eventId,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  });
}
