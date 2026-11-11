import 'server-only';
import {
  claimMessageItems,
  eventsWithDueMessages,
  finishMessageItem,
  type ClaimedItem,
} from '../db/privileged/messaging';
import { releaseDueMessageIntents } from '../db/privileged/webinar';
import { linkSecret, signJoinToken } from '../passes/join-token';
import { issueQrPass } from '../db/privileged/passes';
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

/** Personal join link for webinar confirmations and messages that ask for it. */
async function joinUrlFor(item: ClaimedItem, eventUrl: string | null) {
  const isOnline =
    item.event_kind === 'webinar' || item.event_kind === 'hybrid';
  const wanted =
    (item.template_key === 'confirmed' && isOnline) ||
    (item.template_key === 'custom' &&
      item.include_join_link &&
      item.registration_status === 'confirmed');
  const secret = linkSecret();
  if (!wanted || !eventUrl || !secret) return null;
  const token = await signJoinToken(
    secret,
    item.event_id,
    item.registration_id
  );
  return `${eventUrl}/join/${token}`;
}

/** Personal QR pass page link for confirmed on-site registrations. */
async function passUrlFor(item: ClaimedItem, eventUrl: string | null) {
  const onSite =
    item.event_kind === 'in_person' || item.event_kind === 'hybrid';
  if (item.template_key !== 'confirmed' || !onSite || !eventUrl) return null;
  const token = await issueQrPass(item.event_id, item.registration_id);
  return token ? `${eventUrl}/pass/${token}` : null;
}

async function sendOne(item: ClaimedItem, options: DrainOptions) {
  const defaultFrom =
    process.env.RESEND_DEFAULT_FROM?.trim() || 'events@mash.example';
  const eventUrl = options.eventUrl(item.org_id, item.event_slug);
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
    eventUrl,
    subjectOverride: item.subject_override,
    joinUrl: await joinUrlFor(item, eventUrl),
    passUrl: await passUrlFor(item, eventUrl),
    customSubject: item.job_subject,
    customBody: item.job_body,
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

  // Scheduled messages whose time has come become queued items first.
  if (!options.onlyEventId) await releaseDueMessageIntents();

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
        const result = await sendOne(item, options).catch((error) => ({
          ok: false as const,
          retryable: false,
          error: `render: ${error instanceof Error ? error.message : 'failed'}`,
        }));
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
