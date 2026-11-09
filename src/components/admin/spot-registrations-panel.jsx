'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { AdminAlert, AdminStatusBadge, AdminToast } from './admin-ui';
import { downloadAdminFile } from '@/lib/admin-download';
import spotUtils from '@/lib/spot-registration-utils.cjs';

const { eventDayNow } = spotUtils;
const EMPTY_FORM = {
  name: '',
  email: '',
  designation: '',
  organization: '',
  deskLabel: 'Main Desk',
};

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

const fieldClass =
  'h-11 w-full rounded-[10px] border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100';
const buttonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100';

export default function SpotRegistrationsPanel({
  canManage,
  canExport = false,
}) {
  const [today, setToday] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [eventDay, setEventDay] = useState('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({
    registrations: [],
    meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    const refresh = () => setToday(eventDayNow());
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      eventDay,
    });
    if (search) params.set('search', search);
    return params.toString();
  }, [eventDay, page, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/spot-registrations?${queryString}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load spot registrations.');
      }
      setResult(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch starts after mount and updates state after awaiting the response
    void load();
  }, [load]);

  async function saveSpotRegistration(event) {
    event.preventDefault();
    if (
      !window.confirm(
        `Check in ${form.name} and immediately send confirmation to ${form.email}?`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin/spot-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to register attendee.');
      }
      const emailStatus = data.registration.emailStatus;
      const confirmed =
        emailStatus === 'sent' || emailStatus === 'not_required';
      setToast({
        tone: confirmed ? 'success' : 'warning',
        message:
          emailStatus === 'sent'
            ? `${data.registration.name} is checked in. Confirmation accepted for delivery.`
            : emailStatus === 'not_required'
              ? `${data.registration.name} is checked in for today. A confirmation was sent on an earlier day.`
              : `${data.registration.name} is checked in. Email delivery needs review; do not add this person again.`,
      });
      setForm({ ...EMPTY_FORM, deskLabel: form.deskLabel });
      await load();
    } catch (saveError) {
      setToast({ tone: 'danger', message: saveError.message });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function exportRows(format) {
    setExporting(format);
    try {
      const params = new URLSearchParams({ format, eventDay });
      if (search) params.set('search', search);
      await downloadAdminFile(
        `/api/admin/spot-registrations/export?${params}`,
        `mash-2026-spot-registrations.${format}`
      );
    } catch (exportError) {
      setToast({ tone: 'danger', message: exportError.message });
    } finally {
      setExporting('');
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        Register walk-in attendees at the desk. Saving records today&apos;s
        check-in and sends a confirmation email on their first visit. Returning
        attendees are checked in without another email. No QR pass or card is
        created.
      </p>

      {!today ? (
        <AdminAlert
          tone="info"
          title="Opens on event day"
          description="Spot registration and confirmation email sending open on 14 October and close after 15 October 2026, India time. Existing records and exports remain available."
        />
      ) : null}
      {!canManage ? (
        <AdminAlert
          tone="info"
          title="Read-only access"
          description="Only an admin can check in a walk-in attendee."
        />
      ) : null}

      {canManage && today ? (
        <section className="rounded-[10px] border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            New spot registration · {today.shortLabel}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Check whether the person already has an advance registration before
            saving. A duplicate email for today will be blocked.
          </p>
          <form onSubmit={saveSpotRegistration} className="mt-5 max-w-3xl">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['name', 'Full name', true],
                ['email', 'Email address', true],
                ['designation', 'Designation', false],
                ['organization', 'Organisation', false],
                ['deskLabel', 'Desk', false],
              ].map(([key, label, required]) => (
                <label
                  key={key}
                  className="grid gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100"
                >
                  {label} {required ? '*' : ''}
                  <input
                    className={fieldClass}
                    type={key === 'email' ? 'email' : 'text'}
                    required={required}
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-[10px] bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={16} />
              {saving ? 'Checking in…' : 'Check in and send email'}
            </button>
          </form>
        </section>
      ) : null}

      {error ? (
        <AdminAlert tone="danger" title="Unable to load" description={error} />
      ) : null}
      <section className="overflow-hidden rounded-[10px] border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-end gap-3 border-b border-zinc-200 p-4 dark:border-white/10">
          <label className="min-w-52 flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Search
            <input
              className={`${fieldClass} mt-2`}
              placeholder="Name, email, organisation"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Event day
            <select
              className={`${fieldClass} mt-2`}
              value={eventDay}
              onChange={(event) => {
                setEventDay(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Both days</option>
              <option value="1">14 Oct</option>
              <option value="2">15 Oct</option>
            </select>
          </label>
          {(canExport ? ['csv', 'xlsx'] : []).map((format) => (
            <button
              key={format}
              type="button"
              className={buttonClass}
              disabled={Boolean(exporting)}
              onClick={() => exportRows(format)}
            >
              <Download size={15} />{' '}
              {exporting === format
                ? 'Preparing…'
                : format === 'csv'
                  ? 'Export CSV'
                  : 'Export Excel'}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400">
              <tr>
                {['Attendee', 'Email', 'Day', 'Checked in', 'Email status'].map(
                  (label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {!loading && !result.registrations.length ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-zinc-500"
                  >
                    No spot registrations found.
                  </td>
                </tr>
              ) : null}
              {result.registrations.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-zinc-200 dark:border-white/10"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {row.name}
                    {row.organization ? (
                      <div className="text-xs font-normal text-zinc-500">
                        {row.organization}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">
                    {row.email}
                  </td>
                  <td className="px-4 py-3">Day {row.eventDay}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(row.checkedInAt)}
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge
                      tone={
                        ['sent', 'not_required'].includes(row.emailStatus)
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {row.emailStatus === 'sent'
                        ? 'Accepted for delivery'
                        : row.emailStatus === 'not_required'
                          ? 'Sent earlier'
                          : 'Needs review'}
                    </AdminStatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 p-4 text-sm text-zinc-500 dark:border-white/10">
          <span>{result.meta.total} records</span>
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={page >= result.meta.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <AdminToast
        message={toast?.message}
        tone={toast?.tone}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}
