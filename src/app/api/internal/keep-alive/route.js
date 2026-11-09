import { authorizeJobProcessorRequest } from '@/lib/job-processor-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// The Supabase Free plan pauses a project after 7 days
// without activity; this daily Vercel cron makes one tiny read so the database
// stays awake between events. It reads no personal data and stores nothing.
export async function GET(request) {
  const auth = await authorizeJobProcessorRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from('organizations')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    console.error('Supabase keep-alive failed', { message: error?.message });
    return Response.json(
      { success: false, error: 'Keep-alive failed.' },
      { status: 500 }
    );
  }
}
