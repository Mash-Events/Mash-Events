import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@core/auth/server';

// Google OAuth return (PKCE): exchange the code for a session, then MFA.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/admin';
  const safeNext =
    next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';

  const target = url.clone();
  target.search = '';

  if (!code) {
    target.pathname = '/auth/sign-in';
    target.searchParams.set('error', 'oauth');
    return NextResponse.redirect(target, 303);
  }

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Uninvited Google accounts end here: sign-ups are disabled (§6.2).
    target.pathname = '/auth/sign-in';
    target.searchParams.set('error', 'oauth');
    return NextResponse.redirect(target, 303);
  }

  target.pathname = '/auth/mfa';
  target.searchParams.set('next', safeNext);
  return NextResponse.redirect(target, 303);
}
