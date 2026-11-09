// Signed webinar join tokens (docs/system-design.md §9.3, §12.6).
//
// token = "v1." + base64url(registration uuid bytes) + "." + base64url(mac)
// mac   = HMAC-SHA256(K_event, "join|v1|<event_id>|<registration_id>")[0..16]
// K_event = HKDF-SHA256(LINK_MASTER_SECRET, salt "mash-join", info "<event_id>|v<key_version>")
//
// The key is derived per event, so a token from event A never verifies for
// event B, whatever the URL. Nothing is stored: the token is derived again
// when needed, and revocation is the registration's status (only confirmed
// registrants may join). Pure Web Crypto, usable in route handlers and tests.

const encoder = new TextEncoder();
const MAC_BYTES = 16;

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((value.length + 3) % 4);
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function eventKey(secret: string, eventId: string, keyVersion: number) {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('mash-join'),
      info: encoder.encode(`${eventId}|v${keyVersion}`),
    },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify']
  );
}

async function mac(key: CryptoKey, eventId: string, registrationId: string) {
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`join|v1|${eventId}|${registrationId}`)
  );
  return new Uint8Array(sig).slice(0, MAC_BYTES);
}

export async function signJoinToken(
  secret: string,
  eventId: string,
  registrationId: string,
  keyVersion = 1
): Promise<string> {
  const key = await eventKey(secret, eventId, keyVersion);
  const signature = await mac(key, eventId, registrationId);
  return `v1.${b64url(uuidToBytes(registrationId))}.${b64url(signature)}`;
}

/** Returns the registration id if the token is valid for THIS event. */
export async function verifyJoinToken(
  secret: string,
  eventId: string,
  token: string,
  keyVersion = 1
): Promise<string | null> {
  if (token.length > 120) return null;
  const [version, regPart, macPart, ...rest] = token.split('.');
  if (version !== 'v1' || !regPart || !macPart || rest.length) return null;
  const regBytes = fromB64url(regPart);
  const given = fromB64url(macPart);
  if (
    !regBytes ||
    regBytes.length !== 16 ||
    !given ||
    given.length !== MAC_BYTES
  ) {
    return null;
  }
  const registrationId = bytesToUuid(regBytes);
  const expected = await mac(
    await eventKey(secret, eventId, keyVersion),
    eventId,
    registrationId
  );
  let diff = 0;
  for (let i = 0; i < MAC_BYTES; i += 1) diff |= expected[i] ^ given[i];
  return diff === 0 ? registrationId : null;
}

/** Link secret from env; a fixed dev value outside production only. */
export function linkSecret(): string | null {
  const secret = process.env.LINK_MASTER_SECRET?.trim();
  if (secret) return secret;
  return process.env.MASH_ENV === 'production'
    ? null
    : 'dev-only-link-secret-not-for-production';
}
