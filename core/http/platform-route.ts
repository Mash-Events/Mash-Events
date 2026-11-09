import 'server-only';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkPlatformAdmin,
  createAuthClient,
  type AdminSession,
} from '../auth/server';
import { RouteError } from './event-route';

// Super-admin APIs under /api/admin/platform (organisations, events,
// members). Not event-scoped, so they get the plain user client; every write
// is an RPC that re-checks is_platform_admin() in Postgres.

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export type PlatformRouteContext<TBody> = {
  db: SupabaseClient;
  actor: AdminSession;
  body: TBody;
  request: NextRequest;
  params: Record<string, string>;
};

export function platformRoute<
  TSchema extends z.ZodType | undefined = undefined,
>(
  options: { body?: TSchema },
  handler: (
    ctx: PlatformRouteContext<
      TSchema extends z.ZodType ? z.infer<TSchema> : undefined
    >
  ) => Promise<object>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<Response> => {
    const params = await context.params;
    const access = await checkPlatformAdmin();
    if (!access.ok) {
      const status = access.reason === 'unauthenticated' ? 401 : 403;
      return Response.json(
        { error: access.reason },
        { status, headers: NO_STORE }
      );
    }

    let body: unknown = undefined;
    if (options.body) {
      const raw = await request.json().catch(() => undefined);
      const parsed = options.body.safeParse(raw);
      if (!parsed.success) {
        return Response.json(
          {
            error: 'invalid_body',
            message: parsed.error.issues[0]?.message ?? 'Invalid input.',
          },
          { status: 400, headers: NO_STORE }
        );
      }
      body = parsed.data;
    }

    try {
      const result = await handler({
        db: await createAuthClient(),
        actor: access.session,
        body: body as never,
        request,
        params,
      });
      return Response.json(result, { headers: NO_STORE });
    } catch (error) {
      if (error instanceof RouteError) {
        return Response.json(
          { error: error.code, message: error.message },
          { status: error.status, headers: NO_STORE }
        );
      }
      console.error('platformRoute handler failed', {
        path: request.nextUrl.pathname,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return Response.json(
        { error: 'server_error' },
        { status: 500, headers: NO_STORE }
      );
    }
  };
}

/** Maps Postgres errors from platform RPCs to friendly RouteErrors. */
export function platformRpcError(error: { code?: string; message?: string }) {
  switch (error.code) {
    case '23505':
      return new RouteError(409, 'exists', 'That slug is already in use.');
    case '23514':
      return new RouteError(400, 'invalid', error.message ?? 'Invalid value.');
    case '42501':
      return new RouteError(403, 'forbidden', 'Super admin only.');
    case 'P0002':
      return new RouteError(404, 'not_found', 'Not found.');
    default:
      return new RouteError(500, 'server_error', 'Something went wrong.');
  }
}
