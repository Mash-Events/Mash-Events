'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminApiError, eventApi } from '@core/admin/api-client';
import {
  REGISTRATION_STATUSES,
  TRANSITIONS,
  type RegistrationStatus,
} from '@core/registration/transitions';
import { RegistrationDetail } from './registration-detail';

export type RegistrationRow = {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  email: string;
  organisation: string | null;
  category: string | null;
  status: RegistrationStatus;
  source: string;
  created_at: string;
  updated_at: string;
};

type ListResponse = {
  registrations: RegistrationRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: Record<string, number>;
};

export const STATUS_STYLES: Record<RegistrationStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-green-100 text-green-900',
  waitlisted: 'bg-sky-100 text-sky-900',
  rejected: 'bg-red-100 text-red-900',
  cancelled: 'bg-stone-200 text-stone-700',
};

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function RegistrationsScreen({
  eventId,
  eventName,
  canReview,
}: {
  eventId: string;
  eventName: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const q = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page') ?? '0') || 0;

  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState(q);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchList = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (page) params.set('page', String(page));
    return eventApi<ListResponse>(
      eventId,
      `/registrations?${params.toString()}`
    );
  }, [eventId, status, q, page]);

  const apply = useCallback(
    (result: Promise<ListResponse>, isActive: () => boolean = () => true) =>
      result.then(
        (next) => {
          if (!isActive()) return;
          setData(next);
          setError(null);
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

  const load = useCallback(() => apply(fetchList()), [apply, fetchList]);

  useEffect(() => {
    let active = true;
    void apply(fetchList(), () => active);
    return () => {
      active = false;
    };
  }, [apply, fetchList]);

  function setFilter(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!('page' in next)) params.delete('page');
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  async function quickDecision(row: RegistrationRow, to: RegistrationStatus) {
    setBusy(row.id);
    try {
      await eventApi(eventId, `/registrations/${row.id}/status`, {
        method: 'POST',
        body: { to, expected_updated_at: row.updated_at },
      });
      await load();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Could not update.');
    } finally {
      setBusy(null);
    }
  }

  const total = Object.values(data?.summary ?? {}).reduce((a, b) => a + b, 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Registrations
          </h1>
          <p className="text-sm text-stone-600">{eventName}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ q: search.trim() });
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or code"
            className="w-64 rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            Search
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {([['', 'All', total]] as [string, string, number][])
          .concat(
            REGISTRATION_STATUSES.map((s): [string, string, number] => [
              s,
              s,
              data?.summary?.[s] ?? 0,
            ])
          )
          .map(([value, label, count]) => (
            <button
              key={label}
              type="button"
              onClick={() => setFilter({ status: value })}
              className={`rounded-full border px-3 py-1 text-sm capitalize ${
                status === value
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
              }`}
            >
              {label} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Organisation</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Registered</th>
              {canReview ? <th className="px-4 py-2">Quick decision</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(data?.registrations ?? []).map((row) => (
              <tr
                key={row.id}
                className={`cursor-pointer hover:bg-stone-50 ${selected === row.id ? 'bg-stone-50' : ''}`}
                onClick={() => setSelected(row.id)}
              >
                <td className="px-4 py-2 font-medium text-stone-900">
                  {row.first_name} {row.last_name}
                </td>
                <td className="px-4 py-2 text-stone-700">{row.email}</td>
                <td className="px-4 py-2 text-stone-700">
                  {row.organisation ?? '—'}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{row.code}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-2 text-stone-500">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                {canReview ? (
                  <td
                    className="px-4 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.status === 'pending' ? (
                      <div className="flex gap-1">
                        {(['confirmed', 'waitlisted', 'rejected'] as const)
                          .filter((to) => TRANSITIONS.pending.includes(to))
                          .map((to) => (
                            <button
                              key={to}
                              type="button"
                              disabled={busy === row.id}
                              onClick={() => quickDecision(row, to)}
                              className="rounded border border-stone-300 px-2 py-0.5 text-xs capitalize hover:bg-stone-100 disabled:opacity-50"
                            >
                              {to === 'confirmed'
                                ? 'Confirm'
                                : to === 'waitlisted'
                                  ? 'Waitlist'
                                  : 'Reject'}
                            </button>
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
            {data && data.registrations.length === 0 ? (
              <tr>
                <td
                  colSpan={canReview ? 7 : 6}
                  className="px-4 py-8 text-center text-stone-500"
                >
                  No registrations{status ? ` with status ${status}` : ''}
                  {q ? ` matching “${q}”` : ''}.
                </td>
              </tr>
            ) : null}
            {!data && !error ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-stone-500"
                >
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {data && pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-stone-600">
          <span>
            Page {page + 1} of {pages} · {data.total} results
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setFilter({ page: String(page - 1) })}
              className="rounded border border-stone-300 bg-white px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page + 1 >= pages}
              onClick={() => setFilter({ page: String(page + 1) })}
              className="rounded border border-stone-300 bg-white px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <RegistrationDetail
          key={selected}
          eventId={eventId}
          registrationId={selected}
          canReview={canReview}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}
