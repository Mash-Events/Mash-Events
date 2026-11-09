'use client';

// Browser helper for admin APIs (docs/system-design.md §12.4 "Response echo"):
// every event API response carries `eventId`, and the workspace refuses any
// response that belongs to a different event than the one on screen.

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  unauthenticated: 'Your session ended. Please sign in again.',
  mfa_required: 'Please complete two-step verification.',
  no_membership: 'You do not have permission for this action.',
  forbidden: 'You do not have permission for this action.',
  event_archived: 'This event is archived and read-only.',
  stale: 'This changed since you loaded it. Refresh and try again.',
  not_allowed: 'That change is not allowed.',
  not_found: 'Not found.',
};

async function parse(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(body.error ?? 'error');
    throw new AdminApiError(
      res.status,
      code,
      body.message ?? MESSAGES[code] ?? 'Something went wrong.'
    );
  }
  return body;
}

export async function eventApi<T = Record<string, unknown>>(
  eventId: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`/api/admin/events/${eventId}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const body = await parse(res);
  if (body.eventId !== eventId) {
    throw new AdminApiError(
      500,
      'event_mismatch',
      'The server answered for a different event. Reload the page.'
    );
  }
  return body as T;
}

export async function platformApi<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`/api/admin/platform${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return (await parse(res)) as T;
}
