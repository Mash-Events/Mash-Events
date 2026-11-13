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
import { certificateClaimToken } from '../db/privileged/certificates';
import { getAgendaSessions } from '../db/privileged/agenda';
import { renderBadgePdf } from '../passes/badge';
import { renderCertificatePdf } from '../certificates/certificate-pdf';
import { renderAgendaPdf } from '../agenda/agenda-pdf';
import { formatDate, formatTime, timeZoneLabel } from '../ui/site/format';
import {
  getWhatsAppConfig,
  isWhatsAppConfigured,
  sendWhatsAppTemplate,
} from './whatsapp';
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

/** Personal QR pass page link for confirmed on-site registrations. Returns
 *  the token too — the same token re-renders the attendee's badge PDF. */
async function passFor(
  item: ClaimedItem,
  eventUrl: string | null
): Promise<{ url: string | null; token: string | null }> {
  const onSite =
    item.event_kind === 'in_person' || item.event_kind === 'hybrid';
  if (item.template_key !== 'confirmed' || !onSite)
    return { url: null, token: null };
  const token = await issueQrPass(item.event_id, item.registration_id);
  return {
    url: token && eventUrl ? `${eventUrl}/pass/${token}` : null,
    token,
  };
}

/** Personal certificate claim link for certificate_issued emails. */
async function certUrlFor(item: ClaimedItem, eventUrl: string | null) {
  if (item.template_key !== 'certificate_issued' || !eventUrl) return null;
  const token = await certificateClaimToken(
    item.event_id,
    item.registration_id
  );
  return token ? `${eventUrl}/cert/${token}` : null;
}

/** Public verify link; the certificate code is the registration code. */
function verifyUrlFor(item: ClaimedItem, eventUrl: string | null) {
  if (item.template_key !== 'certificate_issued' || !eventUrl) return null;
  return `${eventUrl}/verify/${item.registration_code}`;
}

/** Public feedback form link for feedback_request emails. */
function feedbackUrlFor(item: ClaimedItem, eventUrl: string | null) {
  if (item.template_key !== 'feedback_request' || !eventUrl) return null;
  return `${eventUrl}/feedback`;
}

/** Human label for the event window, event-local (shared with the badge and
 *  certificate PDF routes' formatting). */
function whenLabel(item: ClaimedItem): string {
  return item.event_starts_at
    ? `${formatDate(item.event_starts_at, item.event_timezone)} · ${formatTime(
        item.event_starts_at,
        item.event_timezone
      )} ${timeZoneLabel(item.event_timezone, item.event_starts_at)}`
    : '';
}

function attendeeName(item: ClaimedItem): string {
  return (
    `${item.first_name} ${item.last_name}`.trim() || item.registration_code
  );
}

async function sendOne(
  item: ClaimedItem,
  options: DrainOptions,
  agendaCache: Map<string, Buffer>
) {
  const defaultFrom =
    process.env.RESEND_DEFAULT_FROM?.trim() || 'events@mash.example';
  const eventUrl = options.eventUrl(item.org_id, item.event_slug);
  const pass = await passFor(item, eventUrl);
  const certUrl = await certUrlFor(item, eventUrl);

  // Generated PDF attachments (docs §8): the attendee's own badge on the
  // confirmation email, their certificate on issue, and the agenda for
  // reminder/bulk jobs that asked for it. The agenda is rendered once per
  // drain run; badge/certificate are per-attendee.
  const attachments: { filename: string; content: Buffer }[] = [];
  const safeCode = item.registration_code.replace(/[^\w.-]/g, '');
  try {
    if (pass.token) {
      attachments.push({
        filename: `badge-${safeCode}.pdf`,
        content: await renderBadgePdf({
          orgName: item.org_name,
          eventName: item.event_name,
          when: whenLabel(item),
          attendeeName: attendeeName(item),
          code: item.registration_code,
          passToken: pass.token,
        }),
      });
    }
    if (item.template_key === 'certificate_issued') {
      attachments.push({
        filename: `certificate-${safeCode}.pdf`,
        content: await renderCertificatePdf({
          orgName: item.org_name,
          eventName: item.event_name,
          when: whenLabel(item),
          attendeeName: attendeeName(item),
          code: item.registration_code,
        }),
      });
    }
    if ((item.attachments ?? []).includes('agenda_pdf')) {
      const cacheKey = `${item.event_id}:agenda`;
      let agenda = agendaCache.get(cacheKey);
      if (!agenda) {
        const sessions = await getAgendaSessions(item.event_id);
        agenda = await renderAgendaPdf({
          orgName: item.org_name,
          eventName: item.event_name,
          when: whenLabel(item),
          sessions,
        });
        agendaCache.set(cacheKey, agenda);
      }
      attachments.push({ filename: 'agenda.pdf', content: agenda });
    }
  } catch {
    // A rendering failure must not block the email itself (§8): the links
    // in the body still work, so send without attachments and note nothing.
  }

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
    passUrl: pass.url,
    certUrl,
    verifyUrl: verifyUrlFor(item, eventUrl),
    feedbackUrl: feedbackUrlFor(item, eventUrl),
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
    attachments,
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
  // One agenda render per drain run per event (shared across the batch).
  const agendaCache = new Map<string, Buffer>();

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
        const result = await sendOne(item, options, agendaCache).catch(
          (error) => ({
            ok: false as const,
            retryable: false,
            error: `render: ${error instanceof Error ? error.message : 'failed'}`,
          })
        );
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

/**
 * Drains WhatsApp items for events with due work. Inert unless the Azure
 * channel is configured — items simply stay queued until it is (§8.1).
 */
export async function drainWhatsapp(
  options: DrainOptions
): Promise<DrainReport> {
  const config = getWhatsAppConfig();
  if (!isWhatsAppConfigured(config)) {
    return { claimed: 0, sent: 0, retried: 0, failed: 0 };
  }

  const started = Date.now();
  const budget = options.budgetMs ?? 30_000;
  const batchSize = options.batchSize ?? 25;
  const report: DrainReport = { claimed: 0, sent: 0, retried: 0, failed: 0 };

  const eventIds = options.onlyEventId
    ? [options.onlyEventId]
    : await eventsWithDueMessages('whatsapp');

  for (const eventId of eventIds) {
    while (Date.now() - started < budget) {
      const items = await claimMessageItems(eventId, 'whatsapp', batchSize);
      if (!items.length) break;
      report.claimed += items.length;
      for (const item of items) {
        const result = await sendWhatsAppTemplate(item, config).catch(
          (error) => ({
            ok: false as const,
            retryable: false,
            error: error instanceof Error ? error.message : 'failed',
          })
        );
        if (result.ok) {
          await finishMessageItem(
            eventId,
            item.item_id,
            item.lease_id,
            'sent',
            result.providerMessageId ?? undefined
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
