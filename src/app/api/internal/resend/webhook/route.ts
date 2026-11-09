import { Webhook } from 'svix';
import { recordDelivery } from '@core/db/privileged/messaging';

// POST /api/internal/resend/webhook — delivery events from Resend
// (docs/system-design.md §8 step 7). Svix signature verified; matched by
// Resend's email id; the event_id tag must equal the stored item's event.

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
};

type Tags = Record<string, string> | { name: string; value: string }[];

type ResendEvent = {
  type: string;
  data?: { email_id?: string; tags?: Tags };
};

function tagValue(tags: Tags | undefined, name: string): string | null {
  if (!tags) return null;
  if (Array.isArray(tags))
    return tags.find((t) => t.name === name)?.value ?? null;
  return tags[name] ?? null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret)
    return Response.json({ error: 'not_configured' }, { status: 503 });

  const payload = await request.text();
  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': request.headers.get('svix-id') ?? '',
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': request.headers.get('svix-signature') ?? '',
    }) as ResendEvent;
  } catch {
    console.warn('resend webhook signature failed');
    return Response.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const status = STATUS[event.type];
  const emailId = event.data?.email_id;
  if (!status || !emailId) return Response.json({ ok: true, ignored: true });

  const outcome = await recordDelivery(
    'resend',
    emailId,
    status,
    tagValue(event.data?.tags, 'event_id')
  );
  if (outcome === 'event_mismatch') {
    console.error('resend webhook event mismatch', { emailId });
  }
  return Response.json({ ok: true, outcome });
}
