import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_OPTIONS,
  getSessionActivitySecret,
  getSupabaseConfig,
} from './config';
import {
  SEEN_COOKIE,
  checkIdle,
  isSessionTooOld,
  readSeen,
  signSeen,
} from './session-limits';

// Admin-host session handling for proxy.ts (docs/system-design.md §6.3–6.4):
// refresh the Supabase session cookies, enforce the 12 h / 2 h limits, and
// send aal1 sessions to MFA. Never runs on public hosts.

export type AdminGate =
  | { kind: 'allow' }
  | { kind: 'sign_in' }
  | { kind: 'mfa' }
  | { kind: 'expired' };

type Result = { gate: AdminGate; response: NextResponse };

function isApi(pathname: string) {
  return pathname.startsWith('/api/');
}

/**
 * `makeForward` builds the NextResponse.next(...) the proxy would return from
 * the request's current headers. It is called again after a token refresh so
 * the page sees the refreshed cookies (otherwise server code would refresh the
 * same token twice and trip refresh-token reuse detection).
 */
export async function handleAdminSession(
  request: NextRequest,
  makeForward: () => NextResponse,
  requiresSession: boolean
): Promise<Result> {
  const forward = makeForward();
  const { url, publishableKey, configured } = getSupabaseConfig();
  if (!configured) {
    return {
      gate: requiresSession ? { kind: 'sign_in' } : { kind: 'allow' },
      response: forward,
    };
  }

  let response = forward;
  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = makeForward();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, {
            ...options,
            ...AUTH_COOKIE_OPTIONS,
          });
        }
      },
    },
  });

  // getClaims() refreshes an expired access token and verifies the JWT.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) {
    return {
      gate: requiresSession ? { kind: 'sign_in' } : { kind: 'allow' },
      response,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const secret = getSessionActivitySecret();
  const sessionId = String(claims.session_id || '');

  let expired = isSessionTooOld(claims.amr, now, claims.iat);
  let refreshSeen = false;
  if (!expired && secret && sessionId) {
    const lastSeen = await readSeen(
      secret,
      sessionId,
      request.cookies.get(SEEN_COOKIE)?.value
    );
    const idle = checkIdle(lastSeen, now);
    expired = idle.status === 'expired';
    refreshSeen = idle.status === 'ok' && idle.refresh;
  }

  if (expired) {
    // Revokes this session's refresh token server-side and clears cookies.
    await supabase.auth.signOut({ scope: 'local' });
    response.cookies.delete(SEEN_COOKIE);
    return { gate: { kind: 'expired' }, response };
  }

  if (refreshSeen) {
    response.cookies.set(SEEN_COOKIE, await signSeen(secret, sessionId, now), {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 2 * 60 * 60,
    });
  }

  if (requiresSession && claims.aal !== 'aal2') {
    return { gate: { kind: 'mfa' }, response };
  }
  return { gate: { kind: 'allow' }, response };
}

/** Turns a gate into the response the proxy returns. */
export function gateResponse(
  request: NextRequest,
  gate: AdminGate,
  sessionResponse: NextResponse
): NextResponse {
  if (gate.kind === 'allow') return sessionResponse;

  const pathname = request.nextUrl.pathname;
  let redirect: NextResponse;
  if (isApi(pathname)) {
    const status = gate.kind === 'mfa' ? 403 : 401;
    redirect = NextResponse.json(
      { error: gate.kind === 'mfa' ? 'mfa_required' : 'unauthenticated' },
      { status, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } else {
    const target = request.nextUrl.clone();
    target.search = '';
    target.pathname = gate.kind === 'mfa' ? '/auth/mfa' : '/auth/sign-in';
    if (gate.kind === 'expired') target.searchParams.set('expired', '1');
    if (gate.kind === 'sign_in' && pathname !== '/') {
      target.searchParams.set('next', pathname);
    }
    redirect = NextResponse.redirect(target, 303);
  }

  // Carry refreshed/cleared auth cookies onto the replacement response.
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
