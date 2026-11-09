'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormQuestion } from '../../site/types';

// Registration form island (docs/system-design.md §7, §10.2). Posts to
// <basePath>/api/register on the event's own host; the proxy decides which
// event that is. Turnstile loads only when the form becomes visible.

type Props = {
  basePath: string;
  open: boolean;
  questions?: FormQuestion[];
  privacyUrl?: string;
  closedMessage?: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string; fields?: Record<string, string> };

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: Record<string, unknown>
      ) => string | undefined;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function useTurnstile(container: React.RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState<string | undefined>();
  const widget = useRef<string | undefined>(undefined);

  useEffect(() => {
    const el = container.current;
    if (!SITE_KEY || !el) return;
    const render = () => {
      if (window.turnstile && el && !widget.current) {
        widget.current = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          action: 'register',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(undefined),
        });
      }
    };
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      if (window.turnstile) return render();
      const script = document.createElement('script');
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [container]);

  const reset = () => {
    setToken(undefined);
    if (widget.current) window.turnstile?.reset(widget.current);
  };
  return { token, reset, required: Boolean(SITE_KEY) };
}

const input =
  'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900';

export function RegistrationForm({
  basePath,
  open,
  questions = [],
  privacyUrl,
  closedMessage = 'Registration is not open right now.',
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [whatsapp, setWhatsapp] = useState(false);
  const captchaBox = useRef<HTMLDivElement>(null);
  const turnstile = useTurnstile(captchaBox);

  if (!open) {
    return (
      <p className="rounded-lg bg-stone-100 p-5 text-stone-700">
        {closedMessage}
      </p>
    );
  }

  if (status.kind === 'done') {
    return (
      <div role="status" className="rounded-lg bg-green-50 p-6 text-green-900">
        <p className="text-lg font-semibold">You&apos;re registered.</p>
        <p className="mt-1">{status.message}</p>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const answers: Record<string, string> = {};
    for (const q of questions) {
      const value = text(`q_${q.key}`);
      if (value) answers[q.key] = value;
    }
    const body = {
      first_name: text('first_name'),
      last_name: text('last_name'),
      email: text('email'),
      organisation: text('organisation') || undefined,
      phone: text('phone') || undefined,
      whatsapp_opt_in: whatsapp,
      consent: form.get('consent') === 'on',
      answers,
      turnstile_token: turnstile.token,
    };

    setStatus({ kind: 'sending' });
    try {
      const res = await fetch(`${basePath}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({ kind: 'done', message: data.message });
        return;
      }
      turnstile.reset();
      const fields: Record<string, string> = {};
      for (const issue of data.issues ?? []) {
        if (issue.field && !fields[issue.field])
          fields[issue.field] = issue.message;
      }
      setStatus({
        kind: 'error',
        fields,
        message:
          data.message ??
          (res.status === 429
            ? 'Too many attempts. Please try again later.'
            : res.status === 403
              ? 'We could not verify this request. Please try again.'
              : Object.keys(fields).length
                ? 'Please check the highlighted fields.'
                : 'Something went wrong. Please try again.'),
      });
    } catch {
      turnstile.reset();
      setStatus({
        kind: 'error',
        message: 'Network error. Please check your connection and try again.',
      });
    }
  }

  const fieldError = (name: string) =>
    status.kind === 'error' ? status.fields?.[name] : undefined;
  const sending = status.kind === 'sending';

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="First name"
          name="first_name"
          required
          autoComplete="given-name"
          error={fieldError('first_name')}
        />
        <Field
          label="Last name"
          name="last_name"
          autoComplete="family-name"
          error={fieldError('last_name')}
        />
      </div>
      <Field
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        error={fieldError('email')}
      />
      <Field
        label="Organisation"
        name="organisation"
        autoComplete="organization"
        error={fieldError('organisation')}
      />

      {questions.map((q) => (
        <label key={q.key} className="block text-sm font-medium text-stone-800">
          {q.label}
          {q.required ? ' *' : ''}
          {q.type === 'select' ? (
            <select
              name={`q_${q.key}`}
              required={q.required}
              className={input}
              defaultValue=""
            >
              <option value="" disabled>
                Choose…
              </option>
              {q.options?.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          ) : q.type === 'textarea' ? (
            <textarea
              name={`q_${q.key}`}
              required={q.required}
              maxLength={q.maxLength ?? 2000}
              rows={3}
              className={input}
            />
          ) : (
            <input
              name={`q_${q.key}`}
              required={q.required}
              maxLength={q.maxLength ?? 200}
              className={input}
            />
          )}
        </label>
      ))}

      <div className="space-y-2 rounded-lg border border-stone-200 p-4">
        <label className="flex items-start gap-2 text-sm text-stone-800">
          <input
            type="checkbox"
            className="mt-1"
            checked={whatsapp}
            onChange={(e) => setWhatsapp(e.target.checked)}
          />
          Send me event updates on WhatsApp
        </label>
        {whatsapp ? (
          <Field
            label="WhatsApp number"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            error={fieldError('phone')}
          />
        ) : null}
      </div>

      <label className="flex items-start gap-2 text-sm text-stone-800">
        <input type="checkbox" name="consent" className="mt-1" required />
        <span>
          I agree to my details being used to manage my registration for this
          event
          {privacyUrl ? (
            <>
              {' '}
              (
              <a href={privacyUrl} className="underline">
                privacy notice
              </a>
              )
            </>
          ) : null}
          .
        </span>
      </label>
      {fieldError('consent') ? (
        <p className="text-sm text-red-700">{fieldError('consent')}</p>
      ) : null}

      <div ref={captchaBox} />

      {status.kind === 'error' ? (
        <p role="alert" className="text-sm text-red-700">
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={sending || (turnstile.required && !turnstile.token)}
        className="w-full rounded-md bg-stone-950 px-5 py-3 text-base font-semibold text-white hover:bg-stone-800 disabled:opacity-60 sm:w-auto"
      >
        {sending ? 'Registering…' : 'Register'}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  ...rest
}: {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium text-stone-800">
      {label}
      {rest.required ? ' *' : ''}
      <input
        {...rest}
        aria-invalid={error ? true : undefined}
        className={`${input} ${error ? 'border-red-500' : ''}`}
      />
      {error ? (
        <span className="mt-1 block text-sm text-red-700">{error}</span>
      ) : null}
    </label>
  );
}
