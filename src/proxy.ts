import { type NextRequest, NextResponse } from 'next/server';
import crossSiteRequest from '@/lib/cross-site-request.cjs';
import { orgs } from '@sites/registry';
import { resolveRoute } from '@core/routing/resolve';
import { getAdminHosts, getRootHosts, isProduction } from '@core/auth/config';
import { gateResponse, handleAdminSession } from '@core/auth/proxy-session';

const { isCrossSiteStateChange } = crossSiteRequest;

// Request entry point (docs/system-design.md §4.2, §6.4):
// 1. strip client-sent x-mash-* headers;
// 2. resolve host + path to admin / root / an event rewrite / 404;
// 3. on the admin host only: refresh the Supabase session, enforce session
//    limits and MFA, block cross-site state changes;
// 4. on org hosts: rewrite /<event>/... to /site/<org>/<event>/... and
//    /<event>/api/... to /api/public/events/<eventId>/..., with the resolved
//    ids as internal headers.

const INTERNAL_HEADER_PREFIX = 'x-mash-';

function withoutInternalHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX)) {
      headers.delete(name);
    }
  }
  return headers;
}

function requestUrlForHost(request: NextRequest): string {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (host) url.host = host;
  return url.toString();
}

function notFound() {
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export default async function proxy(request: NextRequest) {
  const decision = resolveRoute(
    request.headers.get('host'),
    request.nextUrl.pathname,
    {
      adminHosts: getAdminHosts(),
      rootHosts: getRootHosts(),
      previewFallback: !isProduction(),
      orgs,
    }
  );

  if (decision.kind === 'not_found') return notFound();

  if (decision.kind === 'rewrite') {
    const headers = withoutInternalHeaders(request);
    headers.set('x-mash-org-id', decision.orgId);
    headers.set('x-mash-event-id', decision.eventId);
    headers.set('x-mash-rewrite', '1');
    const target = request.nextUrl.clone();
    target.pathname = decision.pathname;
    return NextResponse.rewrite(target, { request: { headers } });
  }

  if (decision.kind === 'admin') {
    if (request.nextUrl.pathname === '/') {
      const target = request.nextUrl.clone();
      target.pathname = '/admin';
      return NextResponse.redirect(target, 307);
    }
    if (
      isCrossSiteStateChange({
        method: request.method,
        // Compare against the host the browser used (request.url may carry
        // the server's bind address instead, e.g. in `next dev`).
        url: requestUrlForHost(request),
        origin: request.headers.get('origin'),
        secFetchSite: request.headers.get('sec-fetch-site'),
      })
    ) {
      return NextResponse.json(
        { error: 'Cross-site requests are not allowed.' },
        { status: 403 }
      );
    }

    const { gate, response } = await handleAdminSession(
      request,
      () =>
        NextResponse.next({
          request: { headers: withoutInternalHeaders(request) },
        }),
      decision.requiresSession
    );
    const final = gateResponse(request, gate, response);
    final.headers.set('Cache-Control', 'private, no-store');
    return final;
  }

  // Root/studio host and shared endpoints.
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
