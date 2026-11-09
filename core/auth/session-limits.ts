// App-enforced session limits (docs/system-design.md §6.4). The Supabase Free
// plan has no session time-box or inactivity timeout, so the proxy applies
// them: 12 h from the first factor, 2 h without activity.
//
// Pure functions (Web Crypto only) so they run in the proxy and in tests.

export const MAX_SESSION_AGE_SECONDS = 12 * 60 * 60;
export const MAX_IDLE_SECONDS = 2 * 60 * 60;
/** Refresh the activity cookie at most this often. */
export const SEEN_REFRESH_SECONDS = 60;
export const SEEN_COOKIE = 'mash_seen';

type AmrEntry = { method?: string; timestamp?: number };

/**
 * When the first factor (password or OAuth) was used, in epoch seconds.
 * Supabase puts one `amr` entry per factor; the oldest is the sign-in.
 */
export function firstFactorTime(
  amr: unknown,
  fallbackIat?: number
): number | null {
  if (Array.isArray(amr)) {
    const times = (amr as AmrEntry[])
      .map((entry) => entry?.timestamp)
      .filter((value): value is number => typeof value === 'number');
    if (times.length) return Math.min(...times);
  }
  return typeof fallbackIat === 'number' ? fallbackIat : null;
}

export function isSessionTooOld(
  amr: unknown,
  nowSeconds: number,
  fallbackIat?: number
): boolean {
  const started = firstFactorTime(amr, fallbackIat);
  if (started === null) return true;
  return nowSeconds - started > MAX_SESSION_AGE_SECONDS;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toBase64Url(
    await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Cookie value `<sessionId>.<lastSeen>.<mac>`, bound to one auth session. */
export async function signSeen(
  secret: string,
  sessionId: string,
  lastSeen: number
): Promise<string> {
  const body = `${sessionId}.${lastSeen}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** Returns the last-seen time if the cookie is valid for this session. */
export async function readSeen(
  secret: string,
  sessionId: string,
  value: string | undefined
): Promise<number | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [cookieSession, lastSeenRaw, mac] = parts;
  if (cookieSession !== sessionId) return null;
  const expected = await hmac(secret, `${cookieSession}.${lastSeenRaw}`);
  if (!constantTimeEqual(mac, expected)) return null;
  const lastSeen = Number(lastSeenRaw);
  return Number.isFinite(lastSeen) ? lastSeen : null;
}

export type IdleCheck =
  { status: 'expired' } | { status: 'ok'; refresh: boolean };

/**
 * Missing/invalid cookie counts as fresh activity (first request of a new
 * session); an expired one signs the user out.
 */
export function checkIdle(
  lastSeen: number | null,
  nowSeconds: number
): IdleCheck {
  if (lastSeen === null) return { status: 'ok', refresh: true };
  if (nowSeconds - lastSeen > MAX_IDLE_SECONDS) return { status: 'expired' };
  return {
    status: 'ok',
    refresh: nowSeconds - lastSeen >= SEEN_REFRESH_SECONDS,
  };
}
