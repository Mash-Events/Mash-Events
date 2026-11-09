'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const Ico = {
  filter: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M4 5h16l-6 8v5l-4 2v-7z" />
    </svg>
  ),
  download: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M12 4v12M6 12l6 6 6-6M4 20h16" />
    </svg>
  ),
  refresh: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M1 4v6h6M23 20v-6h-6" />
      <path d="M20.5 9A9 9 0 0 0 5.2 5.2L1 10M23 14l-4.2 4.8A9 9 0 0 1 3.5 15" />
    </svg>
  ),
};

const KIND_COLOR = {
  registration: 'var(--adm-info)',
  email_job: 'var(--adm-accent)',
  pass_job: 'var(--adm-ok)',
  payment: 'var(--adm-warn)',
  settings: 'var(--adm-ink-3)',
  delete: 'var(--adm-bad)',
  export: 'var(--adm-warn)',
  send: 'var(--adm-accent)',
};

const KIND_LABEL = {
  registration: 'REG',
  email_job: 'EMAIL',
  pass_job: 'PASS',
  payment: 'PAY',
  settings: 'CFG',
  delete: 'DEL',
  export: 'EXPORT',
  send: 'SEND',
};

function Btn({
  children,
  onClick,
  kind = 'ghost',
  size = 'md',
  icon,
  disabled,
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: size === 'sm' ? '6px 10px' : '8px 14px',
    fontFamily: 'var(--adm-mono)',
    fontSize: size === 'sm' ? 11 : 12,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontWeight: 500,
    borderRadius: 10,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all .15s',
    border: '1px solid transparent',
    opacity: disabled ? 0.5 : 1,
  };
  const kinds = {
    primary: {
      background: 'var(--adm-accent)',
      color: 'var(--adm-accent-ink)',
      border: '1px solid var(--adm-accent)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--adm-ink)',
      border: '1px solid var(--adm-line-strong)',
    },
    soft: {
      background: 'var(--adm-panel-2)',
      color: 'var(--adm-ink)',
      border: '1px solid var(--adm-line)',
    },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...kinds[kind] }}
    >
      {icon}
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr auto',
            gap: 18,
            padding: '14px 18px',
            borderBottom: i < 7 ? '1px solid var(--adm-line)' : 'none',
          }}
        >
          <div
            style={{
              height: 12,
              borderRadius: 10,
              background: 'var(--adm-panel-2)',
              animation: 'adm-skeleton-pulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 80}ms`,
            }}
          />
          <div
            style={{
              height: 12,
              borderRadius: 10,
              background: 'var(--adm-panel-2)',
              animation: 'adm-skeleton-pulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 80 + 40}ms`,
              maxWidth: 420,
            }}
          />
          <div
            style={{
              height: 12,
              width: 60,
              borderRadius: 10,
              background: 'var(--adm-panel-2)',
              animation: 'adm-skeleton-pulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 80 + 80}ms`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

const ACTOR_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'operator', label: 'Operator' },
  { key: 'system', label: 'System' },
];

export default function AuditTrailPanel() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actorFilter, setActorFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [cursorStack, setCursorStack] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const abortRef = useRef(null);

  const fetchAudit = useCallback(
    async (actor = 'all', pageCursor = '', silent = false) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const query = new URLSearchParams({ limit: '50', actor });
        if (pageCursor) query.set('cursor', pageCursor);
        const res = await fetch(`/api/admin/audit?${query}`, {
          signal: abortRef.current.signal,
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || !json.ok)
          throw new Error(json.error || 'Failed to load audit log');
        setEntries(json.data || []);
        setNextCursor(json.nextCursor || null);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state updates resolve after await
    fetchAudit(actorFilter, cursorStack.at(-1) || '');
  }, [fetchAudit, actorFilter, cursorStack]);

  function downloadLog() {
    const lines = entries
      .map((e) => `${e.ts || ''}\t${e.actor}\t${e.action}`)
      .join('\n');
    const blob = new Blob([`TIMESTAMP\tACTOR\tACTION\n${lines}`], {
      type: 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mash-audit-${Date.now()}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const systemCount = entries.filter((e) => e.actor === 'system').length;
  const operatorCount = entries.filter((e) => e.actor !== 'system').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Stats bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        {[
          { label: 'THIS PAGE', value: entries.length, accent: true },
          { label: 'OPERATOR · PAGE', value: operatorCount },
          { label: 'SYSTEM · PAGE', value: systemCount },
          {
            label: 'EVENT KINDS · PAGE',
            value: new Set(entries.map((e) => e.kind)).size,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: '16px 18px',
              borderRadius: 10,
              background: 'var(--adm-panel)',
              border: '1px solid var(--adm-line)',
            }}
          >
            <div
              className="adm-eyebrow"
              style={{
                marginBottom: 8,
                color: s.accent ? 'var(--adm-accent)' : 'var(--adm-ink-3)',
              }}
            >
              {s.label}
            </div>
            <div
              className="adm-mono"
              style={{
                fontSize: 36,
                fontWeight: 500,
                letterSpacing: '-0.03em',
                color: s.accent ? 'var(--adm-accent)' : 'var(--adm-ink)',
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main table */}
      <div
        style={{
          background: 'var(--adm-panel)',
          border: '1px solid var(--adm-line)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--adm-line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div>
            <div
              className="adm-eyebrow"
              style={{ marginBottom: 4, color: 'var(--adm-accent)' }}
            >
              AUDIT TRAIL
            </div>
            <div
              style={{ fontSize: 15, fontWeight: 600, color: 'var(--adm-ink)' }}
            >
              System &amp; operator actions
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Actor filter pills */}
            <div
              style={{
                display: 'flex',
                borderRadius: 10,
                border: '1px solid var(--adm-line)',
                overflow: 'hidden',
              }}
            >
              {ACTOR_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setActorFilter(f.key);
                    setCursorStack([]);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontFamily: 'var(--adm-mono)',
                    fontSize: 10.5,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    background:
                      actorFilter === f.key
                        ? 'var(--adm-accent-soft)'
                        : 'transparent',
                    color:
                      actorFilter === f.key
                        ? 'var(--adm-accent)'
                        : 'var(--adm-ink-3)',
                    border: 'none',
                    cursor: 'pointer',
                    borderRight:
                      f.key !== 'system' ? '1px solid var(--adm-line)' : 'none',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Btn
              size="sm"
              kind="soft"
              icon={<Ico.refresh style={{ color: 'var(--adm-ink-3)' }} />}
              onClick={() =>
                fetchAudit(actorFilter, cursorStack.at(-1) || '', true)
              }
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Btn>
            <Btn
              size="sm"
              kind="soft"
              icon={<Ico.download style={{ color: 'var(--adm-ink-3)' }} />}
              onClick={downloadLog}
            >
              Download log
            </Btn>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div style={{ padding: '32px 18px', textAlign: 'center' }}>
            <div
              className="adm-mono"
              style={{
                fontSize: 12,
                color: 'var(--adm-bad)',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
            <Btn
              size="sm"
              kind="ghost"
              onClick={() => fetchAudit(actorFilter, cursorStack.at(-1) || '')}
            >
              Retry
            </Btn>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '48px 18px', textAlign: 'center' }}>
            <div
              className="adm-mono"
              style={{
                fontSize: 11,
                color: 'var(--adm-ink-4)',
                letterSpacing: '0.1em',
              }}
            >
              NO AUDIT ENTRIES FOUND
            </div>
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--adm-canvas-2)',
                    borderBottom: '1px solid var(--adm-line)',
                  }}
                >
                  <th style={TH}>ACTOR</th>
                  <th style={TH}>ACTION</th>
                  <th style={{ ...TH, width: 80 }}>KIND</th>
                  <th style={{ ...TH, textAlign: 'right', width: 100 }}>
                    WHEN
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const isSystem = e.actor === 'system';
                  const kindColor = KIND_COLOR[e.kind] || 'var(--adm-ink-3)';
                  const kindLabel =
                    KIND_LABEL[e.kind] || e.kind?.toUpperCase() || '—';
                  return (
                    <tr
                      key={i}
                      className="adm-row"
                      style={{
                        borderBottom:
                          i < entries.length - 1
                            ? '1px solid var(--adm-line)'
                            : 'none',
                        background: 'transparent',
                      }}
                    >
                      <td style={{ ...TD, width: 160 }}>
                        <span
                          className="adm-mono"
                          style={{
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            color: isSystem
                              ? 'var(--adm-ink-3)'
                              : 'var(--adm-accent)',
                          }}
                        >
                          {e.actor}
                        </span>
                      </td>
                      <td style={TD}>
                        <span
                          style={{ fontSize: 13, color: 'var(--adm-ink-2)' }}
                        >
                          {e.action}
                        </span>
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: 10,
                            background: kindColor + '18',
                            color: kindColor,
                            fontFamily: 'var(--adm-mono)',
                            fontSize: 10,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            fontWeight: 500,
                            border: '1px solid ' + kindColor + '33',
                          }}
                        >
                          {kindLabel}
                        </span>
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <span
                          className="adm-mono"
                          style={{
                            fontSize: 10,
                            color: 'var(--adm-ink-4)',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {(e.ago || '—').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 18px',
            borderTop: '1px solid var(--adm-line)',
          }}
        >
          <Btn
            size="sm"
            kind="soft"
            disabled={!cursorStack.length}
            onClick={() => setCursorStack(cursorStack.slice(0, -1))}
          >
            Newer
          </Btn>
          <span className="adm-mono" style={{ fontSize: 11 }}>
            Page {cursorStack.length + 1} · {entries.length} entries
          </span>
          <Btn
            size="sm"
            kind="soft"
            disabled={!nextCursor}
            onClick={() => setCursorStack([...cursorStack, nextCursor])}
          >
            Older
          </Btn>
          <span
            className="adm-mono"
            style={{ fontSize: 10, color: 'var(--adm-ink-4)' }}
          >
            Download log exports this page.
          </span>
        </div>
      </div>
    </div>
  );
}

const TH = {
  padding: '10px 14px',
  fontFamily: 'var(--adm-mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: 'var(--adm-ink-3)',
  textAlign: 'left',
};

const TD = { padding: '12px 14px', verticalAlign: 'middle' };
