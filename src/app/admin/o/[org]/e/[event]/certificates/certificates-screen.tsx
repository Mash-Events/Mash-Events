'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, eventApi } from '@core/admin/api-client';

// Certificates admin (docs/system-design.md §9.1 phase 3). Issue to an
// audience (idempotent), browse the issued list, revoke.

export type CertificateRow = {
  id: string;
  code: string;
  status: string;
  issued_at: string;
  revoked_at: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type IssueOutcome = { result: string; issued: number; skipped: number };

export function CertificatesScreen({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const [rows, setRows] = useState<CertificateRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    eventApi<{ certificates: CertificateRow[] }>(eventId, '/certificates')
      .then((data) => {
        setRows(data.certificates);
        setLoadError(null);
      })
      .catch((e) => {
        setLoadError(
          e instanceof AdminApiError
            ? e.message
            : 'Could not load certificates.'
        );
      });
  }, [eventId]);

  useEffect(load, [load]);

  async function issue(audience: 'attended' | 'confirmed') {
    if (busy) return;
    if (
      !window.confirm(
        audience === 'attended'
          ? 'Issue certificates to every confirmed registration that checked in? Registrations that already have a certificate are skipped.'
          : 'Issue certificates to every confirmed registration? Registrations that already have a certificate are skipped.'
      )
    ) {
      return;
    }
    setBusy(audience);
    setNote(null);
    try {
      const out = await eventApi<IssueOutcome>(eventId, '/certificates/issue', {
        method: 'POST',
        body: { audience },
      });
      setNote(
        out.result === 'issued'
          ? `${out.issued} certificate${out.issued === 1 ? '' : 's'} issued, ${out.skipped} skipped. Emails are queued.`
          : 'This event does not allow issuing certificates right now.'
      );
      load();
    } catch (e) {
      setNote(e instanceof AdminApiError ? e.message : 'Could not issue.');
    } finally {
      setBusy(null);
    }
  }

  async function revoke(row: CertificateRow) {
    if (busy) return;
    if (
      !window.confirm(
        `Revoke the certificate for ${row.first_name ?? ''} ${row.last_name ?? ''} (${row.code})? Their claim link and the verify page will stop working.`
      )
    ) {
      return;
    }
    setBusy(row.id);
    setNote(null);
    try {
      await eventApi<{ result: string }>(eventId, '/certificates/revoke', {
        method: 'POST',
        body: { certificateId: row.id },
      });
      setNote(`Certificate ${row.code} revoked.`);
      load();
    } catch (e) {
      setNote(e instanceof AdminApiError ? e.message : 'Could not revoke.');
    } finally {
      setBusy(null);
    }
  }

  const issued = rows?.filter((r) => r.status === 'issued').length ?? 0;
  const revoked = rows?.filter((r) => r.status === 'revoked').length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">
          Certificates — {eventName}
        </h1>
        <p className="text-sm text-stone-600">
          Issue certificates of participation, then share claim links by email.
          Attendees verify at the public verify page with their code.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => issue('attended')}
          disabled={busy !== null}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy === 'attended' ? 'Issuing…' : 'Issue to checked-in attendees'}
        </button>
        <button
          onClick={() => issue('confirmed')}
          disabled={busy !== null}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          {busy === 'confirmed' ? 'Issuing…' : 'Issue to all confirmed'}
        </button>
        {note ? <p className="text-sm text-stone-700">{note}</p> : null}
      </div>

      {loadError ? (
        <p className="text-sm text-red-700">{loadError}</p>
      ) : rows === null ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-800">
            {issued} issued · {revoked} revoked
          </h2>
          {rows.length === 0 ? (
            <p className="text-sm text-stone-500">
              No certificates yet. Issue them after the event ends.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-4">Attendee</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Issued</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-middle">
                    <td className="py-2 pr-4">
                      {row.first_name ?? ''} {row.last_name ?? ''}
                      <span className="block text-xs text-stone-500">
                        {row.email ?? ''}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono">{row.code}</td>
                    <td className="py-2 pr-4">
                      {row.status === 'issued' ? 'Issued' : 'Revoked'}
                    </td>
                    <td className="py-2 pr-4 text-stone-600">
                      {new Date(row.issued_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2">
                      {row.status === 'issued' ? (
                        <button
                          onClick={() => revoke(row)}
                          disabled={busy !== null}
                          className="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
