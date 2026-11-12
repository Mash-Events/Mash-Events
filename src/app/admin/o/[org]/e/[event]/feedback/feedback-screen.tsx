'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, eventApi } from '@core/admin/api-client';

// Feedback tab (docs/system-design.md §16.4): the per-event feedback form
// editor (content.edit), the response list (registrations.read), the
// "request feedback" bulk email (messages.bulk) and the CSV export
// (exports.pii).

type Question = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
  required?: boolean;
};

type FeedbackForm = {
  enabled: boolean;
  headline: string;
  thanks: string;
  questions: Question[];
};

type Response = {
  id: string;
  rating: number | null;
  answers: Record<string, string>;
  submitted_at: string;
  registrations: { code: string; first_name: string; last_name: string } | null;
};

const input =
  'mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900';

export function FeedbackScreen({
  eventId,
  canEdit,
  canRequest,
  canExport,
}: {
  eventId: string;
  canEdit: boolean;
  canRequest: boolean;
  canExport: boolean;
}) {
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [responses, setResponses] = useState<Response[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    eventApi<{ form: FeedbackForm; responses: Response[] }>(
      eventId,
      '/feedback'
    )
      .then((data) => {
        setForm(data.form);
        setResponses(data.responses);
      })
      .catch((e) =>
        setNote(
          e instanceof AdminApiError ? e.message : 'Could not load feedback.'
        )
      );
  }, [eventId]);

  useEffect(load, [load]);

  async function save() {
    if (!form || busy) return;
    setBusy('save');
    setNote(null);
    try {
      await eventApi(eventId, '/feedback', { method: 'POST', body: form });
      setNote('Form saved.');
    } catch (e) {
      setNote(e instanceof AdminApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  }

  async function requestEmails() {
    if (busy) return;
    if (
      !window.confirm(
        'Email every confirmed attendee a link to the feedback form? Attendees already asked are skipped.'
      )
    ) {
      return;
    }
    setBusy('request');
    setNote(null);
    try {
      const out = await eventApi<{ result: string; queued?: number }>(
        eventId,
        '/feedback/request',
        { method: 'POST' }
      );
      setNote(
        out.result === 'queued'
          ? `${out.queued ?? 0} feedback email(s) queued.`
          : out.result === 'form_disabled'
            ? 'Enable the form first.'
            : 'No confirmed registrations to email.'
      );
    } catch (e) {
      setNote(e instanceof AdminApiError ? e.message : 'Could not request.');
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    if (busy) return;
    setBusy('export');
    try {
      const result = await eventApi<{ url: string; count: number }>(
        eventId,
        '/exports/feedback',
        { method: 'POST', body: { format: 'csv' } }
      );
      window.open(result.url, '_blank', 'noopener');
    } catch (e) {
      setNote(e instanceof AdminApiError ? e.message : 'The export failed.');
    } finally {
      setBusy(null);
    }
  }

  function setQuestion(index: number, patch: Partial<Question>) {
    setForm((current) => {
      if (!current) return current;
      const questions = [...current.questions];
      questions[index] = { ...questions[index], ...patch };
      return { ...current, questions };
    });
  }

  const rated = (responses ?? []).filter((r) => r.rating != null);
  const avg =
    rated.length > 0
      ? (
          rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length
        ).toFixed(1)
      : null;

  if (!form || responses === null) {
    return <p className="text-sm text-stone-500">{note ?? 'Loading…'}</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Feedback</h1>
          <p className="text-sm text-stone-600">
            The per-event feedback form, its responses, and the request email.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRequest ? (
            <button
              type="button"
              onClick={requestEmails}
              disabled={busy !== null}
              className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {busy === 'request' ? 'Queueing…' : 'Request feedback emails'}
            </button>
          ) : null}
          {canExport && responses.length > 0 ? (
            <button
              type="button"
              onClick={exportCsv}
              disabled={busy !== null}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              {busy === 'export' ? 'Preparing…' : 'Export responses'}
            </button>
          ) : null}
        </div>
      </div>

      {note ? <p className="text-sm text-stone-700">{note}</p> : null}

      {canEdit ? (
        <section className="space-y-4 rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900">
              Form (lives at /feedback on the event site)
            </h2>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Open for responses
            </label>
          </div>
          <label className="block text-sm font-medium text-stone-800">
            Headline
            <input
              className={input}
              value={form.headline}
              maxLength={120}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-stone-800">
            Thank-you message
            <input
              className={input}
              value={form.thanks}
              maxLength={200}
              onChange={(e) => setForm({ ...form, thanks: e.target.value })}
            />
          </label>

          <div className="space-y-3">
            {form.questions.map((question, index) => (
              <div
                key={question.key}
                className="grid gap-2 rounded-md border border-stone-200 p-3 sm:grid-cols-[1fr_120px_1fr_auto]"
              >
                <input
                  className={input}
                  value={question.label}
                  maxLength={120}
                  placeholder="Question"
                  onChange={(e) =>
                    setQuestion(index, { label: e.target.value })
                  }
                />
                <select
                  className={input}
                  value={question.type}
                  onChange={(e) =>
                    setQuestion(index, {
                      type: e.target.value as Question['type'],
                    })
                  }
                >
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Choice</option>
                </select>
                {question.type === 'select' ? (
                  <input
                    className={input}
                    value={(question.options ?? []).join(', ')}
                    placeholder="Options, comma separated"
                    onChange={(e) =>
                      setQuestion(index, {
                        options: e.target.value
                          .split(',')
                          .map((o) => o.trim())
                          .filter(Boolean)
                          .slice(0, 6),
                      })
                    }
                  />
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      questions: form.questions.filter((_, i) => i !== index),
                    })
                  }
                  className="self-center rounded-md border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Remove
                </button>
              </div>
            ))}
            {form.questions.length < 8 ? (
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    questions: [
                      ...form.questions,
                      {
                        key: `q_${Date.now().toString(36)}`,
                        label: '',
                        type: 'textarea',
                      },
                    ],
                  })
                }
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
              >
                + Add question
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={busy !== null}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save form'}
          </button>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-stone-900">
          Responses {responses.length > 0 ? `(${responses.length})` : ''}
          {avg ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              ★ {avg} / 5
            </span>
          ) : null}
        </h2>
        {responses.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            No feedback yet. Open the form and use “Request feedback emails”
            after the event.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {responses.map((response) => (
              <li
                key={response.id}
                className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <p className="text-xs text-stone-500">
                  {response.registrations
                    ? `${response.registrations.first_name} ${response.registrations.last_name} · ${response.registrations.code} · `
                    : 'Anonymous · '}
                  {new Date(response.submitted_at).toLocaleString('en-IN')}
                  {response.rating ? ` · ★ ${response.rating}/5` : ''}
                </p>
                {Object.entries(response.answers).map(([key, value]) => (
                  <p key={key} className="mt-2 text-stone-800">
                    {value}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
