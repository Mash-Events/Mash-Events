'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, eventApi } from '@core/admin/api-client';
import { fromLocalInput, toLocalInput } from '@core/admin/time';
import { REGISTRATION_STATUSES } from '@core/registration/transitions';

// Bulk and scheduled email for one event (docs/system-design.md §12.11):
// compose → preview (selection frozen) → test to yourself → type the event
// name to send or schedule. Reminders are scheduled messages; their audience
// is worked out at send time.

type Preview = {
  intent_id: string;
  count: number;
  selection_hash: string;
  event_name: string;
  sample: { name: string; email: string }[];
};

type MessageRow = {
  id: string;
  audience: string[];
  subject: string;
  include_join_link: boolean;
  send_at: string | null;
  count: number;
  status: string;
  tested_at: string | null;
  created_at: string;
  expires_at: string;
  progress: Record<string, number> | null;
};

const input =
  'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm';
const primary =
  'rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50';
const secondary =
  'rounded-md border border-stone-300 bg-white px-4 py-2 text-sm hover:bg-stone-50 disabled:opacity-50';

function errorText(e: unknown) {
  return e instanceof AdminApiError ? e.message : 'Something went wrong.';
}

export function MessagesScreen({
  eventId,
  eventName,
  timezone,
}: {
  eventId: string;
  eventName: string;
  timezone: string;
}) {
  const [audience, setAudience] = useState<string[]>(['confirmed']);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeJoinLink, setIncludeJoinLink] = useState(false);
  const [attachAgenda, setAttachAgenda] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [testedTo, setTestedTo] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [history, setHistory] = useState<MessageRow[]>([]);

  const fetchHistory = useCallback(
    () => eventApi<{ messages: MessageRow[] }>(eventId, '/messages'),
    [eventId]
  );
  const reloadHistory = useCallback(
    () =>
      fetchHistory().then(
        (res) => setHistory(res.messages),
        () => undefined
      ),
    [fetchHistory]
  );
  useEffect(() => {
    let active = true;
    fetchHistory().then(
      (res) => active && setHistory(res.messages),
      () => undefined
    );
    return () => {
      active = false;
    };
  }, [fetchHistory]);

  function resetDraft() {
    setPreview(null);
    setTestedTo(null);
    setTyped('');
  }

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setNotice(null);
    try {
      return await action();
    } catch (e) {
      setNotice({ ok: false, text: errorText(e) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function makePreview(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      eventApi<{ preview: Preview }>(eventId, '/messages', {
        method: 'POST',
        body: {
          audience,
          subject,
          body,
          include_join_link: includeJoinLink,
          attachments: attachAgenda ? ['agenda_pdf'] : [],
          send_at: schedule ? fromLocalInput(sendAt, timezone) : null,
        },
      })
    );
    if (res) {
      setPreview(res.preview);
      setTestedTo(null);
      setTyped('');
      void reloadHistory();
    }
  }

  async function sendTest() {
    if (!preview) return;
    const res = await run(() =>
      eventApi<{ sentTo: string }>(
        eventId,
        `/messages/${preview.intent_id}/test`,
        {
          method: 'POST',
        }
      )
    );
    if (res) setTestedTo(res.sentTo);
  }

  async function confirm() {
    if (!preview) return;
    const res = await run(() =>
      eventApi<{ result: string }>(
        eventId,
        `/messages/${preview.intent_id}/confirm`,
        {
          method: 'POST',
          body: { typed_name: typed, selection_hash: preview.selection_hash },
        }
      )
    );
    if (res) {
      setNotice({
        ok: true,
        text:
          res.result === 'scheduled'
            ? 'Scheduled. It will go to everyone in the audience at that time.'
            : `Sending to ${preview.count} people now.`,
      });
      setSubject('');
      setBody('');
      resetDraft();
      void reloadHistory();
    }
  }

  async function cancel(id: string) {
    if (!window.confirm('Cancel this message?')) return;
    const res = await run(() =>
      eventApi(eventId, `/messages/${id}/cancel`, { method: 'POST' })
    );
    if (res) void reloadHistory();
  }

  const nameMatches =
    typed.trim().replace(/\s+/g, ' ').toLowerCase() ===
    eventName.trim().replace(/\s+/g, ' ').toLowerCase();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Messages</h1>
        <p className="mt-1 text-sm text-stone-600">
          Email everyone in a status group now, or schedule a reminder. Times
          are in {timezone}.
        </p>
      </div>

      {notice ? (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`rounded-md p-3 text-sm ${notice.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
        >
          {notice.text}
        </p>
      ) : null}

      <form
        onSubmit={makePreview}
        className="space-y-4 rounded-lg border border-stone-200 bg-white p-6"
      >
        <fieldset>
          <legend className="text-sm font-medium text-stone-700">
            Send to
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {REGISTRATION_STATUSES.map((status) => (
              <label
                key={status}
                className="flex items-center gap-1.5 text-sm capitalize"
              >
                <input
                  type="checkbox"
                  checked={audience.includes(status)}
                  onChange={(e) => {
                    resetDraft();
                    setAudience((current) =>
                      e.target.checked
                        ? [...current, status]
                        : current.filter((s) => s !== status)
                    );
                  }}
                />
                {status}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium text-stone-700">
          Subject
          <input
            className={input}
            value={subject}
            maxLength={200}
            onChange={(e) => {
              resetDraft();
              setSubject(e.target.value);
            }}
            required
          />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Message
          <textarea
            className={input}
            rows={7}
            value={body}
            maxLength={5000}
            onChange={(e) => {
              resetDraft();
              setBody(e.target.value);
            }}
            placeholder={
              'Leave a blank line between paragraphs.\nEach email starts with "Dear <first name>,".'
            }
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={includeJoinLink}
            onChange={(e) => {
              resetDraft();
              setIncludeJoinLink(e.target.checked);
            }}
          />
          Include each confirmed person&apos;s personal webinar join link
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={attachAgenda}
            onChange={(e) => {
              resetDraft();
              setAttachAgenda(e.target.checked);
            }}
          />
          Attach the agenda as a PDF
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={schedule}
              onChange={(e) => {
                resetDraft();
                setSchedule(e.target.checked);
              }}
            />
            Schedule for later (reminder)
          </label>
          {schedule ? (
            <input
              type="datetime-local"
              className="rounded-md border border-stone-300 px-3 py-2 text-sm"
              value={sendAt}
              min={toLocalInput(new Date().toISOString(), timezone)}
              onChange={(e) => {
                resetDraft();
                setSendAt(e.target.value);
              }}
              required
            />
          ) : null}
        </div>
        <button
          type="submit"
          className={secondary}
          disabled={busy || audience.length === 0}
        >
          Preview
        </button>
      </form>

      {preview ? (
        <section className="space-y-4 rounded-lg border-2 border-stone-900 bg-white p-6">
          <h2 className="text-lg font-semibold text-stone-900">
            {schedule ? 'Schedule' : 'Send'} “{subject}” to {preview.count}{' '}
            {preview.count === 1 ? 'person' : 'people'} in {preview.event_name}
          </h2>
          {preview.sample.length ? (
            <ul className="text-sm text-stone-700">
              {preview.sample.map((p) => (
                <li key={p.email}>
                  {p.name} · {p.email}
                </li>
              ))}
              {preview.count > preview.sample.length ? (
                <li className="text-stone-500">
                  …and {preview.count - preview.sample.length} more
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm text-stone-600">
              Nobody matches right now
              {schedule ? '; the audience is checked again at send time' : ''}.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={secondary}
              onClick={sendTest}
              disabled={busy}
            >
              Send a test to me
            </button>
            {testedTo ? (
              <span className="text-sm text-green-700">
                Test sent to {testedTo}
              </span>
            ) : (
              <span className="text-sm text-stone-500">
                Required before sending
              </span>
            )}
          </div>

          <label className="block text-sm font-medium text-stone-700">
            Type the event name to confirm: <strong>{eventName}</strong>
            <input
              className={input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={!testedTo}
            />
          </label>
          <button
            type="button"
            className={primary}
            onClick={confirm}
            disabled={busy || !testedTo || !nameMatches}
          >
            {schedule ? 'Schedule message' : `Send to ${preview.count} now`}
          </button>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Sent and scheduled
        </h2>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {history
                .filter(
                  (m) =>
                    m.status !== 'previewed' ||
                    new Date(m.expires_at) > new Date()
                )
                .map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 font-medium text-stone-900">
                      {m.subject}
                    </td>
                    <td className="px-4 py-2 capitalize text-stone-600">
                      {m.audience.join(', ')}
                    </td>
                    <td className="px-4 py-2 text-stone-600">
                      {m.send_at
                        ? new Date(m.send_at).toLocaleString('en-IN', {
                            timeZone: timezone,
                          })
                        : 'Now'}
                    </td>
                    <td className="px-4 py-2 text-stone-600">
                      {m.status}
                      {m.progress
                        ? ` · ${m.progress.sent ?? 0} sent${m.progress.failed ? `, ${m.progress.failed} failed` : ''}${
                            (m.progress.queued ?? 0) +
                            (m.progress.retrying ?? 0) +
                            (m.progress.processing ?? 0)
                              ? `, ${(m.progress.queued ?? 0) + (m.progress.retrying ?? 0) + (m.progress.processing ?? 0)} pending`
                              : ''
                          }${m.progress.skipped ? `, ${m.progress.skipped} skipped` : ''}`
                        : ''}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {m.status === 'scheduled' || m.status === 'previewed' ? (
                        <button
                          type="button"
                          onClick={() => cancel(m.id)}
                          className="text-xs text-red-700 hover:underline"
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              {history.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-stone-500"
                  >
                    No messages yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
