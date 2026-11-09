// Auth/runtime configuration read from env (placeholders in .env.example).
import type { CookieOptions } from '@supabase/ssr';
import { parseHostList } from '../routing/resolve';

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
  return { url, publishableKey, configured: Boolean(url && publishableKey) };
}

export function isProduction() {
  return process.env.MASH_ENV === 'production';
}

/**
 * Admin auth cookies: HttpOnly, host-only (no Domain), SameSite=Lax, so org
 * subdomains never receive them and page scripts cannot read them (§6.4).
 */
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

export function getAdminHosts() {
  const hosts = parseHostList(process.env.MASH_ADMIN_HOSTS);
  return hosts.length ? hosts : ['admin.localhost'];
}

export function getRootHosts() {
  const hosts = parseHostList(process.env.MASH_ROOT_HOSTS);
  return hosts.length ? hosts : ['localhost', '127.0.0.1'];
}

export function getSessionActivitySecret() {
  return process.env.SESSION_ACTIVITY_SECRET?.trim() || '';
}
