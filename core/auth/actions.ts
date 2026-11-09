'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createAuthClient } from './server';

// Admin auth flows as server actions (docs/system-design.md §6.2–6.4), so the
// admin has no browser Supabase client and cookies stay HttpOnly.

export type FormState = { error?: string; message?: string } | undefined;

const GENERIC_SIGN_IN_ERROR = 'Email or password is incorrect.';

async function siteOrigin() {
  const h = await headers();
  const host = h.get('host') || 'admin.localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ||
    (host.startsWith('admin.localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Only same-site admin paths may be used as post-login redirects. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value || '');
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/admin';
  }
  return next.startsWith('/admin') ? next : '/admin';
}

function field(form: FormData, name: string) {
  return String(form.get(name) || '').trim();
}

export async function signInWithPassword(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') || '');
  const captchaToken = field(form, 'cf-turnstile-response') || undefined;
  if (!email || !password) return { error: 'Enter your email and password.' };

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (error) return { error: GENERIC_SIGN_IN_ERROR };
  redirect(`/auth/mfa?next=${encodeURIComponent(safeNext(form.get('next')))}`);
}

export async function signInWithGoogle(form: FormData) {
  const supabase = await createAuthClient();
  const next = safeNext(form.get('next'));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data?.url) redirect('/auth/sign-in?error=oauth');
  redirect(data.url);
}

/**
 * Invite / password-recovery links land on /auth/confirm, which only renders
 * a button; this POST does the one-time verification, so link scanners that
 * prefetch the URL cannot burn the token (§6.2).
 */
export async function confirmEmailLink(form: FormData) {
  const tokenHash = field(form, 'token_hash');
  const type = field(form, 'type') as EmailOtpType;
  if (!tokenHash || !['invite', 'recovery', 'email'].includes(type)) {
    redirect('/auth/sign-in?error=link');
  }
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error) redirect('/auth/sign-in?error=link');
  redirect(type === 'email' ? '/auth/mfa' : '/auth/set-password');
}

export async function setPassword(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const password = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');
  if (password.length < 12) {
    return { error: 'Use at least 12 characters.' };
  }
  if (password !== confirm) return { error: 'The passwords do not match.' };

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        'That password was not accepted. Use upper and lower case letters, a digit and a symbol.',
    };
  }
  redirect('/auth/mfa');
}

export async function requestPasswordReset(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const email = field(form, 'email').toLowerCase();
  const captchaToken = field(form, 'cf-turnstile-response') || undefined;
  if (email) {
    const supabase = await createAuthClient();
    // The response never says whether the address exists.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteOrigin()}/auth/confirm`,
      captchaToken,
    });
  }
  return {
    message: 'If that address belongs to an admin, a reset link is on its way.',
  };
}

export type EnrolResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

export async function startTotpEnrolment(): Promise<EnrolResult> {
  const supabase = await createAuthClient();
  // Clear abandoned, unverified factors so a retry can enrol again.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { ok: false, error: 'Could not start set-up.' };
  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function verifyTotp(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const factorId = field(form, 'factorId');
  const code = field(form, 'code').replace(/\s+/g, '');
  if (!factorId || !/^\d{6}$/.test(code)) {
    return { error: 'Enter the 6-digit code from your authenticator app.' };
  }
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code,
  });
  if (error) return { error: 'That code did not work. Try the next one.' };
  redirect(safeNext(form.get('next')));
}

export async function signOut() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/auth/sign-in');
}
