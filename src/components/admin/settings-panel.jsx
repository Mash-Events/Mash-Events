'use client';

import { useEffect, useRef, useState } from 'react';

/* ── Icons ───────────────────────────────────────────────────────────────── */
const Ico = {
  plus: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      {...p}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  x: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      {...p}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  lock: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  check: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
};

/* ── Primitives ───────────────────────────────────────────────────────────── */
function Skeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 38,
            borderRadius: 10,
            background: 'var(--adm-panel-2)',
            animation: 'adm-skeleton-pulse 1.4s ease-in-out infinite',
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ConfigCard({ title, children, loading, action }) {
  return (
    <div
      style={{
        padding: '20px 22px',
        borderRadius: 10,
        background: 'var(--adm-panel)',
        border: '1px solid var(--adm-line)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div className="adm-eyebrow" style={{ color: 'var(--adm-ink-3)' }}>
          {title.toUpperCase()}
        </div>
        {action}
      </div>
      {loading ? <Skeleton /> : children}
    </div>
  );
}

function MonoRow({ children, color, right }) {
  return (
    <div
      className="adm-mono"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        padding: '9px 12px',
        borderRadius: 10,
        background: 'var(--adm-panel-2)',
        border: '1px solid var(--adm-line)',
        color: color || 'var(--adm-ink-2)',
      }}
    >
      <span>{children}</span>
      {right}
    </div>
  );
}

function IntegrationRow({ label, ok, optional }) {
  const state = ok ? 'ok' : optional ? 'optional' : 'missing';
  const styles = {
    ok: { bg: 'var(--adm-ok-soft)', color: 'var(--adm-ok)', text: 'OK' },
    optional: {
      bg: 'var(--adm-panel-2)',
      color: 'var(--adm-ink-3)',
      text: 'Not configured · optional',
    },
    missing: {
      bg: 'var(--adm-bad-soft)',
      color: 'var(--adm-bad)',
      text: 'MISSING',
    },
  }[state];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 12px',
        borderRadius: 10,
        background: 'var(--adm-panel-2)',
        border: '1px solid var(--adm-line)',
      }}
    >
      <span
        className="adm-mono"
        style={{ fontSize: 12, color: 'var(--adm-ink-2)' }}
      >
        {label}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 9px',
          borderRadius: 10,
          background: styles.bg,
          color: styles.color,
          fontFamily: 'var(--adm-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          fontWeight: 500,
          border: '1px solid ' + styles.color + '33',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: 'currentColor',
          }}
        />
        {styles.text}
      </span>
    </div>
  );
}

const ACCESS_MODE_LABEL = {
  email_allowlist: 'Email allowlist · managed below',
};

/* ── Email chip (single row in the list) ────────────────────────────────── */
function EmailChip({ email, source, onRemove, removing }) {
  const isEnv = source === 'env';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderRadius: 10,
        background: 'var(--adm-panel-2)',
        border: '1px solid var(--adm-line)',
        gap: 10,
      }}
    >
      <span
        className="adm-mono"
        style={{
          fontSize: 12,
          color: 'var(--adm-ink-2)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {email}
      </span>
      {isEnv ? (
        <span
          title="Managed in Platform → Members"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 7px',
            borderRadius: 10,
            background: 'var(--adm-panel-2)',
            color: 'var(--adm-ink-4)',
            fontFamily: 'var(--adm-mono)',
            fontSize: 9.5,
            letterSpacing: '0.08em',
          }}
        >
          <Ico.lock />
          &nbsp;ENV
        </span>
      ) : (
        <button
          onClick={onRemove}
          disabled={removing}
          title="Remove this email"
          style={{
            width: 22,
            height: 22,
            borderRadius: 8,
            border: '1px solid var(--adm-line)',
            background: removing ? 'var(--adm-panel-2)' : 'transparent',
            color: 'var(--adm-ink-3)',
            cursor: removing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Ico.x />
        </button>
      )}
    </div>
  );
}

/* ── Add email form (inline) ────────────────────────────────────────────── */
function AddEmailForm({ role, onAdd, onCancel }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErr('Enter a valid email');
      return;
    }
    setSaving(true);
    setErr('');
    const ok = await onAdd(email.trim(), role);
    setSaving(false);
    if (ok) {
      setEmail('');
      onCancel();
    } else setErr('Failed to save — check console');
  }

  return (
    <form
      onSubmit={submit}
      className="adm-settings-add-form"
      style={{ display: 'flex', gap: 6, marginTop: 4 }}
    >
      <input
        ref={inputRef}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setErr('');
        }}
        placeholder={`email@domain.com`}
        style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: 10,
          border: err
            ? '1px solid var(--adm-bad)'
            : '1px solid var(--adm-line)',
          background: 'var(--adm-canvas)',
          color: 'var(--adm-ink)',
          fontFamily: 'var(--adm-mono)',
          fontSize: 12,
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={saving}
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid var(--adm-accent)',
          background: 'var(--adm-accent)',
          color: 'var(--adm-accent-ink)',
          fontFamily: 'var(--adm-mono)',
          fontSize: 11,
          letterSpacing: '0.06em',
          cursor: saving ? 'default' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {saving ? (
          '…'
        ) : (
          <>
            <Ico.check /> Save
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid var(--adm-line)',
          background: 'transparent',
          color: 'var(--adm-ink-3)',
          fontFamily: 'var(--adm-mono)',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
      {err && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--adm-bad)',
            alignSelf: 'center',
            fontFamily: 'var(--adm-mono)',
          }}
        >
          {err}
        </span>
      )}
    </form>
  );
}

/* ── Email section (admin or reviewer) ──────────────────────────────────── */
function EmailSection({ label, emails, role, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [removingEmail, setRemovingEmail] = useState(null);

  async function handleRemove(email) {
    setRemovingEmail(email);
    await onRemove(email);
    setRemovingEmail(null);
  }

  async function handleAdd(email, r) {
    const ok = await onAdd(email, r);
    return ok;
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          className="adm-eyebrow"
          style={{ color: 'var(--adm-ink-4)', fontSize: 9.5 }}
        >
          {label}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              borderRadius: 10,
              border: '1px solid var(--adm-line)',
              background: 'transparent',
              color: 'var(--adm-ink-3)',
              fontFamily: 'var(--adm-mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              cursor: 'pointer',
            }}
          >
            <Ico.plus /> Add
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {emails.length === 0 && !adding && (
          <div
            className="adm-mono"
            style={{
              fontSize: 11,
              color: 'var(--adm-ink-4)',
              padding: '8px 12px',
            }}
          >
            No {role} emails configured
          </div>
        )}
        {emails.map((entry) => (
          <EmailChip
            key={entry.email}
            email={entry.email}
            source={entry.source}
            removing={removingEmail === entry.email}
            onRemove={() => handleRemove(entry.email)}
          />
        ))}
        {adding && (
          <AddEmailForm
            role={role}
            onAdd={handleAdd}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Public form open/close row ─────────────────────────────────────────── */
function FormToggleRow({ form, canEdit, saving, onToggle }) {
  const color = form.open ? 'var(--adm-ok)' : 'var(--adm-bad)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 12px',
        borderRadius: 10,
        background: 'var(--adm-panel-2)',
        border: '1px solid var(--adm-line)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          className="adm-mono"
          style={{ fontSize: 12, color: 'var(--adm-ink-2)' }}
        >
          {form.label}
        </div>
        <div
          className="adm-mono"
          style={{ fontSize: 10, color: 'var(--adm-ink-4)', marginTop: 2 }}
        >
          {form.path}
          {form.updatedBy ? ` · last changed by ${form.updatedBy}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            borderRadius: 10,
            color,
            fontFamily: 'var(--adm-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            fontWeight: 500,
            border: '1px solid ' + color + '33',
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: 'currentColor',
            }}
          />
          {form.open ? 'OPEN' : 'CLOSED'}
        </span>
        {canEdit && (
          <button
            onClick={() => onToggle(form)}
            disabled={saving}
            style={{
              padding: '4px 10px',
              borderRadius: 10,
              border: '1px solid var(--adm-line)',
              background: 'transparent',
              color: 'var(--adm-ink-3)',
              fontFamily: 'var(--adm-mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? '…' : form.open ? 'Close' : 'Open'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main panel ──────────────────────────────────────────────────────────── */
export default function SettingsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [savingForm, setSavingForm] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setData(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state updates resolve after await
    load();
  }, []);

  function showToast(msg, bad = false) {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleAdd(email, role) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', email, role }),
    });
    const json = await res.json();
    if (json.ok) {
      showToast(`${email} added as ${role}`);
      await load();
      return true;
    }
    showToast(json.error || 'Failed to add', true);
    return false;
  }

  async function handleRemove(email) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', email }),
    });
    const json = await res.json();
    if (json.ok) {
      showToast(`${email} removed`);
      await load();
    } else {
      showToast(json.error || 'Failed to remove', true);
    }
  }

  async function handleToggleForm(form) {
    const open = !form.open;
    const verb = open ? 'Open' : 'Close';
    if (
      !window.confirm(
        `${verb} ${form.label}? ${
          open
            ? 'The closed notice will be removed and submissions accepted again.'
            : 'A closed notice will show above the form and submissions will be rejected.'
        }`
      )
    )
      return;
    setSavingForm(form.key);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_form', formKey: form.key, open }),
      });
      const json = await res.json();
      if (json.ok) {
        showToast(`${form.label} ${open ? 'opened' : 'closed'}`);
        await load();
      } else {
        showToast(json.error || 'Failed to update', true);
      }
    } catch {
      showToast('Network error — try again', true);
    } finally {
      setSavingForm(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 28,
            zIndex: 100,
            padding: '12px 18px',
            borderRadius: 10,
            background: toast.bad ? 'var(--adm-bad)' : 'var(--adm-ok)',
            color: '#fff',
            fontFamily: 'var(--adm-mono)',
            fontSize: 12,
            letterSpacing: '0.04em',
            boxShadow: '0 8px 24px rgba(17,17,17,0.12)',
            animation: 'adm-fade-up 0.2s ease-out',
          }}
        >
          {toast.msg}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid var(--adm-bad-soft)',
            background: 'var(--adm-bad-soft)',
            fontFamily: 'var(--adm-mono)',
            fontSize: 11,
            color: 'var(--adm-bad)',
          }}
        >
          ⚠ {error}
        </div>
      )}

      <div
        className="adm-settings-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}
      >
        {/* Access Control — spans full width on its own row */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ConfigCard title="Access Control" loading={loading}>
            {data?.access && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <MonoRow
                  color={
                    data.access.mode === 'email_allowlist'
                      ? 'var(--adm-accent)'
                      : undefined
                  }
                >
                  {ACCESS_MODE_LABEL[data.access.mode] || data.access.mode}
                </MonoRow>

                <div
                  className="adm-settings-email-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 24,
                    marginTop: 16,
                  }}
                >
                  <EmailSection
                    label="ADMIN EMAILS"
                    emails={data.access.adminEmails}
                    role="admin"
                    onAdd={handleAdd}
                    onRemove={handleRemove}
                  />
                  <EmailSection
                    label="REVIEWER EMAILS"
                    emails={data.access.reviewerEmails}
                    role="reviewer"
                    onAdd={handleAdd}
                    onRemove={handleRemove}
                  />
                </div>

                <div
                  style={{
                    marginTop: 14,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'var(--adm-canvas-2)',
                    border: '1px solid var(--adm-line)',
                  }}
                >
                  <span
                    className="adm-mono"
                    style={{
                      fontSize: 10,
                      color: 'var(--adm-ink-4)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    <Ico.lock
                      style={{
                        display: 'inline',
                        verticalAlign: 'middle',
                        marginRight: 5,
                      }}
                    />
                    Access is managed in Platform → Members / (memberships), not
                    environment variables. DB-added emails take effect
                    immediately.
                  </span>
                </div>
              </div>
            )}
          </ConfigCard>
        </div>

        {/* Public forms — open or close each one */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ConfigCard title="Registrations & Forms" loading={loading}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data?.forms || []).map((form) => (
                <FormToggleRow
                  key={form.key}
                  form={form}
                  canEdit={Boolean(data?.canEdit)}
                  saving={savingForm === form.key}
                  onToggle={handleToggleForm}
                />
              ))}
              <span
                className="adm-mono"
                style={{
                  fontSize: 10,
                  color: 'var(--adm-ink-4)',
                  letterSpacing: '0.06em',
                  marginTop: 4,
                }}
              >
                Closing a form keeps it visible with a closed notice and rejects
                new submissions. Spot registration at the desk and the
                newsletter are not affected.
                {data && !data.canEdit ? ' Only admins can change these.' : ''}
              </span>
            </div>
          </ConfigCard>
        </div>

        {/* Rate Limits */}
        <ConfigCard title="Rate Limits" loading={loading}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data?.rateLimits || []).map((r, i) => (
              <MonoRow
                key={i}
                right={
                  <span style={{ color: 'var(--adm-ink-3)', fontSize: 11 }}>
                    {r.value}
                  </span>
                }
              >
                {r.label}
              </MonoRow>
            ))}
          </div>
        </ConfigCard>

        {/* Integrations */}
        <ConfigCard title="Integrations" loading={loading}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data?.integrations || []).map((intg) => (
              <IntegrationRow
                key={intg.key}
                label={intg.label}
                ok={intg.ok}
                optional={intg.optional}
              />
            ))}
          </div>
        </ConfigCard>

        {/* Event Config */}
        <ConfigCard title="Event Config" loading={loading}>
          {data?.event && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MonoRow color="var(--adm-accent)">
                {data.event.shortName} · {data.event.dates}
              </MonoRow>
              <MonoRow>Capacity {data.event.capacity}</MonoRow>
              <MonoRow>{data.event.venue}</MonoRow>
              {data.event.waitlistOpen && (
                <MonoRow color="var(--adm-warn)">Waitlist open</MonoRow>
              )}
              {data.event.vipDeskEnabled && (
                <MonoRow color="var(--adm-info)">VIP desk enabled</MonoRow>
              )}
            </div>
          )}
        </ConfigCard>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid var(--adm-line)',
          background: 'var(--adm-canvas-2)',
        }}
      >
        <span
          className="adm-mono"
          style={{
            fontSize: 10,
            color: 'var(--adm-ink-4)',
            letterSpacing: '0.06em',
          }}
        >
          RATE LIMITS · EVENT CONFIG · INTEGRATIONS ARE READ-ONLY · EDIT VIA ENV
          VARS AND REDEPLOY
        </span>
      </div>
    </div>
  );
}
