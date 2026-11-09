'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset } from '@core/auth/actions';
import { Field, FormNotice, SubmitButton } from '../_components/fields';

export default function ResetPage() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <div className="mt-2 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">Reset password</h1>
      <form action={action} className="space-y-4">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <FormNotice state={state} />
        <SubmitButton>Send reset link</SubmitButton>
      </form>
      <p className="text-center text-sm">
        <Link href="/auth/sign-in" className="text-stone-600 underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
