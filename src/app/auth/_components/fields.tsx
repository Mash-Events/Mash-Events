'use client';

import { useFormStatus } from 'react-dom';

export function Field({
  label,
  ...input
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <input
        {...input}
        className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
      />
    </label>
  );
}

export function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  const style =
    variant === 'primary'
      ? 'bg-stone-900 text-white hover:bg-stone-700'
      : 'border border-stone-300 bg-white text-stone-900 hover:bg-stone-50';
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${style}`}
    >
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export function FormNotice({
  state,
}: {
  state: { error?: string; message?: string } | undefined;
}) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state?.message) {
    return <p className="text-sm text-stone-700">{state.message}</p>;
  }
  return null;
}
