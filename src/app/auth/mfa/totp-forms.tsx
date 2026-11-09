'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  startTotpEnrolment,
  verifyTotp,
  type EnrolResult,
} from '@core/auth/actions';
import { Field, FormNotice, SubmitButton } from '../_components/fields';

function CodeForm({ factorId, next }: { factorId: string; next: string }) {
  const [state, action] = useActionState(verifyTotp, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next} />
      <Field
        label="6-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        required
      />
      <FormNotice state={state} />
      <SubmitButton>Verify</SubmitButton>
    </form>
  );
}

export function VerifyTotp({
  factorId,
  next,
}: {
  factorId: string;
  next: string;
}) {
  return (
    <>
      <p className="text-sm text-stone-600">
        Enter the code from your authenticator app.
      </p>
      <CodeForm factorId={factorId} next={next} />
    </>
  );
}

export function EnrolTotp({ next }: { next: string }) {
  const [enrolment, setEnrolment] = useState<EnrolResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!enrolment || !enrolment.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Admin access needs an authenticator app (Google Authenticator,
          1Password, Authy or similar). Set it up once; you will enter a code
          each time you sign in.
        </p>
        {enrolment && !enrolment.ok ? (
          <p role="alert" className="text-sm text-red-700">
            {enrolment.error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () =>
              setEnrolment(await startTotpEnrolment())
            )
          }
          className="w-full rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {pending ? 'Please wait…' : 'Start set-up'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Scan this QR code with your authenticator app, then enter the code it
        shows.
      </p>
      {/* Supabase returns the QR code as an SVG data URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={enrolment.qrCode}
        alt="QR code for your authenticator app"
        width={180}
        height={180}
        className="mx-auto"
      />
      <details className="text-xs text-stone-500">
        <summary>Can&apos;t scan? Enter this key instead</summary>
        <code className="mt-1 block break-all">{enrolment.secret}</code>
      </details>
      <CodeForm factorId={enrolment.factorId} next={next} />
    </div>
  );
}
