import 'server-only';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkEventPermission,
  createEventClient,
  type AdminSession,
} from '../auth/server';
import type { Permission } from '../auth/permissions';
import { isUuid, loadVisibleEvent, type WorkspaceEvent } from '../db/events';
import { findTenancyKeys } from './tenancy-keys';

// Every admin API handler is wrapped in eventRoute (docs/system-design.md
// §12.4): the event comes from the path only; session, MFA and permission are
// checked for THAT event; archived events are read-only; bodies may not carry
// event/org ids; the handler only gets an event-pinned client; responses echo
// the eventId and are never cached.

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export class RouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

export type EventRouteContext<TBody> = {
  event: WorkspaceEvent;
  db: SupabaseClient;
  actor: AdminSession;
  body: TBody;
  request: NextRequest;
  params: Record<string, string>;
};

type Options<TSchema extends z.ZodType | undefined> = {
  permission: Permission;
  /** Writes are refused on archived events. Defaults to true for non-GET. */
  write?: boolean;
  body?: TSchema;
};

function json(eventId: string | null, status: number, payload: object) {
  return Response.json({ eventId, ...payload }, { status, headers: NO_STORE });
}

export function eventRoute<TSchema extends z.ZodType | undefined = undefined>(
  options: Options<TSchema>,
  handler: (
    ctx: EventRouteContext<
      TSchema extends z.ZodType ? z.infer<TSchema> : undefined
    >
  ) => Promise<object>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<Response> => {
    const params = await context.params;
    const eventId = params.eventId;
    if (!isUuid(eventId)) return json(null, 404, { error: 'not_found' });

    const event = await loadVisibleEvent(eventId);
    // Not visible to this user = does not exist (no existence oracle).
    if (!event) return json(eventId, 404, { error: 'not_found' });

    const access = await checkEventPermission(
      { id: event.id, orgId: event.orgId },
      options.permission
    );
    if (!access.ok) {
      const status =
        access.reason === 'unauthenticated'
          ? 401
          : access.reason === 'auth_unavailable'
            ? 503
            : 403;
      return json(eventId, status, { error: access.reason });
    }

    const isWrite = options.write ?? request.method !== 'GET';
    if (isWrite && event.status === 'archived') {
      return json(eventId, 409, { error: 'event_archived' });
    }

    let body: unknown = undefined;
    if (options.body) {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return json(eventId, 400, { error: 'invalid_json' });
      }
      const tenancyKeys = findTenancyKeys(raw);
      if (tenancyKeys.length) {
        return json(eventId, 400, {
          error: 'event_comes_from_path',
          fields: tenancyKeys,
        });
      }
      const parsed = options.body.safeParse(raw);
      if (!parsed.success) {
        return json(eventId, 400, {
          error: 'invalid_body',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      body = parsed.data;
    }

    try {
      const result = await handler({
        event,
        db: await createEventClient(event.id),
        actor: access.session,
        body: body as never,
        request,
        params,
      });
      return json(eventId, 200, result);
    } catch (error) {
      if (error instanceof RouteError) {
        return json(eventId, error.status, {
          error: error.code,
          message: error.message,
        });
      }
      console.error('eventRoute handler failed', {
        eventId,
        path: request.nextUrl.pathname,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return json(eventId, 500, { error: 'server_error' });
    }
  };
}

/** Maps a Postgres/PostgREST error from an RPC to a RouteError. */
export function rpcError(error: { code?: string; message?: string }) {
  switch (error.code) {
    case 'P0002':
      return new RouteError(404, 'not_found');
    case '42501':
      return new RouteError(403, 'forbidden');
    case '23514':
      return new RouteError(409, 'not_allowed', error.message);
    default:
      return new RouteError(500, 'server_error');
  }
}
