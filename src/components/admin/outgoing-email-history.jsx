'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { AdminStatusBadge } from '@/components/admin/admin-ui';
import AdminPagination from '@/components/admin/admin-pagination';
import emailHistory from '@/lib/email-history.cjs';

const { STATUS_GROUPS, eventLabel, eventTone } = emailHistory;

const panelStyle = {
  borderRadius: 10,
  border: '1px solid var(--adm-line)',
  background: 'var(--adm-panel)',
};

const eyebrowStyle = {
  fontFamily: 'var(--adm-mono)',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--adm-ink-3)',
};

// All and Problems first, then each Resend status. Statuses with no emails
// are hidden, except Bounced and Suppressed, which are always offered.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'problems', label: 'Problems' },
  ...STATUS_GROUPS.map(({ key, label }) => ({ key, label })),
];
const ALWAYS_SHOWN = new Set(['all', 'problems', 'bounced', 'suppressed']);

const HINTS = {
  bounced:
    'The recipient’s mail server rejected these. Check the address for typos, correct it on the registration, then resend.',
  suppressed:
    'Resend blocks these addresses after an earlier bounce or spam complaint, so nothing reaches them. Use a different address for these people.',
  complained:
    'These people marked the email as spam. Resend will suppress further email to them.',
  problems:
    'Emails that did not reach the inbox: bounced, suppressed, marked as spam or failed.',
};

const ROW_GRID = 'grid-cols-[132px_minmax(0,1.2fr)_minmax(0,1.6fr)_150px]';

function formatWhen(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatAgo(value) {
  if (!value) return '';
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  return formatWhen(value);
}

function chipStyle(active, alert) {
  return {
    borderRadius: 999,
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--adm-ink)' : alert ? 'var(--adm-bad)' : 'var(--adm-line-strong)'}`,
    background: active
      ? 'var(--adm-ink)'
      : alert
        ? 'var(--adm-bad-soft)'
        : 'var(--adm-panel)',
    color: active
      ? 'var(--adm-accent-ink)'
      : alert
        ? 'var(--adm-bad)'
        : 'var(--adm-ink-2)',
  };
}

export default function OutgoingEmailHistory() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({
    loading: true,
    error: '',
    emails: [],
    counts: null,
    total: 0,
    totalPages: 1,
    pageSize: 25,
    checkedAt: '',
    complete: true,
  });
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      const requestId = ++requestRef.current;
      setState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const params = new URLSearchParams({ status, page: String(page) });
        if (query) params.set('q', query);
        if (refresh) params.set('refresh', '1');
        const response = await fetch(`/api/admin/email-history?${params}`, {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load outgoing emails.');
        }
        if (requestId !== requestRef.current) return;
        setState({
          loading: false,
          error: '',
          emails: data.emails || [],
          counts: data.counts || null,
          total: Number(data.total || 0),
          totalPages: Number(data.totalPages || 1),
          pageSize: Number(data.pageSize || 25),
          checkedAt: data.checkedAt || '',
          complete: data.complete !== false,
        });
      } catch (error) {
        if (requestId !== requestRef.current) return;
        setState((current) => ({
          ...current,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to load outgoing emails.',
        }));
      }
    },
    [page, query, status]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const pickStatus = (next) => {
    setStatus(next);
    setPage(1);
  };

  const filters = FILTERS.filter(
    (filter) =>
      ALWAYS_SHOWN.has(filter.key) || Number(state.counts?.[filter.key] || 0)
  );
  const hint = HINTS[status];

  return (
    <section style={panelStyle} className="overflow-hidden">
      <div
        className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid var(--adm-line)' }}
      >
        <div>
          <p style={eyebrowStyle}>All outgoing emails</p>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--adm-ink-3)' }}>
            Every email the site sent, with its latest status from Resend.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {state.checkedAt ? (
            <span className="text-xs" style={{ color: 'var(--adm-ink-3)' }}>
              Checked {formatAgo(state.checkedAt)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void load({ refresh: true })}
            disabled={state.loading}
            className="inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--adm-line-strong)',
              background: 'var(--adm-panel)',
              color: 'var(--adm-ink)',
            }}
          >
            <RefreshCw
              size={13}
              className={state.loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
        style={{ borderBottom: '1px solid var(--adm-line)' }}
      >
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Filter by status"
        >
          {filters.map((filter) => {
            const count = Number(state.counts?.[filter.key] || 0);
            return (
              <button
                key={filter.key}
                type="button"
                role="tab"
                aria-selected={status === filter.key}
                onClick={() => pickStatus(filter.key)}
                style={chipStyle(
                  status === filter.key,
                  filter.key === 'problems' && count > 0
                )}
              >
                {filter.label}{' '}
                <span className="tabular-nums">
                  {state.counts ? count.toLocaleString('en-IN') : '…'}
                </span>
              </button>
            );
          })}
        </div>
        <label
          className="flex h-8 w-full items-center gap-2 px-3 sm:w-72"
          style={{
            borderRadius: 10,
            border: '1px solid var(--adm-line-strong)',
            background: 'var(--adm-panel)',
          }}
        >
          <Search size={14} style={{ color: 'var(--adm-ink-3)' }} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search email or subject"
            aria-label="Search email or subject"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--adm-ink)' }}
          />
        </label>
      </div>

      {hint ? (
        <p
          className="px-5 py-2.5 text-xs"
          style={{
            color: 'var(--adm-ink-2)',
            background: 'var(--adm-panel-2)',
            borderBottom: '1px solid var(--adm-line)',
          }}
        >
          {hint}
        </p>
      ) : null}

      {state.error ? (
        <p className="px-5 py-4 text-sm" style={{ color: 'var(--adm-bad)' }}>
          {state.error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div
            className={`grid gap-x-4 px-5 py-2 ${ROW_GRID}`}
            style={{
              ...eyebrowStyle,
              background: 'var(--adm-panel-2)',
              borderBottom: '1px solid var(--adm-line)',
            }}
          >
            <span>When</span>
            <span>To</span>
            <span>Subject</span>
            <span>Status</span>
          </div>

          {state.loading && !state.emails.length ? (
            <p
              className="px-5 py-4 text-sm"
              style={{ color: 'var(--adm-ink-3)' }}
            >
              Loading emails… The first load reads the whole history from Resend
              and can take a few seconds.
            </p>
          ) : null}

          <ul style={{ opacity: state.loading ? 0.55 : 1 }}>
            {state.emails.map((email) => (
              <li
                key={email.id}
                className={`grid items-center gap-x-4 px-5 py-2.5 ${ROW_GRID}`}
                style={{ borderBottom: '1px solid var(--adm-line)' }}
              >
                <span
                  className="text-xs tabular-nums"
                  style={{ color: 'var(--adm-ink-2)' }}
                >
                  {formatWhen(email.createdAt)}
                </span>
                <span
                  className="truncate text-sm"
                  style={{ color: 'var(--adm-ink)' }}
                  title={(email.to || []).join(', ')}
                >
                  {(email.to || []).join(', ')}
                </span>
                <span
                  className="truncate text-sm"
                  style={{ color: 'var(--adm-ink-2)' }}
                  title={email.subject || ''}
                >
                  {email.subject || '—'}
                </span>
                <span>
                  <AdminStatusBadge tone={eventTone(email.lastEvent)}>
                    {eventLabel(email.lastEvent)}
                  </AdminStatusBadge>
                </span>
              </li>
            ))}
          </ul>

          {!state.loading && !state.error && !state.emails.length ? (
            <p
              className="px-5 py-6 text-center text-sm"
              style={{ color: 'var(--adm-ink-3)' }}
            >
              {query
                ? 'No emails match this search.'
                : 'No emails with this status.'}
            </p>
          ) : null}
        </div>
      </div>

      <AdminPagination
        page={page}
        pageSize={state.pageSize}
        total={state.total}
        totalPages={state.totalPages}
        onPage={setPage}
        label="emails"
        disabled={state.loading}
      />

      {!state.complete ? (
        <p className="px-5 pb-3 text-xs" style={{ color: 'var(--adm-ink-3)' }}>
          Showing the most recent history only; older emails are in the Resend
          dashboard.
        </p>
      ) : null}
    </section>
  );
}
