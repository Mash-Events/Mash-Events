// Blocks cross-site browser requests from changing state on authenticated
// API routes. Clerk's session cookie is SameSite=Lax, which already stops most
// of this; checking Origin and Sec-Fetch-Site closes the remaining gaps.
// Server-to-server callers (cron, job processors) send neither header and
// are still authenticated by their secret or session.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none']);

function isCrossSiteStateChange({ method, url, origin, secFetchSite }) {
  if (SAFE_METHODS.has(String(method || '').toUpperCase())) return false;

  if (secFetchSite && !ALLOWED_FETCH_SITES.has(secFetchSite)) return true;

  if (origin) {
    try {
      return new URL(origin).origin !== new URL(url).origin;
    } catch {
      return true;
    }
  }

  return false;
}

module.exports = { isCrossSiteStateChange };
