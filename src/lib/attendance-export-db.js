import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function listAllDailyCheckIns(eventDay = 'all') {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let query = getSupabaseAdmin()
      .from('registration_daily_check_ins')
      .select(
        `event_day,checked_in_at,desk_label,
         registration:event_registrations (
           first_name,last_name,email,organization,registration_code
         )`
      )
      .order('checked_in_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (eventDay === '1' || eventDay === '2') {
      query = query.eq('event_day', Number(eventDay));
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
