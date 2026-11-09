import 'server-only';
import {
  claimMessageItems,
  eventsWithDueMessages,
  finishMessageItem,
  type ClaimedItem,
} from '../db/privileged/messaging';
import { renderEmail } from './templates';
import { sendEmail } from './email-transport';

// Email drainer (docs/system-design.md §8, §12.5): events with due work are
// processed one at a time; each claim returns only that event's items, which
// were re-verified in the same transaction. Transactional mail goes one per
// request with the idempotency key `item:<id>`, so a retry after a crash is
// de-duplicated by Resend for 24 h.

export type DrainOptions = {
  /** Public URL of an event page; built by the caller from the registry. */
  eventUrl: (orgId: string, eventSlug: string) => string | null;
  /** Stop claiming new batches after this many milliseconds. */
  budgetMs?: number;
  batchSize?: number;
  /** Only this event (used right after a registration or review). */
  onlyEventId?: string;
};

export type DrainReport = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
};

/** "Event Name" <events@...>, with characters that could break the header removed. */
export function fromHeader(displayName: string, address: string): string {
  const safe =
    displayName
      .replace(/["<>\r\n\\]/g, '')
      .trim()
      .slice(0, 100) || 'Events';
  return `"${safe}" <${address}>`;
}

async function sendOne(item: ClaimedItem, options: DrainOptions) {
  const defaultFrom =
    process.env.RESEND_DEFAULT_FROM?.trim() || 'events@mash.example';
  const rendered = renderEmail({
    templateKey: item.template_key,
    firstName: item.first_name,
    registrationCode: item.registration_code,
    eventName: item.event_name,
    eventKind: item.event_kind,
    eventTimezone: item.event_timezone,
    eventStartsAt: item.event_starts_at,
    eventEndsAt: item.event_ends_at,
    orgName: item.org_name,
    eventUrl: options.eventUrl(item.org_id, item.event_slug),
    subjectOverride: item.subject_override,
  });
  return sendEmail({
    from: fromHeader(item.from_name ?? item.event_name, defaultFrom),
    to: item.recipient,
    replyTo: item.reply_to ?? undefined,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: [
      { name: 'event_id', value: item.event_id },
      { name: 'job_item_id', value: item.item_id },
    ],
    idempotencyKey: `item:${item.item_id}`,
  });
}

export async function drainEmail(options: DrainOptions): Promise<DrainReport> {
  const started = Date.now();
  const budget = options.budgetMs ?? 45_000;
  const batchSize = options.batchSize ?? 25;
  const report: DrainReport = { claimed: 0, sent: 0, retried: 0, failed: 0 };

  const eventIds = options.onlyEventId
    ? [options.onlyEventId]
    : await eventsWithDueMessages('email');

  for (const eventId of eventIds) {
    while (Date.now() - started < budget) {
      const items = await claimMessageItems(eventId, 'email', batchSize);
      if (!items.length) break;
      report.claimed += items.length;
      for (const item of items) {
        // Belt and braces: the claim is per event, so this never fires.
        if (item.event_id !== eventId) {
          console.error('claim returned another event', {
            eventId,
            item: item.item_id,
          });
          continue;
        }
        const result = await sendOne(item, options);
        if (result.ok) {
          await finishMessageItem(
            eventId,
            item.item_id,
            item.lease_id,
            'sent',
            result.providerMessageId
          );
          report.sent += 1;
        } else {
          await finishMessageItem(
            eventId,
            item.item_id,
            item.lease_id,
            result.retryable ? 'retry' : 'failed',
            undefined,
            result.error
          );
          if (result.retryable) report.retried += 1;
          else report.failed += 1;
        }
      }
      if (items.length < batchSize) break;
    }
    if (Date.now() - started >= budget) break;
  }
  return report;
}
