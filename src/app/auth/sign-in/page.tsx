import Link from 'next/link';
import { signInWithGoogle } from '@core/auth/actions';
import { SubmitButton } from '../_components/fields';
import { PasswordForm } from './password-form';

const NOTICES: Record<string, string> = {
  expired: 'Your session ended. Please sign in again.',
  link: 'That link is invalid or has expired.',
  oauth:
    'Google sign-in did not complete. Ask a super admin for an invite if you have none.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : '/admin';
  const noticeKey =
    params.expired === '1'
      ? 'expired'
      : typeof params.error === 'string'
        ? params.error
        : '';
  const notice = NOTICES[noticeKey];

  return (
    <div className="mt-2 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">Sign in</h1>
      {notice ? (
        <p
          role="status"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      ) : null}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <SubmitButton variant="secondary">Continue with Google</SubmitButton>
      </form>

      <div className="flex items-center gap-3 text-xs text-stone-400">
        <span className="h-px flex-1 bg-stone-200" />
        or
        <span className="h-px flex-1 bg-stone-200" />
      </div>

      <PasswordForm next={next} />

      <p className="text-center text-sm">
        <Link href="/auth/reset" className="text-stone-600 underline">
          Forgot your password?
        </Link>
      </p>
      <p className="text-center text-xs text-stone-500">
        Access is by invitation only.
      </p>
    </div>
  );
}
