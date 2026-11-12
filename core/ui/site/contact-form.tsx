'use client';

import { useRef, useState } from 'react';
import { useTurnstile } from './registration-form';

// Contact form island (docs/system-design.md §16.4). Posts to
// <basePath>/api/submit with kind 'contact' — the same generic endpoint that
// carries speaker, volunteer and media-accreditation forms. Turnstile loads
// only when the form becomes visible.

type Props = {
  basePath: string;
  heading?: string;
  blurb?: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

const TOPICS = [
  'General enquiry',
  'Sponsorship',
  'Partnership',
  'Press',
] as const;

const input =
  'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900';

export function ContactForm({
  basePath,
  heading = 'Get in touch',
  blurb = 'Questions, sponsorship, partnerships or press — send us a note and the team will get back to you.',
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const captchaBox = useRef<HTMLDivElement>(null);
  const turnstile = useTurnstile(captchaBox, 'submit');

  if (status.kind === 'done') {
    return (
      <div role="status" className="rounded-lg bg-green-50 p-6 text-green-900">
        <p className="text-lg font-semibold">Thank you.</p>
        <p className="mt-1">{status.message}</p>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const body = {
      kind: 'contact',
      name: text('name'),
      email: text('email'),
      message: text('message'),
      payload: { topic: text('topic') },
      turnstile_token: turnstile.token,
    };

    setStatus({ kind: 'sending' });
    try {
      const res = await fetch(`${basePath}/api/submit`, {
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
      setStatus({
        kind: 'error',
        message:
          data.message ??
          (res.status === 429
            ? 'Too many attempts. Please try again later.'
            : res.status === 403
              ? 'We could not verify this request. Please try again.'
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

  const sending = status.kind === 'sending';

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-semibold text-stone-900">{heading}</h2>
        <p className="mt-1 text-sm text-stone-600">{blurb}</p>
      </div>
      <label className="block text-sm font-medium text-stone-800">
        Topic
        <select name="topic" className={input} defaultValue={TOPICS[0]}>
          {TOPICS.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-stone-800">
          Name *
          <input
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-stone-800">
          Email *
          <input
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            className={input}
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-stone-800">
        Message *
        <textarea
          name="message"
          required
          maxLength={4000}
          rows={5}
          className={input}
        />
      </label>

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
        {sending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
