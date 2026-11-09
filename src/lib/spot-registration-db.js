import { getSupabaseAdmin } from '@/lib/supabase-admin';
import spotUtils from '@/lib/spot-registration-utils.cjs';

const { normalizeSpotRow } = spotUtils;
const SELECT =
  'id,full_name,email,designation,organization,event_day,desk_label,checked_in_at,email_status,provider_message_id,last_email_error,created_by_email';

function safeSearch(value) {
  return String(value || '')
    .replace(/[%_,()'"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function findAdvanceRegistration(email) {
  const { data, error } = await getSupabaseAdmin()
    .from('event_registrations')
    .select('id')
    .eq('email', email)
    .limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

export async function findEarlierSpotRegistration(email, eventDay) {
  const { data, error } = await getSupabaseAdmin()
    .from('spot_registrations')
    .select('email_status')
    .eq('email', email)
    .lt('event_day', eventDay)
    .order('event_day', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

export async function createSpotRegistration({
  input,
  eventDay,
  operator,
  emailStatus = 'sending',
}) {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('spot_registrations')
    .insert({
      full_name: input.fullName,
      email: input.email,
      designation: input.designation || null,
      organization: input.organization || null,
      desk_label: input.deskLabel || null,
      event_day: eventDay,
      checked_in_at: now,
      email_status: emailStatus,
      created_by_clerk_id: operator?.userId || null,
      created_by_email: operator?.primaryEmail || null,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('This email is already checked in for today.');
    }
    throw new Error(error.message);
  }
  return normalizeSpotRow(data);
}

export async function finishSpotRegistrationEmail({
  id,
  status,
  providerMessageId = null,
  errorMessage = null,
}) {
  const { data, error } = await getSupabaseAdmin()
    .from('spot_registrations')
    .update({
      email_status: status,
      provider_message_id: providerMessageId,
      last_email_error: errorMessage
        ? String(errorMessage).slice(0, 1000)
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('email_status', 'sending')
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return normalizeSpotRow(data);
}

export async function listSpotRegistrations({
  page = 1,
  pageSize = 50,
  search = '',
  eventDay = 'all',
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(500, Math.max(1, Number(pageSize) || 50));
  const term = safeSearch(search);
  let query = getSupabaseAdmin()
    .from('spot_registrations')
    .select(SELECT, { count: 'exact' })
    .order('checked_in_at', { ascending: false })
    .order('id', { ascending: false });

  if (eventDay === '1' || eventDay === '2') {
    query = query.eq('event_day', Number(eventDay));
  }
  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,email.ilike.%${term}%,organization.ilike.%${term}%`
    );
  }

  const from = (safePage - 1) * safePageSize;
  const { data, error, count } = await query.range(
    from,
    from + safePageSize - 1
  );
  if (error) throw new Error(error.message);
  return {
    registrations: (data || []).map(normalizeSpotRow),
    meta: {
      page: safePage,
      pageSize: safePageSize,
      total: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / safePageSize)),
    },
  };
}

export async function listAllSpotRegistrations(filters = {}) {
  const rows = [];
  let page = 1;
  for (;;) {
    const result = await listSpotRegistrations({
      ...filters,
      page,
      pageSize: 500,
    });
    rows.push(...result.registrations);
    if (page >= result.meta.totalPages) return rows;
    page += 1;
  }
}
