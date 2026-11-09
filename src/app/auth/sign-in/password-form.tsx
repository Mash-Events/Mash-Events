'use client';

import { useActionState } from 'react';
import { signInWithPassword } from '@core/auth/actions';
import { Field, FormNotice, SubmitButton } from '../_components/fields';

export function PasswordForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInWithPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormNotice state={state} />
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
