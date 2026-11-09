import { confirmEmailLink } from '@core/auth/actions';
import { SubmitButton } from '../_components/fields';

// Invite and password-reset emails link here. GET only shows a button; the
// one-time token is used on POST, so email link scanners cannot consume it.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash =
    typeof params.token_hash === 'string' ? params.token_hash : '';
  const type = typeof params.type === 'string' ? params.type : '';
  const label =
    type === 'invite'
      ? 'Accept invitation'
      : type === 'recovery'
        ? 'Reset my password'
        : 'Continue';

  return (
    <div className="mt-2 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">{label}</h1>
      {tokenHash ? (
        <form action={confirmEmailLink}>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <SubmitButton>{label}</SubmitButton>
        </form>
      ) : (
        <p className="text-sm text-stone-700">
          This link is incomplete. Open the latest email again.
        </p>
      )}
    </div>
  );
}
