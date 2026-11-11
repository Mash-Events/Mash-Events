import 'server-only';
import { after } from 'next/server';
import { drainEmail, drainWhatsapp } from '@core/messaging/drain';
import { eventPublicUrl } from '@sites/urls';

/**
 * After the response is sent, drain this event's email (and WhatsApp, when
 * the channel is configured) so the acknowledgement or decision goes out
 * within seconds. Failures stay queued for the cron drain.
 */
export function kickEmailDrain(eventId: string) {
  after(async () => {
    try {
      await drainEmail({
        eventUrl: eventPublicUrl,
        onlyEventId: eventId,
        budgetMs: 15_000,
      });
      await drainWhatsapp({
        eventUrl: eventPublicUrl,
        onlyEventId: eventId,
        budgetMs: 10_000,
      });
    } catch (error) {
      console.error('post-response email drain failed', {
        eventId,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  });
}
