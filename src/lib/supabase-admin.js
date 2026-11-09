import 'server-only';
import { createClient } from '@supabase/supabase-js';

// The only module that may hold the Supabase secret
// (service-role) key; moves to core/db/privileged/client.ts in the refactor
// (docs/system-design.md §12.4).

let client;

export function getSupabaseAdmin() {
  if (client) {
    return client;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL for server-side Supabase admin client.'
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SECRET_KEY for server-side Supabase admin client.'
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}
