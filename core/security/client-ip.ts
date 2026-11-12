// Client IP resolution for rate limiting. Pure module (no server-only
// guard) so the node tests can exercise the spoofing rules directly.

// A syntactically valid IPv4 or IPv6 literal — anything else (spoofed
// junk, arbitrary strings) must never become a rate-limit key.
const IP_PATTERN =
  /^(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4})$/i;

function validIp(value: string): string | null {
  return IP_PATTERN.test(value) ? value : null;
}

export function clientIp(headers: Headers): string | null {
  // Prefer headers the edge overwrites on every request (Vercel rewrites
  // x-forwarded-for and does not forward client-supplied values; the
  // vercel/real-ip variants carry the same verified value). XFF is the
  // last resort, its first entry only — and only if it is a real IP.
  const vercel = headers.get('x-vercel-forwarded-for');
  if (vercel) return validIp(vercel.trim());
  const real = headers.get('x-real-ip');
  if (real) return validIp(real.trim());
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    return first ? validIp(first) : null;
  }
  return null;
}
