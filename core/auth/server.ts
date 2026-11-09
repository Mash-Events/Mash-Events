import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { AUTH_COOKIE_OPTIONS, getSupabaseConfig } from './config';
import {
  effectivePermissions,
  isPlatformAdmin,
  type EventRef,
  type Membership,
  type Permission,
} from './permissions';

// Server-side Supabase client bound to the signed-in admin's cookies
// (docs/system-design.md §6.4). Used by server components, route handlers
// and server actions. Never imported by client components.

export async function createAuthClient(extraHeaders?: Record<string, string>) {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    global: extraHeaders ? { headers: extraHeaders } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...options,
              ...AUTH_COOKIE_OPTIONS,
            });
          }
        } catch {
          // Server components cannot set cookies; the proxy refreshes them.
        }
      },
    },
  });
}

/** Client for one event's data: every request carries the RLS event pin. */
export function createEventClient(eventId: string) {
  return createAuthClient({ 'x-mash-event': eventId });
}

export type AdminSession = {
  userId: string;
  email: string | null;
  aal: string;
  sessionId: string;
};

/** Verified identity from the JWT (getClaims, never getSession). */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  if (!getSupabaseConfig().configured) return null;
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;
  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    aal: String(claims.aal || 'aal1'),
    sessionId: String(claims.session_id || ''),
  };
});

/** The signed-in user's live memberships (RLS: users read their own). */
export const getMyMemberships = cache(async (): Promise<Membership[]> => {
  const session = await getAdminSession();
  if (!session || session.aal !== 'aal2') return [];
  const supabase = await createAuthClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('scope, role, org_id, event_id, revoked_at')
    .eq('user_id', session.userId)
    .is('revoked_at', null);
  if (error) {
    console.error('Failed to load memberships', { code: error.code });
    return [];
  }
  return (data ?? []) as Membership[];
});

export type AccessResult =
  | { ok: true; session: AdminSession; permissions: Set<Permission> }
  | {
      ok: false;
      reason:
        | 'auth_unavailable'
        | 'unauthenticated'
        | 'mfa_required'
        | 'no_membership';
    };

/** Session + MFA + permission for one event (§6.5). */
export async function checkEventPermission(
  event: EventRef,
  permission: Permission
): Promise<AccessResult> {
  if (!getSupabaseConfig().configured) {
    return { ok: false, reason: 'auth_unavailable' };
  }
  const session = await getAdminSession();
  if (!session) return { ok: false, reason: 'unauthenticated' };
  if (session.aal !== 'aal2') return { ok: false, reason: 'mfa_required' };
  const permissions = effectivePermissions(await getMyMemberships(), event);
  if (!permissions.has(permission)) {
    return { ok: false, reason: 'no_membership' };
  }
  return { ok: true, session, permissions };
}

export async function checkPlatformAdmin(): Promise<AccessResult> {
  if (!getSupabaseConfig().configured) {
    return { ok: false, reason: 'auth_unavailable' };
  }
  const session = await getAdminSession();
  if (!session) return { ok: false, reason: 'unauthenticated' };
  if (session.aal !== 'aal2') return { ok: false, reason: 'mfa_required' };
  if (!isPlatformAdmin(await getMyMemberships())) {
    return { ok: false, reason: 'no_membership' };
  }
  return { ok: true, session, permissions: new Set() };
}
