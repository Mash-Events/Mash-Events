import { type NextRequest, NextResponse } from 'next/server';
import crossSiteRequest from '@/lib/cross-site-request.cjs';

const { isCrossSiteStateChange } = crossSiteRequest;

// Scaffold of the Mash proxy (docs/system-design.md §4.2, §6.4).
// Done here: strip client-sent internal headers; block cross-site state
// changes on protected routes. Next steps (refactor order §16.5, step 3):
// host → org/event resolution from sites/registry.ts, rewrites to
// /site/<org>/<event>, admin-host-only Supabase session refresh and AAL checks.

const INTERNAL_HEADER_PREFIX = 'x-mash-';

const PROTECTED_PREFIXES = ['/admin', '/api/admin', '/auth'];

function isProtectedRoute(request: NextRequest) {
  const { pathname } = request.nextUrl;
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function withoutInternalHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX)) {
      headers.delete(name);
    }
  }
  return headers;
}

export default function proxy(request: NextRequest) {
  if (
    isProtectedRoute(request) &&
    isCrossSiteStateChange({
      method: request.method,
      url: request.url,
      origin: request.headers.get('origin'),
      secFetchSite: request.headers.get('sec-fetch-site'),
    })
  ) {
    return NextResponse.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 }
    );
  }

  return NextResponse.next({
    request: { headers: withoutInternalHeaders(request) },
  });
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static files.
    '/((?!_next/static|_next/image|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|avif|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
  ],
};
