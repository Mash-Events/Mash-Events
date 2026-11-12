'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, eventApi } from '@core/admin/api-client';

// Announcement composer on the event Overview (docs/system-design.md §10.1):
// publish short status posts; the latest shows as a stripe under the event
// site's hero. content.edit only.

type Announcement = {
  id: string;
  body: string;
  level: 'info' | 'highlight';
  status: string;
  published_at: string;
};

export function AnnouncementsComposer({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [body, setBody] = useState('');
  const [level, setLevel] = useState<'info' | 'highlight'>('info');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    eventApi<{ announcements: Announcement[] }>(eventId, '/announcements')
      .then((data) => setRows(data.announcements))
      .catch(() => setRows([]));
  }, [eventId]);

  useEffect(load, [load]);

  async function publish() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await eventApi(eventId, '/announcements', {
        method: 'POST',
        body: { body: body.trim(), level },
      });
      setBody('');
      setNote('Published — live on the site within a minute.');
      load();
    } catch (e) {
      setNote(e instanceof AdminApiError ? e.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  }

  async function hide(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await eventApi(eventId, '/announcements/hide', {
        method: 'POST',
        body: { announcementId: id },
      });
      load();
    } catch {
      /* the reload shows the unchanged row */
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
        Announcements
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        Short status posts shown as a stripe under the event site&apos;s hero.
      </p>
      <div className="mt-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Doors open at 9:00. Bring your QR pass!"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as 'info' | 'highlight')}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="info">Info (light stripe)</option>
            <option value="highlight">Highlight (bold stripe)</option>
          </select>
          <button
            type="button"
            onClick={publish}
            disabled={busy || !body.trim()}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? 'Publishing…' : 'Publish'}
          </button>
          {note ? <span className="text-sm text-stone-600">{note}</span> : null}
        </div>
      </div>

      {rows === null ? null : rows.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">No announcements yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p
                  className={
                    row.status === 'published'
                      ? 'text-stone-800'
                      : 'text-stone-400 line-through'
                  }
                >
                  {row.body}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {row.level} ·{' '}
                  {new Date(row.published_at).toLocaleString('en-IN')}
                </p>
              </div>
              {row.status === 'published' ? (
                <button
                  type="button"
                  onClick={() => hide(row.id)}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                >
                  Hide
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
