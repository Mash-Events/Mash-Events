import { redirect } from 'next/navigation';
import { createAuthClient, getAdminSession } from '@core/auth/server';
import { signOut } from '@core/auth/actions';
import { EnrolTotp, VerifyTotp } from './totp-forms';

// Every admin needs TOTP (docs/system-design.md §6.3): enrol on first sign-in,
// verify on every later one. Google's own 2-step does not count.
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : '/admin';

  const session = await getAdminSession();
  if (!session) redirect('/auth/sign-in');
  if (session.aal === 'aal2')
    redirect(next.startsWith('/admin') ? next : '/admin');

  const supabase = await createAuthClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = (data?.totp ?? []).find((f) => f.status === 'verified');

  return (
    <div className="mt-2 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">
        {verified ? 'Two-step verification' : 'Set up two-step verification'}
      </h1>
      {verified ? (
        <VerifyTotp factorId={verified.id} next={next} />
      ) : (
        <EnrolTotp next={next} />
      )}
      <form action={signOut}>
        <button type="submit" className="text-sm text-stone-500 underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
