import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@core/auth/server';

// POST only (used by the admin shell's sign-out button). The proxy has
// already rejected cross-site requests on the admin host.
export async function POST(request: NextRequest) {
  const supabase = await createAuthClient();
  await supabase.auth.signOut({ scope: 'local' });
  const target = request.nextUrl.clone();
  target.pathname = '/auth/sign-in';
  target.search = '';
  const response = NextResponse.redirect(target, 303);
  response.cookies.delete('mash_seen');
  return response;
}
