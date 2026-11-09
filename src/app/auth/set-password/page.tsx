'use client';

import { useActionState } from 'react';
import { setPassword } from '@core/auth/actions';
import { Field, FormNotice, SubmitButton } from '../_components/fields';

export default function SetPasswordPage() {
  const [state, action] = useActionState(setPassword, undefined);
  return (
    <div className="mt-2 space-y-6">
      <h1 className="text-2xl font-semibold text-stone-900">Set a password</h1>
      <p className="text-sm text-stone-600">
        At least 12 characters with upper and lower case letters, a digit and a
        symbol. A password manager is best. You can also sign in with Google
        instead.
      </p>
      <form action={action} className="space-y-4">
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
        <Field
          label="Repeat password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
        <FormNotice state={state} />
        <SubmitButton>Save and continue</SubmitButton>
      </form>
    </div>
  );
}
