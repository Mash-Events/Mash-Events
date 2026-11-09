import { getSupabaseAdmin } from '@/lib/supabase-admin';

const HEADER_NAME = 'idempotency-key';
const MAX_KEY_LENGTH = 180;

export function getIdempotencyKey(request, fallback = '') {
  const raw = request.headers.get(HEADER_NAME) || fallback;
  return String(raw || '')
    .normalize('NFKC')
    .replace(/[^\w:.-]/g, '')
    .slice(0, MAX_KEY_LENGTH);
}

export async function getCompletedIdempotentResponse(scope, key) {
  if (!key) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('app_idempotency_keys')
    .select('response,status')
    .eq('scope', scope)
    .eq('idempotency_key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data || data.status !== 'completed') return null;
  return data.response ?? null;
}

export async function storeIdempotentResponse(
  scope,
  key,
  response,
  requester = null
) {
  if (!key) return;
  const supabase = getSupabaseAdmin();
  await supabase.from('app_idempotency_keys').upsert({
    scope,
    idempotency_key: key,
    requester,
    response,
    status: 'completed',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}
