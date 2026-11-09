'use client';

import { useEffect, useMemo, useState } from 'react';
import { Toaster } from 'sonner';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminSignOut } from '@/lib/admin-sign-out';
import { buildAdminNavigation } from '@/lib/admin-shell-utils.cjs';
import AdminCommandPalette from '@/components/admin/admin-command-palette';

/* ── Inline SVG icons (thin stroke, 18×18) ───────────────────────────────── */
const Ico = {
  gauge: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M12 14l4-4" />
      <path d="M4 14a8 8 0 0 1 16 0" />
      <path d="M4 14v2M20 14v2" />
    </svg>
  ),
  users: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15 19c0-2.6 1.8-4.8 4.2-5.3" />
    </svg>
  ),
  mail: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  bell: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  ),
  badge: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <rect x="5" y="6" width="14" height="15" rx="2" />
      <path d="M10 3h4v4h-4z" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M8.5 17.5c.7-1.4 2-2.2 3.5-2.2s2.8.8 3.5 2.2" />
    </svg>
  ),
  ticket: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2" />
    </svg>
  ),
  truck: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  ),
  qr: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      {...p}
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h7" />
    </svg>
  ),
  search: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  logout: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  audit: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 12h7M9 16h7M9 8h3" />
    </svg>
  ),
  gear: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.5a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.5a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
    </svg>
  ),
};

const NAV_ICONS = {
  '/admin/registrations': Ico.users,
  '/admin/submissions': Ico.audit,
  '/admin/guest-invitations': Ico.ticket,
  '/admin/speaker-communications': Ico.badge,
  '/admin/reminders': Ico.bell,
  '/admin/certificates': Ico.audit,
  '/admin/spot-registrations': Ico.users,
  '/admin/email-jobs': Ico.mail,
  '/admin/delivery': Ico.truck,
  '/admin/check-in': Ico.qr,
  '/admin/audit': Ico.audit,
  '/admin/settings': Ico.gear,
};

const PAGE_TITLES = {
  '/admin/registrations': {
    kicker: 'REGISTRATIONS · REVIEW',
    title: 'Review Queue',
    meta: 'Pending decisions',
  },
  '/admin/submissions': {
    kicker: 'SUBMISSIONS · INBOX',
    title: 'Submissions',
    meta: 'Applications and enquiries',
  },
  '/admin/guest-invitations': {
    kicker: 'GUESTS · INVITATIONS',
    title: 'Guest Invitations',
    meta: 'Manual · No QR credential',
  },
  '/admin/speaker-communications': {
    kicker: 'SPEAKERS · BADGES',
    title: 'Speaker Communications',
    meta: 'Fixed badge email · Per edition',
  },
  '/admin/reminders': {
    kicker: 'REGISTRANTS · REMINDERS',
    title: 'Event Reminders',
    meta: 'Editable copy · Confirmed registrants',
  },
  '/admin/certificates': {
    kicker: 'ATTENDEES · CERTIFICATES',
    title: 'Certificates',
    meta: 'Participation certificates · Checked-in attendees',
  },
  '/admin/spot-registrations': {
    kicker: 'DAY-OF · WALK-INS',
    title: 'Spot Registrations',
    meta: 'Desk check-in and email',
  },
  '/admin/email-jobs': {
    kicker: 'EMAILS · OUTGOING',
    title: 'Outgoing Emails',
    meta: 'Provider history and registration email jobs',
  },
  '/admin/delivery': {
    kicker: 'EMAILS · QR PASSES',
    title: 'QR Pass Emails',
    meta: 'QR and v2 entry pass delivery',
  },
  '/admin/check-in': {
    kicker: 'DAY-OF · LIVE',
    title: 'Check-in',
    meta: 'QR scanner ready',
  },
  '/admin/audit': {
    kicker: 'SYSTEM · AUDIT',
    title: 'Audit Trail',
    meta: 'Operator and system actions',
  },
  '/admin/settings': { kicker: 'SYSTEM · CONFIG', title: 'Settings', meta: '' },
};

const ADM_NAV_ITEMS = [
  '/admin/registrations',
  '/admin/submissions',
  '/admin/guest-invitations',
  '/admin/speaker-communications',
  '/admin/reminders',
  '/admin/certificates',
  '/admin/spot-registrations',
  '/admin/email-jobs',
  '/admin/delivery',
  '/admin/check-in',
  '/admin/audit',
  '/admin/settings',
];

function daysToEvent() {
  const event = new Date('2026-10-14T00:00:00+05:30');
  const diff = Math.ceil(
    (event.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, diff);
}

function eventStatusLabel() {
  if (Date.now() >= new Date('2026-10-16T00:00:00+05:30').getTime()) {
    return 'Event completed';
  }
  const days = daysToEvent();
  return days > 0 ? `${days} days until the event` : 'Event underway';
}

function getInitials(name) {
  return String(name || 'OP')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
function Sidebar({ currentPath, navSections, operator, onSignOut }) {
  const isActive = (href) => currentPath.startsWith(href);

  const navLabels = {};
  navSections.forEach((s) =>
    s.items.forEach((item) => {
      navLabels[item.href] = item;
    })
  );

  return (
    <aside
      className="adm-sidebar"
      style={{
        width: 248,
        flexShrink: 0,
        borderRight: '1px solid var(--adm-line)',
        background: 'var(--adm-canvas-2)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--adm-line)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: '#fff',
            borderRadius: 0,
            padding: '5px 10px',
          }}
        >
          <Image
            src="/img/mash-logo.png"
            alt="Mash Event 2026 — Mash Events"
            width={148}
            height={40}
            style={{
              objectFit: 'contain',
              objectPosition: 'left',
              display: 'block',
            }}
            priority
          />
        </div>
        <div
          className="adm-mono"
          style={{
            fontSize: 10,
            color: 'var(--adm-ink-3)',
            letterSpacing: '0.1em',
            marginTop: 8,
          }}
        >
          OPERATIONS CONSOLE · OCT 2026
        </div>
      </div>

      {/* Nav */}
      <nav
        aria-label="Admin pages"
        style={{ flex: 1, overflow: 'auto', padding: '14px 10px' }}
      >
        {ADM_NAV_ITEMS.map((href) => {
          const Icon = NAV_ICONS[href];
          const meta = navLabels[href];
          const active = isActive(href);
          const label = PAGE_TITLES[href]?.title || href;
          return (
            <Link
              key={href}
              href={href}
              className="adm-nav-btn"
              aria-current={active ? 'page' : undefined}
              style={{
                width: '100%',
                textAlign: 'left',
                textDecoration: 'none',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                marginBottom: 2,
                background: active ? 'var(--adm-panel-2)' : 'transparent',
                border: '1px solid transparent',
                borderRadius: 10,
                color: active ? 'var(--adm-ink)' : 'var(--adm-ink-2)',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                cursor: 'pointer',
                position: 'relative',
                fontFamily: 'var(--adm-sans)',
              }}
            >
              {active && (
                <span
                  style={{
                    position: 'absolute',
                    left: -1,
                    top: 10,
                    bottom: 10,
                    width: 2,
                    background: 'var(--adm-accent)',
                    borderRadius: 10,
                  }}
                />
              )}
              {Icon && (
                <Icon
                  style={{
                    color: active ? 'var(--adm-accent)' : 'var(--adm-ink-3)',
                  }}
                />
              )}
              <span style={{ flex: 1 }}>{label}</span>
              {meta?.showBadge && (
                <span
                  className="adm-mono"
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 10,
                    background: 'var(--adm-accent-soft)',
                    color: 'var(--adm-accent)',
                    border: '1px solid var(--adm-accent-line)',
                  }}
                >
                  {meta.badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Event panel */}
      <div style={{ padding: 12, borderTop: '1px solid var(--adm-line)' }}>
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: 'var(--adm-panel)',
            border: '1px solid var(--adm-line)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            className="adm-eyebrow"
            style={{ color: 'var(--adm-accent)', marginBottom: 6 }}
          >
            {eventStatusLabel()}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.3,
              color: 'var(--adm-ink)',
            }}
          >
            Trust &amp; Safety India Festival
          </div>
          <div
            className="adm-mono"
            style={{
              fontSize: 10.5,
              color: 'var(--adm-ink-3)',
              marginTop: 4,
              letterSpacing: '0.04em',
            }}
          >
            14–15 OCT 2026
          </div>
          <div
            className="adm-mono"
            style={{
              fontSize: 10.5,
              color: 'var(--adm-ink-3)',
              letterSpacing: '0.04em',
            }}
          >
            INDIA INTERNATIONAL CENTRE
          </div>
        </div>

        {/* Operator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 4px 2px',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: 'var(--adm-accent)',
              color: 'var(--adm-accent-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--adm-mono)',
              fontSize: 11,
              fontWeight: 600,
              border: '1px solid var(--adm-line)',
            }}
          >
            {getInitials(operator?.displayName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--adm-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {operator?.displayName || 'Operator'}
            </div>
            <div
              className="adm-mono"
              style={{ fontSize: 10, color: 'var(--adm-ink-3)' }}
            >
              ADMIN · ONLINE
            </div>
          </div>
          <span
            className="adm-pulse-dot"
            style={{ background: 'var(--adm-ok)' }}
          />
          <button
            onClick={onSignOut}
            title="Sign out"
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              border: '1px solid var(--adm-line)',
              background: 'transparent',
              color: 'var(--adm-ink-3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ico.logout />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ── TopBar ──────────────────────────────────────────────────────────────── */
function TopBar({ currentPath, onPalette, operator }) {
  const titleDef =
    PAGE_TITLES[currentPath] || PAGE_TITLES['/admin/registrations'];

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'color-mix(in srgb, var(--adm-canvas) 92%, transparent)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--adm-line)',
      }}
    >
      {/* Title row */}
      <div
        className="adm-topbar-title-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 22px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="adm-eyebrow adm-topbar-kicker"
            style={{ marginBottom: 4, color: 'var(--adm-accent)' }}
          >
            {titleDef.kicker}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <h1
              className="adm-topbar-h1"
              style={{
                fontFamily: 'var(--adm-sans)',
                fontSize: 32,
                fontWeight: 600,
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.05,
                color: 'var(--adm-ink)',
              }}
            >
              {titleDef.title}
            </h1>
            {titleDef.meta && (
              <span
                className="adm-mono adm-topbar-meta"
                style={{
                  fontSize: 11,
                  color: 'var(--adm-ink-3)',
                  letterSpacing: '0.06em',
                }}
              >
                {titleDef.meta.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        <button
          className="adm-topbar-search"
          onClick={onPalette}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 10,
            background: 'var(--adm-panel)',
            border: '1px solid var(--adm-line)',
            width: 260,
            cursor: 'pointer',
            color: 'var(--adm-ink-3)',
            fontFamily: 'var(--adm-sans)',
            fontSize: 13,
          }}
        >
          <Ico.search />
          <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to…</span>
          <kbd
            className="adm-mono"
            style={{
              fontSize: 10,
              padding: '2px 6px',
              border: '1px solid var(--adm-line)',
              borderRadius: 10,
            }}
          >
            ⌘K
          </kbd>
        </button>

        {/* Actions */}
        <button
          onClick={onPalette}
          className="adm-topbar-search-icon"
          title="Search (⌘K)"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid var(--adm-line)',
            background: 'var(--adm-panel)',
            color: 'var(--adm-ink-2)',
            cursor: 'pointer',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ico.search />
        </button>
        {/* Current user */}
        <div
          className="adm-topbar-operator"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid var(--adm-line)',
            background: 'var(--adm-panel)',
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              flexShrink: 0,
              background: 'var(--adm-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--adm-mono)',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--adm-accent-ink)',
              border: '1px solid var(--adm-line)',
            }}
          >
            {getInitials(operator?.displayName)}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--adm-ink)',
                whiteSpace: 'nowrap',
              }}
            >
              {operator?.displayName || 'Operator'}
            </div>
            <div
              className="adm-mono"
              style={{
                fontSize: 9.5,
                color: 'var(--adm-ink-3)',
                letterSpacing: '0.06em',
              }}
            >
              ADMIN · ONLINE
            </div>
          </div>
          <span
            className="adm-pulse-dot"
            style={{ background: 'var(--adm-ok)', flexShrink: 0 }}
          />
        </div>
      </div>

      {/* Mobile nav tabs */}
      <div
        className="adm-mobile-nav"
        style={{
          gap: 6,
          overflowX: 'auto',
          padding: '0 12px 10px',
          fontFamily: 'var(--adm-sans)',
        }}
      >
        {Object.entries(PAGE_TITLES).map(([href, def]) => {
          const Icon = NAV_ICONS[href];
          const active = currentPath.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
                padding: '7px 12px',
                borderRadius: 10,
                fontSize: 12,
                whiteSpace: 'nowrap',
                border:
                  '1px solid ' +
                  (active ? 'var(--adm-accent-line)' : 'var(--adm-line)'),
                background: active
                  ? 'var(--adm-accent-soft)'
                  : 'var(--adm-panel)',
                color: active ? 'var(--adm-accent)' : 'var(--adm-ink-2)',
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
              }}
            >
              {Icon && <Icon style={{ width: 14, height: 14 }} />}
              {def.title}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

/* ── Main shell ──────────────────────────────────────────────────────────── */
export default function AdminShell({ operator, children }) {
  // Session, MFA level and event permission are enforced server-side by the
  // admin layout and proxy (docs/system-design.md §6), so the shell no longer
  // polls a client auth SDK.
  const signOut = useAdminSignOut();
  const currentPath = usePathname() || '/admin/registrations';
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const navSections = useMemo(
    () => buildAdminNavigation({ pathname: currentPath }),
    [currentPath]
  );
  async function handleSignOut() {
    await signOut({ redirectUrl: '/' });
  }

  return (
    <div
      className="admin-v2"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'row',
        fontFamily: 'var(--adm-sans)',
      }}
    >
      <Sidebar
        currentPath={currentPath}
        navSections={navSections}
        operator={operator}
        onSignOut={handleSignOut}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TopBar
          currentPath={currentPath}
          onPalette={() => setPaletteOpen(true)}
          operator={operator}
        />
        <main
          className="adm-page-content"
          style={{ flex: 1, padding: '24px 28px 48px 28px' }}
        >
          {children}
        </main>
      </div>

      <AdminCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  );
}
