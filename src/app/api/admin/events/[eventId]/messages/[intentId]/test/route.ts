import { eventRoute, rpcError, RouteError } from '@core/http/event-route';
import { isUuid } from '@core/db/events';
import { renderEmail } from '@core/messaging/templates';
import { sendEmail } from '@core/messaging/email-transport';
import { fromHeader } from '@core/messaging/drain';
import { allow } from '@core/security/rate-limit';
import { eventPublicUrl } from '@sites/urls';

// POST /api/admin/events/<eventId>/messages/<intentId>/test
// Sends the exact message to the signed-in operator's own address (§12.11
// step 2). Required before the message can be confirmed.

export const dynamic = 'force-dynamic';

export const POST = eventRoute(
  { permission: 'messages.bulk' },
  async ({ db, event, actor, params }) => {
    const intentId = params.intentId;
    if (!isUuid(intentId)) throw new RouteError(404, 'not_found');
    if (!actor.email) {
      throw new RouteError(
        400,
        'no_email',
        'Your account has no email address.'
      );
    }
    if (
      !(await allow([
        {
          key: `evt:${event.id}:test-send:${actor.userId}`,
          max: 10,
          windowSeconds: 600,
        },
      ]))
    ) {
      throw new RouteError(
        429,
        'rate_limited',
        'Too many test sends. Wait a few minutes.'
      );
    }

    const [{ data: intent }, { data: details }] = await Promise.all([
      db
        .from('bulk_action_intents')
        .select('id, subject, body, include_join_link, status')
        .eq('id', intentId)
        .maybeSingle(),
      db
        .from('events')
        .select(
          'kind, timezone, starts_at, ends_at, org_id, organizations(name)'
        )
        .eq('id', event.id)
        .single(),
    ]);
    if (!intent || intent.status !== 'previewed') {
      throw new RouteError(
        404,
        'not_found',
        'Preview not found or no longer open.'
      );
    }

    const eventUrl = eventPublicUrl(event.orgId, event.slug);
    const rendered = renderEmail({
      templateKey: 'custom',
      firstName: 'there',
      registrationCode: 'TEST0000',
      eventName: event.name,
      eventKind: details?.kind ?? 'webinar',
      eventTimezone: event.timezone,
      eventStartsAt: details?.starts_at ?? null,
      eventEndsAt: details?.ends_at ?? null,
      orgName:
        (details?.organizations as unknown as { name: string } | null)?.name ??
        '',
      eventUrl,
      subjectOverride: null,
      joinUrl:
        intent.include_join_link && eventUrl
          ? `${eventUrl}/join/test-link-each-person-gets-their-own`
          : null,
      customSubject: `[TEST] ${intent.subject}`,
      customBody: intent.body,
    });

    const result = await sendEmail({
      from: fromHeader(
        event.name,
        process.env.RESEND_DEFAULT_FROM?.trim() || 'events@mash.example'
      ),
      to: actor.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [{ name: 'event_id', value: event.id }],
      idempotencyKey: `test:${intentId}:${Date.now()}`,
    });
    if (!result.ok) {
      throw new RouteError(
        502,
        'send_failed',
        'The test email could not be sent.'
      );
    }

    const { error } = await db.rpc('mark_message_intent_tested', {
      p_event_id: event.id,
      p_intent_id: intentId,
    });
    if (error) throw rpcError(error);
    return { sentTo: actor.email };
  }
);
