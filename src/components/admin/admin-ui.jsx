'use client';

import { X } from 'lucide-react';
import { Drawer } from 'vaul';

/* ── Design-token tone map ─────────────────────────────────────────────── */
const TONES = {
  default: {
    fg: 'var(--adm-ink-3)',
    bg: 'var(--adm-panel-2)',
    dot: 'var(--adm-ink-3)',
  },
  warning: {
    fg: 'var(--adm-warn)',
    bg: 'var(--adm-warn-soft)',
    dot: 'var(--adm-warn)',
  },
  success: {
    fg: 'var(--adm-ok)',
    bg: 'var(--adm-ok-soft)',
    dot: 'var(--adm-ok)',
  },
  danger: {
    fg: 'var(--adm-bad)',
    bg: 'var(--adm-bad-soft)',
    dot: 'var(--adm-bad)',
  },
  accent: {
    fg: 'var(--adm-accent)',
    bg: 'var(--adm-accent-soft)',
    dot: 'var(--adm-accent)',
  },
  info: {
    fg: 'var(--adm-info)',
    bg: 'var(--adm-info-soft)',
    dot: 'var(--adm-info)',
  },
};

export function getToneClasses(tone = 'default') {
  // kept for backward compat — callers that use .badge/.dot/.panel/.card/.iconBg
  const t = TONES[tone] || TONES.default;
  return {
    badge: '', // we now use inline styles
    dot: '',
    panel: '',
    card: '',
    iconBg: '',
    _tone: t, // expose resolved token set
  };
}

/* ── Status badge ──────────────────────────────────────────────────────── */
export function AdminStatusBadge({
  children,
  tone = 'default',
  className = '',
  style: extraStyle = {},
}) {
  const t = TONES[tone] || TONES.default;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 10,
        border: `1px solid ${t.fg}44`,
        background: t.bg,
        color: t.fg,
        fontFamily: 'var(--adm-mono)',
        fontSize: 10.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...extraStyle,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: t.dot,
          flexShrink: 0,
        }}
      />
      {children}
    </span>
  );
}

/* ── Stat card ─────────────────────────────────────────────────────────── */
export function AdminStatCard({
  label,
  value,
  tone = 'default',
  detail,
  icon: Icon,
}) {
  const t = TONES[tone] || TONES.default;
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid var(--adm-line)',
        padding: '18px 20px',
        background: 'var(--adm-panel)',
        transition: 'transform .15s, box-shadow .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(17,17,17,.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: 'var(--adm-mono)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--adm-ink-3)',
              fontWeight: 500,
              margin: 0,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontFamily: 'var(--adm-mono)',
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: 'var(--adm-ink)',
              marginTop: 8,
              lineHeight: 1,
              tabularNums: true,
            }}
          >
            {value}
          </p>
          {detail && (
            <p
              style={{
                marginTop: 6,
                fontSize: 12,
                color: 'var(--adm-ink-3)',
                lineHeight: 1.4,
              }}
            >
              {detail}
            </p>
          )}
        </div>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            flexShrink: 0,
            background: t.bg,
            color: t.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${t.fg}33`,
          }}
        >
          {Icon ? (
            <Icon style={{ width: 18, height: 18 }} />
          ) : (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: t.dot,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Alert / info panel ────────────────────────────────────────────────── */
export function AdminAlert({
  title,
  description,
  tone = 'default',
  actions = null,
  className = '',
}) {
  const t = TONES[tone] || TONES.default;
  return (
    <div
      className={className}
      style={{
        borderRadius: 10,
        padding: '14px 18px',
        border: `1px solid ${t.fg}33`,
        background: t.bg,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          {title && (
            <p
              style={{
                fontFamily: 'var(--adm-mono)',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: 600,
                color: t.fg,
                marginBottom: 6,
              }}
            >
              {title}
            </p>
          )}
          {description && (
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--adm-ink-2)',
              }}
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    </div>
  );
}

/* ── Section heading ───────────────────────────────────────────────────── */
export function AdminSectionHeading({ eyebrow, title, description, action }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow && (
            <p
              style={{
                fontFamily: 'var(--adm-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--adm-accent)',
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              {eyebrow}
            </p>
          )}
          <h2
            style={{
              fontFamily: 'var(--adm-sans)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--adm-ink)',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h2>
          {description && (
            <p
              style={{
                marginTop: 6,
                fontSize: 13,
                color: 'var(--adm-ink-3)',
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </div>
  );
}

/* ── Slide-over drawer ─────────────────────────────────────────────────── */
export function SlideOverDrawer({ open, onClose, title, children }) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(v) => !v && onClose()}
      direction="right"
    >
      <Drawer.Portal>
        <Drawer.Overlay
          className="admin-v2-drawer-overlay"
          style={{ position: 'fixed', inset: 0, zIndex: 50 }}
        />
        <Drawer.Content
          className="admin-v2-drawer-content"
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            zIndex: 50,
            display: 'flex',
            height: '100%',
            width: '100%',
            maxWidth: 480,
            flexDirection: 'column',
            overflow: 'hidden',
            borderLeft: '1px solid var(--adm-line-strong)',
            background: 'var(--adm-panel, #11141c)',
            color: 'var(--adm-ink, #f3f4f7)',
            fontFamily: 'var(--adm-sans)',
            boxShadow: '-24px 0 60px rgba(17,17,17,.12)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--adm-line)',
              padding: '14px 20px',
              flexShrink: 0,
            }}
          >
            <Drawer.Title
              style={{
                fontFamily: 'var(--adm-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--adm-accent)',
                fontWeight: 500,
                margin: 0,
              }}
            >
              {title}
            </Drawer.Title>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                border: '1px solid var(--adm-line)',
                background: 'var(--adm-panel-2)',
                color: 'var(--adm-ink-2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <div
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20 }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── Toast ─────────────────────────────────────────────────────────────── */
export function AdminToast({ message, tone = 'default', onDismiss }) {
  const t = TONES[tone] || TONES.default;
  if (!message) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        borderRadius: 10,
        border: `1px solid ${t.fg}33`,
        background: t.bg,
        padding: '12px 16px',
      }}
    >
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--adm-ink-2)' }}>
        {message}
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--adm-ink-3)',
            flexShrink: 0,
            padding: 2,
          }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      )}
    </div>
  );
}

/* ── Loading skeleton rows ─────────────────────────────────────────────── */
export function LoadingRows({ count = 6, cols = 7 }) {
  return (
    <>
      {Array.from({ length: count }, (_, r) => (
        <tr key={r} style={{ borderBottom: '1px solid var(--adm-line)' }}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} style={{ padding: '14px 16px' }}>
              <div
                style={{
                  height: 14,
                  borderRadius: 10,
                  background: 'var(--adm-panel-2)',
                  width: `${55 + ((r * 3 + c * 7) % 35)}%`,
                  animation: 'adm-skeleton-pulse 1.6s ease-in-out infinite',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
