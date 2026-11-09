import 'server-only';

// Cloudflare Turnstile server-side check (docs/system-design.md §13): the
// token must be valid, for the expected hostname and action. Without a secret
// key the check is skipped outside production only.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

export async function verifyTurnstile({
  token,
  ip,
  expectedHostname,
  expectedAction,
}: {
  token: string | undefined;
  ip: string | null;
  expectedHostname: string;
  expectedAction: string;
}): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return process.env.MASH_ENV === 'production'
      ? { ok: false, reason: 'turnstile_not_configured' }
      : { ok: true };
  }
  if (!token) return { ok: false, reason: 'missing_token' };

  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    if (!data.success) return { ok: false, reason: 'failed' };
    if (data.hostname !== expectedHostname) {
      return { ok: false, reason: 'hostname_mismatch' };
    }
    if (data.action && data.action !== expectedAction) {
      return { ok: false, reason: 'action_mismatch' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
