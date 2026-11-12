'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, eventApi } from '@core/admin/api-client';

// Submissions inbox (docs/system-design.md §16.4 phase 3). Filter by kind
// and status, read the full message, triage new → in review → done.

type SubmissionRow = {
  id: string;
  kind: string;
  name: string;
  email: string;
  message: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = {
  contact: 'Contact',
  speaker_application: 'Speaker application',
  volunteer_application: 'Volunteer application',
  media_accreditation: 'Media accreditation',
};

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-amber-100 text-amber-900',
  in_review: 'bg-blue-100 text-blue-900',
  done: 'bg-stone-100 text-stone-600',
};

export function SubmissionsScreen({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    eventApi<{ submissions: SubmissionRow[] }>(eventId, '/submissions')
      .then((data) => {
        setRows(data.submissions);
        setLoadError(null);
      })
      .catch((e) => {
        setLoadError(
          e instanceof AdminApiError ? e.message : 'Could not load submissions.'
        );
      });
  }, [eventId]);

  useEffect(load, [load]);

  async function review(row: SubmissionRow, next: string) {
    if (busy) return;
    setBusy(row.id);
    try {
      await eventApi<{ result: string }>(eventId, '/submissions/review', {
        method: 'POST',
        body: { submissionId: row.id, status: next },
      });
      load();
    } catch {
      /* the reload shows the unchanged row */
    } finally {
      setBusy(null);
    }
  }

  const visible = (rows ?? []).filter(
    (row) =>
      (kind === 'all' || row.kind === kind) &&
      (status === 'all' || row.status === status)
  );
  const openRow = visible.find((row) => row.id === open) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">
          Submissions — {eventName}
        </h1>
        <p className="text-sm text-stone-600">
          Contact, speaker, volunteer and media enquiries from the event site.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-md border border-stone-300 bg-white px-3 py-2"
        >
          <option value="all">All kinds</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-stone-300 bg-white px-3 py-2"
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="in_review">In review</option>
          <option value="done">Done</option>
        </select>
      </div>

      {loadError ? (
        <p className="text-sm text-red-700">{loadError}</p>
      ) : rows === null ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-stone-500">Nothing here yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-2 pr-4">From</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Received</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visible.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-4">
                  {row.name}
                  <span className="block text-xs text-stone-500">
                    {row.email}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  {KIND_LABELS[row.kind] ?? row.kind}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      STATUS_STYLE[row.status] ?? ''
                    }`}
                  >
                    {row.status === 'in_review'
                      ? 'In review'
                      : row.status === 'done'
                        ? 'Done'
                        : 'New'}
                  </span>
                </td>
                <td className="py-2 pr-4 text-stone-600">
                  {new Date(row.created_at).toLocaleString('en-IN')}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setOpen(open === row.id ? null : row.id)}
                    className="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                  >
                    {open === row.id ? 'Close' : 'Open'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {openRow ? (
        <section className="space-y-3 rounded-md border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-stone-900">
            {KIND_LABELS[openRow.kind] ?? openRow.kind} — {openRow.name}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-stone-800">
            {openRow.message}
          </p>
          {Object.keys(openRow.payload ?? {}).length > 0 ? (
            <pre className="overflow-x-auto rounded-md bg-stone-50 p-3 text-xs text-stone-700">
              {JSON.stringify(openRow.payload, null, 2)}
            </pre>
          ) : null}
          <div className="flex gap-2">
            {openRow.status !== 'in_review' ? (
              <button
                onClick={() => review(openRow, 'in_review')}
                disabled={busy !== null}
                className="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                Mark in review
              </button>
            ) : null}
            {openRow.status !== 'done' ? (
              <button
                onClick={() => review(openRow, 'done')}
                disabled={busy !== null}
                className="rounded-md bg-stone-900 px-3 py-1 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
              >
                Mark done
              </button>
            ) : null}
            {openRow.status !== 'new' ? (
              <button
                onClick={() => review(openRow, 'new')}
                disabled={busy !== null}
                className="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                Back to new
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
