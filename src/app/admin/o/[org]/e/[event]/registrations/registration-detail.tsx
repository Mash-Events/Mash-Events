'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, eventApi } from '@core/admin/api-client';
import {
  TRANSITIONS,
  type RegistrationStatus,
} from '@core/registration/transitions';
import { StatusBadge } from './registrations-screen';

type Registration = {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  email: string;
  organisation: string | null;
  category: string | null;
  phone_e164: string | null;
  whatsapp_opt_in_at: string | null;
  answers: Record<string, unknown>;
  status: RegistrationStatus;
  source: string;
  consent_at: string;
  consent_version: string;
  created_at: string;
  updated_at: string;
};

type Note = { id: string; body: string; created_at: string };
type History = {
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at: string;
};

const ACTION_LABELS: Record<RegistrationStatus, string> = {
  confirmed: 'Confirm',
  waitlisted: 'Waitlist',
  rejected: 'Reject',
  cancelled: 'Cancel',
  pending: 'Back to pending',
};

export function RegistrationDetail({
  eventId,
  registrationId,
  canReview,
  onClose,
  onChanged,
}: {
  eventId: string;
  registrationId: string;
  canReview: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchDetail = useCallback(
    () =>
      Promise.all([
        eventApi<{ registration: Registration }>(
          eventId,
          `/registrations/${registrationId}`
        ),
        eventApi<{ notes: Note[]; history: History[] }>(
          eventId,
          `/registrations/${registrationId}/notes`
        ),
      ]),
    [eventId, registrationId]
  );

  const apply = useCallback(
    (
      result: ReturnType<typeof fetchDetail>,
      isActive: () => boolean = () => true
    ) =>
      result.then(
        ([detail, extra]) => {
          if (!isActive()) return;
          setRegistration(detail.registration);
          setNotes(extra.notes ?? []);
          setHistory(extra.history ?? []);
        },
        (e) => {
          if (isActive()) {
            setError(
              e instanceof AdminApiError ? e.message : 'Could not load.'
            );
          }
        }
      ),
    []
  );

  const load = useCallback(() => apply(fetchDetail()), [apply, fetchDetail]);

  // The parent remounts this panel per registration (key), so state starts
  // empty for each one.
  useEffect(() => {
    let active = true;
    void apply(fetchDetail(), () => active);
    return () => {
      active = false;
    };
  }, [apply, fetchDetail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function decide(to: RegistrationStatus) {
    if (!registration) return;
    setBusy(true);
    setError(null);
    try {
      await eventApi(eventId, `/registrations/${registration.id}/status`, {
        method: 'POST',
        body: {
          to,
          reason: reason.trim() || undefined,
          expected_updated_at: registration.updated_at,
        },
      });
      setReason('');
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await eventApi(eventId, `/registrations/${registrationId}/notes`, {
        method: 'POST',
        body: { body: note.trim() },
      });
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/20"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-label="Registration details"
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-stone-500">
              {registration?.code ?? '…'}
            </p>
            <h2 className="text-xl font-semibold text-stone-900">
              {registration
                ? `${registration.first_name} ${registration.last_name}`
                : 'Loading…'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-stone-500 hover:text-stone-900"
          >
            Close
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {registration ? (
          <div className="mt-5 space-y-6 text-sm">
            <div className="flex items-center gap-2">
              <StatusBadge status={registration.status} />
              <span className="text-stone-500">via {registration.source}</span>
            </div>

            <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
              <Row label="Email" value={registration.email} />
              <Row label="Organisation" value={registration.organisation} />
              <Row label="Category" value={registration.category} />
              <Row label="Phone" value={registration.phone_e164} />
              <Row
                label="WhatsApp"
                value={registration.whatsapp_opt_in_at ? 'Opted in' : 'No'}
              />
              <Row
                label="Registered"
                value={new Date(registration.created_at).toLocaleString()}
              />
              <Row
                label="Consent"
                value={`${registration.consent_version} · ${new Date(registration.consent_at).toLocaleDateString()}`}
              />
              {Object.entries(registration.answers ?? {}).map(
                ([key, value]) => (
                  <Row
                    key={key}
                    label={key.replace(/_/g, ' ')}
                    value={
                      Array.isArray(value)
                        ? value.join(', ')
                        : String(value ?? '—')
                    }
                  />
                )
              )}
            </dl>

            {canReview && TRANSITIONS[registration.status].length ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Decision
                </h3>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder="Reason (optional, internal)"
                  className="block w-full rounded-md border border-stone-300 px-3 py-2"
                />
                <div className="flex flex-wrap gap-2">
                  {TRANSITIONS[registration.status].map((to) => (
                    <button
                      key={to}
                      type="button"
                      disabled={busy}
                      onClick={() => decide(to)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                        to === 'confirmed'
                          ? 'bg-stone-900 text-white hover:bg-stone-700'
                          : 'border border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      {ACTION_LABELS[to]}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Notes
              </h3>
              {canReview ? (
                <form onSubmit={addNote} className="flex gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    placeholder="Add an internal note"
                    className="flex-1 rounded-md border border-stone-300 px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={busy || !note.trim()}
                    className="rounded-md border border-stone-300 px-3 py-2 disabled:opacity-50"
                  >
                    Add
                  </button>
                </form>
              ) : null}
              {notes.length ? (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-md bg-stone-50 p-3">
                      <p className="whitespace-pre-wrap text-stone-800">
                        {n.body}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-stone-500">No notes yet.</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                History
              </h3>
              <ol className="space-y-1 text-stone-700">
                {history.map((h, i) => (
                  <li key={i}>
                    {h.from_status ? `${h.from_status} → ` : ''}
                    <span className="font-medium">{h.to_status}</span>
                    {h.reason ? ` · ${h.reason}` : ''}
                    <span className="text-stone-500">
                      {' '}
                      · {new Date(h.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="capitalize text-stone-500">{label}</dt>
      <dd className="col-span-2 break-words text-stone-900">{value || '—'}</dd>
    </>
  );
}
