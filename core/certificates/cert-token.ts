// Signed certificate claim tokens (docs/system-design.md §9.1 phase 3,
// §12.6). Same construction as pass tokens, with a dedicated secret
// (CERT_MASTER_SECRET) so the two channels never cross-sign:
//
// token = "v1." + base64url(event uuid bytes) + "." + base64url(cert uuid bytes)
//         + "." + base64url(mac)
// mac   = HMAC-SHA256(K_event, "cert|v1|<event_id>|<cert_id>")[0..16]
// K_event = HKDF-SHA256(ikm = CERT_MASTER_SECRET, salt "mash-cert",
//                       info "<event_id>|v<key_version>")
//
// Deterministic, so re-sent emails re-derive the same link. Revocation is
// the certificate row's status, checked on every claim (§12.10).

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
      salt: encoder.encode('mash-cert'),
      info: encoder.encode(`${eventId}|v${keyVersion}`),
    },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify']
  );
}

async function mac(key: CryptoKey, eventId: string, certId: string) {
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`cert|v1|${eventId}|${certId}`)
  );
  return new Uint8Array(sig).slice(0, MAC_BYTES);
}

export async function signCertToken(
  secret: string,
  eventId: string,
  certId: string,
  keyVersion = 1
): Promise<string> {
  const key = await eventKey(secret, eventId, keyVersion);
  const signature = await mac(key, eventId, certId);
  return `v1.${b64url(uuidToBytes(eventId))}.${b64url(uuidToBytes(certId))}.${b64url(signature)}`;
}

/**
 * Returns the certificate id if the token is valid for THIS event under the
 * given key version. The caller then checks the row's status (only issued
 * certificates claim).
 */
export async function verifyCertToken(
  secret: string,
  eventId: string,
  token: string,
  keyVersion = 1
): Promise<string | null> {
  if (token.length > 400) return null;
  const [version, evPart, certPart, macPart, ...rest] = token.split('.');
  if (version !== 'v1' || !evPart || !certPart || !macPart || rest.length) {
    return null;
  }
  const evBytes = fromB64url(evPart);
  const certBytes = fromB64url(certPart);
  const given = fromB64url(macPart);
  if (
    !evBytes ||
    evBytes.length !== 16 ||
    !certBytes ||
    certBytes.length !== 16 ||
    !given ||
    given.length !== MAC_BYTES
  ) {
    return null;
  }
  if (bytesToUuid(evBytes) !== eventId) return null;
  const certId = bytesToUuid(certBytes);
  const expected = await mac(
    await eventKey(secret, eventId, keyVersion),
    eventId,
    certId
  );
  let diff = 0;
  for (let i = 0; i < MAC_BYTES; i += 1) diff |= expected[i] ^ given[i];
  return diff === 0 ? certId : null;
}

/** Certificate secret from env; a fixed dev value outside production only. */
export function certSecret(): string | null {
  const secret = process.env.CERT_MASTER_SECRET?.trim();
  if (secret) return secret;
  return process.env.MASH_ENV === 'production'
    ? null
    : 'dev-only-cert-secret-not-for-production';
}
