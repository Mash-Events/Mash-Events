import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The ONLY place that holds the Supabase secret (service-role) key
// (docs/system-design.md §12.4). Lint forbids importing it elsewhere except
// core/db/privileged/**, core/auth/invite.ts and app/api/internal/**.
// Every helper built on it takes the event id as its first argument.

let client: SupabaseClient | null = null;

export function getPrivilegedClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY for the privileged client.'
    );
  }
  client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
