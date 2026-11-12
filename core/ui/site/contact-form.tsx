'use client';

import { useRef, useState } from 'react';
import { useTurnstile } from './registration-form';

// Contact form island (docs/system-design.md §16.4), styled after the seed
// site's application forms: white inputs on a dark card, uppercase labels,
// and an inline status line instead of a page swap. Posts to
// <basePath>/api/submit with kind 'contact' — the same generic endpoint that
// carries speaker, volunteer and media-accreditation forms.

type Props = {
  basePath: string;
  privacyUrl?: string;
  termsUrl?: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

const TOPICS = [
  'General enquiry',
  'Registration',
  'Sponsorship',
  'Partnership',
  'Press',
] as const;

const field =
  'h-11 w-full rounded-[10px] border-0 bg-white px-4 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-white';
const label =
  'mb-2 block text-xs font-black uppercase tracking-[0.12em] text-white';

export function ContactForm({ basePath, privacyUrl, termsUrl }: Props) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    message: '',
    topic: TOPICS[0] as string,
  });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const captchaBox = useRef<HTMLDivElement>(null);
  const turnstile = useTurnstile(captchaBox, 'submit');

  function update(
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      kind: 'contact',
      name: form.name.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
      payload: { topic: form.topic },
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
        setForm({ name: '', email: '', message: '', topic: TOPICS[0] });
        setStatus({
          kind: 'done',
          message:
            (data.message as string | undefined) ??
            'Message received. The team will get back to you.',
        });
        return;
      }
      turnstile.reset();
      setStatus({
        kind: 'error',
        message:
          (data.message as string | undefined) ??
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
    <form onSubmit={submit} noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className={label}>
            Full name *
          </label>
          <input
            id="contact-name"
            name="name"
            value={form.name}
            onChange={update}
            required
            maxLength={100}
            autoComplete="name"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className={label}>
            Email *
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            value={form.email}
            onChange={update}
            required
            maxLength={320}
            autoComplete="email"
            className={field}
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="contact-topic" className={label}>
            Topic
          </label>
          <select
            id="contact-topic"
            name="topic"
            value={form.topic}
            onChange={update}
            className={field}
          >
            {TOPICS.map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="contact-message" className={label}>
            Message *
          </label>
          <textarea
            id="contact-message"
            name="message"
            value={form.message}
            onChange={update}
            required
            maxLength={4000}
            rows={5}
            className={`${field} h-auto py-3`}
          />
        </div>
      </div>

      <div ref={captchaBox} className="mt-4" />

      <div className="mt-5">
        <button
          type="submit"
          disabled={sending || (turnstile.required && !turnstile.token)}
          className="h-auto rounded-xl bg-white px-6 py-3.5 text-xs font-black uppercase tracking-[0.12em] text-stone-900 transition-colors hover:bg-stone-100 disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Send message'}
        </button>
      </div>

      {status.kind === 'done' || status.kind === 'error' ? (
        <p
          className="mt-3 text-sm leading-relaxed text-white/88"
          role="status"
          aria-live="polite"
        >
          {status.message}
        </p>
      ) : null}

      {privacyUrl || termsUrl ? (
        <p className="mt-4 text-sm leading-relaxed text-white/82">
          Your personal data will be processed in line with our{' '}
          {privacyUrl ? (
            <a
              className="font-semibold underline underline-offset-4"
              href={privacyUrl}
            >
              privacy policy
            </a>
          ) : null}
          {privacyUrl && termsUrl ? ' and ' : null}
          {termsUrl ? (
            <a
              className="font-semibold underline underline-offset-4"
              href={termsUrl}
            >
              terms
            </a>
          ) : null}
          .
        </p>
      ) : null}
    </form>
  );
}
