import 'server-only';
import { Resend } from 'resend';

// Email transport (docs/system-design.md §8). Resend in production. Without
// an API key outside production, a log transport records the send so the
// whole pipeline can run locally; in production nothing is sent and items
// stay queued until the key is configured.

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  tags: { name: string; value: string }[];
  idempotencyKey: string;
};

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: string };

let client: Resend | null = null;

export function emailTransportReady(): boolean {
  return (
    Boolean(process.env.RESEND_API_KEY) || process.env.MASH_ENV !== 'production'
  );
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.MASH_ENV === 'production') {
      return { ok: false, retryable: true, error: 'resend_not_configured' };
    }
    console.info('[email:log-transport]', {
      to: email.to.replace(/^(.).*(@.*)$/, '$1***$2'),
      subject: email.subject,
      key: email.idempotencyKey,
    });
    return { ok: true, providerMessageId: `log_${email.idempotencyKey}` };
  }

  client ??= new Resend(apiKey);
  try {
    const { data, error } = await client.emails.send(
      {
        from: email.from,
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: email.tags,
      },
      { idempotencyKey: email.idempotencyKey }
    );
    if (data?.id) return { ok: true, providerMessageId: data.id };
    const status = (error as { statusCode?: number } | null)?.statusCode ?? 0;
    return {
      ok: false,
      // 429 and 5xx are worth retrying; other 4xx are permanent (§8).
      retryable: status === 429 || status >= 500 || status === 0,
      error: `${status}:${error?.name ?? 'error'}`,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: error instanceof Error ? error.message.slice(0, 200) : 'network',
    };
  }
}
