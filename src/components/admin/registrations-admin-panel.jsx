'use client';

import '@1771technologies/lytenyte-core/light-dark.css';
import Image from 'next/image';
import {
  memo,
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Grid, useClientDataSource } from '@1771technologies/lytenyte-core';
import {
  Clock,
  Download,
  ExternalLink,
  Linkedin,
  Loader2,
  MessageSquare,
  CheckCircle2,
  QrCode,
  UserCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ATTENDEE_CATEGORIES } from '@/lib/registration-constants';
import dashboardUtils from '@/lib/admin-dashboard-utils.cjs';
import checkInDayUtils from '@/lib/check-in-day-utils.cjs';
import {
  AdminAlert,
  AdminSectionHeading,
  AdminStatCard,
  AdminStatusBadge,
  LoadingRows,
  SlideOverDrawer,
} from '@/components/admin/admin-ui';
import AdminPageIntro from '@/components/admin/admin-page-intro';
import {
  QrSendProgressCard,
  useQrSendProgress,
} from '@/components/admin/qr-send-progress';
import registrationCache from '@/lib/admin-registration-cache.cjs';

const {
  buildDashboardQueryString,
  getLinkedInProfileUrl,
  getBatchStatusTone,
  summarizeQrSelection,
  getQuickActionOptions,
  isSupabaseAdminConfigError,
  summarizeSelection,
} = dashboardUtils;

const {
  DEFAULT_LIST_TTL_MS,
  DEFAULT_DETAIL_TTL_MS,
  createMemoryCache,
  applyRegistrationListCache,
  readRegistrationListCache,
  applySavedRegistrationsToList,
  applyRegistrationDetailCache,
  readRegistrationDetailCache,
  invalidateRegistrationCaches,
} = registrationCache;
const { getCheckInForDay } = checkInDayUtils;

function formatDate(value) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getStatusTone(status) {
  if (status === 'confirmed') return 'success';
  if (status === 'pending' || status === 'waitlisted') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'default';
}

function getDeliveryTone(status) {
  if (status === 'sent' || status === 'delivered') return 'success';
  if (status === 'failed' || status === 'bounced') return 'danger';
  if (status === 'queued' || status === 'processing') return 'warning';
  return 'default';
}

function getPriorityTone(priorityTier) {
  if (/purple/i.test(priorityTier || '')) return 'accent';
  if (/gold/i.test(priorityTier || '')) return 'warning';
  if (/blue/i.test(priorityTier || '')) return 'info';
  return 'default';
}

function statusHint(status) {
  if (status === 'confirmed')
    return 'A new confirmation decision queues an email. Saving notes alone does not resend it.';
  if (status === 'waitlisted')
    return 'Waitlisted registrants are held out of the QR queue until re-confirmed.';
  if (status === 'rejected')
    return 'Rejected registrants are blocked from entry and removed from QR delivery.';
  return 'Pending keeps the record open for operator review without sending a decision email.';
}

const TEXT_FILTER_KEYS = ['search', 'city', 'country', 'organization'];

// ── LyteNyte Grid ─ shared context, cell renderers, and column definitions ───
const RegistrationGridCtx = createContext(null);

// Re-renders only when its rows or columns change, not on every keystroke in
// the filters or the review drawer.
const RegistrationGrid = memo(function RegistrationGrid({
  columns,
  rowSource,
}) {
  return <Grid columns={columns} rowSource={rowSource} rowHeight={72} />;
});

function SelectAllHeader() {
  const ctx = useContext(RegistrationGridCtx);
  if (!ctx) return null;
  return (
    <div className="flex h-full items-center justify-center">
      <input
        type="checkbox"
        checked={ctx.allVisibleSelected}
        onChange={ctx.toggleVisibleSelection}
        className="rounded border-zinc-300 dark:border-white/10"
      />
    </div>
  );
}

function CheckboxCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  const selected = ctx.selectedSet.has(row.data.id);
  return (
    <div
      className="flex h-full items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => ctx.toggleSelection(row.data.id)}
        className="rounded border-zinc-300 dark:border-white/10"
      />
    </div>
  );
}

function RegistrantCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  const r = row.data;
  const linkedInUrl = getLinkedInProfileUrl(r.linkedin_url);
  return (
    <div
      className="flex h-full cursor-pointer flex-col justify-center py-1"
      onClick={() => ctx.openDrawerFor(r.id)}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {r.first_name} {r.last_name}
        </p>
        {linkedInUrl ? (
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            aria-label={`Open ${r.first_name} ${r.last_name}'s LinkedIn profile`}
            className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
          >
            <Linkedin className="h-3 w-3" /> LinkedIn
          </a>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {r.registration_code}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
        {r.organization || 'Independent'} …{' '}
        {r.attendee_category || 'Unspecified'}
      </p>
    </div>
  );
}

function EmailCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  return (
    <div
      className="flex h-full cursor-pointer items-center"
      onClick={() => ctx.openDrawerFor(row.data.id)}
    >
      <p className="text-xs text-zinc-700 dark:text-zinc-300">
        {row.data.email}
      </p>
    </div>
  );
}

function RegStatusCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  return (
    <div
      className="flex h-full cursor-pointer items-center"
      onClick={() => ctx.openDrawerFor(row.data.id)}
    >
      <AdminStatusBadge tone={getStatusTone(row.data.status)}>
        {row.data.status}
      </AdminStatusBadge>
    </div>
  );
}

function NotesCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  return (
    <button
      type="button"
      className="flex h-full items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300"
      onClick={() => ctx.openDrawerFor(row.data.id)}
      aria-label={
        row.data.has_review_note
          ? `Read note for ${row.data.first_name} ${row.data.last_name}`
          : `Open ${row.data.first_name} ${row.data.last_name}; no note added`
      }
    >
      {row.data.has_review_note ? (
        <>
          <MessageSquare className="h-3.5 w-3.5" /> Note added
        </>
      ) : (
        'None'
      )}
    </button>
  );
}

function LocationCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  const loc =
    [row.data.city, row.data.country].filter(Boolean).join(', ') || '…';
  return (
    <div
      className="flex h-full cursor-pointer items-center"
      onClick={() => ctx.openDrawerFor(row.data.id)}
    >
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{loc}</p>
    </div>
  );
}

function QRStatusCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  return (
    <div
      className="flex h-full cursor-pointer items-center"
      onClick={() => ctx.openDrawerFor(row.data.id)}
    >
      <AdminStatusBadge tone={row.data.qr_pass_issued_at ? 'info' : 'default'}>
        {row.data.qr_pass_issued_at ? 'Issued' : 'Pending'}
      </AdminStatusBadge>
    </div>
  );
}

function CheckInCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  const day1 = getCheckInForDay(row.data, 'day_1')?.checked_in_at;
  const day2 = getCheckInForDay(row.data, 'day_2')?.checked_in_at;
  return (
    <div
      className="flex h-full cursor-pointer items-center"
      onClick={() => ctx.openDrawerFor(row.data.id)}
    >
      <div className="flex flex-wrap gap-1">
        <AdminStatusBadge tone={day1 ? 'success' : 'default'}>
          Day 1
        </AdminStatusBadge>
        <AdminStatusBadge tone={day2 ? 'success' : 'default'}>
          Day 2
        </AdminStatusBadge>
      </div>
    </div>
  );
}

function ActionsCell({ row }) {
  const ctx = useContext(RegistrationGridCtx);
  if (!row.data || !ctx) return null;
  return (
    <div
      className="flex h-full items-center"
      onClick={(e) => e.stopPropagation()}
    >
      <RowActions
        registration={row.data}
        onQuickAction={ctx.handleQuickAction}
        pendingActions={ctx.pendingActions}
        disabled={ctx.disabled}
      />
    </div>
  );
}

const REGISTRATION_COLUMNS = [
  {
    id: 'select',
    name: '',
    width: 52,
    cellRenderer: CheckboxCell,
    headerRenderer: SelectAllHeader,
  },
  {
    id: 'registrant',
    name: 'Registrant',
    width: 260,
    cellRenderer: RegistrantCell,
  },
  { id: 'email', name: 'Email', width: 220, cellRenderer: EmailCell },
  { id: 'status', name: 'Status', width: 130, cellRenderer: RegStatusCell },
  { id: 'notes', name: 'Notes', width: 115, cellRenderer: NotesCell },
  { id: 'location', name: 'Location', width: 160, cellRenderer: LocationCell },
  { id: 'qr', name: 'QR', width: 110, cellRenderer: QRStatusCell },
  { id: 'checkin', name: 'Check-In', width: 160, cellRenderer: CheckInCell },
  { id: 'actions', name: 'Actions', width: 320, cellRenderer: ActionsCell },
];

// Columns hidden below the wide breakpoint. Core review columns (select,
// registrant, email, status, actions) always stay visible; the hidden data
// remains available through the registrant detail drawer.
const COMPACT_HIDDEN_COLUMN_IDS = new Set(['location', 'qr', 'checkin']);
const WIDE_GRID_MEDIA_QUERY = '(min-width: 1400px)';

function useResponsiveRegistrationColumns() {
  const [isWide, setIsWide] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia(WIDE_GRID_MEDIA_QUERY);
    const sync = () => setIsWide(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return useMemo(
    () =>
      isWide
        ? REGISTRATION_COLUMNS
        : REGISTRATION_COLUMNS.map((column) =>
            COMPACT_HIDDEN_COLUMN_IDS.has(column.id)
              ? { ...column, hide: true }
              : column
          ),
    [isWide]
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function ReviewSummary({ summary }) {
  if (!summary) return null;
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminStatCard
        label="Pending Review"
        value={summary.pending}
        tone="warning"
        detail="Needs operator decision"
        icon={Clock}
      />
      <AdminStatCard
        label="Confirmed"
        value={summary.confirmed}
        tone="success"
        detail="Eligible for QR issuance"
        icon={CheckCircle2}
      />
      <AdminStatCard
        label="QR Issued"
        value={summary.qrIssued}
        tone="accent"
        detail="Passes issued"
        icon={QrCode}
      />
      <AdminStatCard
        label="Checked In"
        value={summary.checkedIn}
        tone="info"
        detail="Validated on-site"
        icon={UserCheck}
      />
    </section>
  );
}

function QuickActionButton({
  action,
  onClick,
  disabled = false,
  loading = false,
}) {
  const toneClasses = {
    success:
      'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950',
    warning:
      'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950',
    danger:
      'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950',
    info: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${toneClasses[action.kind] || toneClasses.info} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {action.label}
    </button>
  );
}

function RowActions({
  registration,
  onQuickAction,
  pendingActions,
  disabled = false,
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {getQuickActionOptions(registration).map((action) => {
        const isLoading = pendingActions?.has(
          `${registration.id}:${action.key}`
        );
        return (
          <QuickActionButton
            key={action.key}
            action={action}
            onClick={() => onQuickAction(registration, action.key)}
            disabled={disabled}
            loading={isLoading}
          />
        );
      })}
    </div>
  );
}

function RegistrantDrawer({
  activeRegistrationId,
  previewRegistration,
  detailState,
  detailDraft,
  setDetailDraft,
  saveDetailStatus,
  resendDetailEmail,
  savingDetail,
  onDelete,
  open,
  onClose,
}) {
  const activeRegistration =
    detailState.data?.registration?.id === activeRegistrationId
      ? detailState.data.registration
      : null;
  const [photoLoaded, setPhotoLoaded] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhotoLoaded(false);
  }, [activeRegistration?.id]);
  return (
    <SlideOverDrawer
      open={open}
      onClose={onClose}
      title={
        activeRegistration || previewRegistration
          ? `${(activeRegistration || previewRegistration).first_name} ${(activeRegistration || previewRegistration).last_name}`
          : 'Registrant Detail'
      }
    >
      {detailState.loading ? (
        <div className="space-y-4 py-4">
          {previewRegistration ? (
            <div className="space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
              <p className="font-semibold">
                {previewRegistration.first_name} {previewRegistration.last_name}
              </p>
              <p>
                {previewRegistration.organization || 'Independent attendee'}
              </p>
              <p>{previewRegistration.email}</p>
              <p>Status: {previewRegistration.status}</p>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Loading review details…
            </p>
          </div>
        </div>
      ) : !activeRegistration ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {detailState.error ||
            'Select a registrant row to see their details here.'}
        </p>
      ) : (
        <div className="space-y-5">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <AdminStatusBadge tone="default">
              {activeRegistration.registration_code}
            </AdminStatusBadge>
            <AdminStatusBadge tone={getStatusTone(activeRegistration.status)}>
              {activeRegistration.status}
            </AdminStatusBadge>
            {activeRegistration.qr_pass_issued_at ? (
              <AdminStatusBadge tone="info">QR issued</AdminStatusBadge>
            ) : null}
          </div>

          {/* Core info */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_132px] sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
                Contact
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {activeRegistration.first_name} {activeRegistration.last_name}
              </p>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {activeRegistration.organization || 'Independent attendee'}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                {activeRegistration.email}
              </p>
              {getLinkedInProfileUrl(activeRegistration.linkedin_url) ? (
                <a
                  href={getLinkedInProfileUrl(activeRegistration.linkedin_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View LinkedIn Profile
                </a>
              ) : null}
            </div>
            <div className="relative h-[132px] w-full overflow-hidden rounded-[10px] border border-zinc-200 bg-zinc-100 dark:border-white/[0.06] dark:bg-white/[0.06] sm:w-[132px]">
              {activeRegistration.profilePhotoUrl ? (
                <div className="relative h-full w-full">
                  {!photoLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                    </div>
                  )}
                  <Image
                    src={activeRegistration.profilePhotoUrl}
                    alt={`${activeRegistration.first_name} ${activeRegistration.last_name}`}
                    fill
                    className={`object-cover transition-opacity duration-300 ${photoLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setPhotoLoaded(true)}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No photo
                </div>
              )}
            </div>
          </div>

          {/* Key dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Category
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {activeRegistration.attendee_category || 'Unspecified'}
              </p>
            </div>
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Priority
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {activeRegistration.priority_tier || 'Standard'}
              </p>
            </div>
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Location
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {[activeRegistration.city, activeRegistration.country]
                  .filter(Boolean)
                  .join(', ') || 'Not provided'}
              </p>
            </div>
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                QR Issued
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {formatDate(activeRegistration.qr_pass_issued_at)}
              </p>
            </div>
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Checked In
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {formatDate(activeRegistration.checked_in_at)}
              </p>
            </div>
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Day 1 Check-In
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {formatDate(
                  getCheckInForDay(activeRegistration, 'day_1')?.checked_in_at
                )}
              </p>
            </div>
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Day 2 Check-In
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                {formatDate(
                  getCheckInForDay(activeRegistration, 'day_2')?.checked_in_at
                )}
              </p>
            </div>
          </div>

          {/* Status + notes */}
          <div className="rounded-[10px] border border-zinc-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
                Status + Notes
              </p>
              <button
                type="button"
                onClick={resendDetailEmail}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-800 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/10 dark:hover:text-zinc-100"
              >
                Resend Update
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {statusHint(detailDraft.status)}
            </p>
            <div className="mt-3 space-y-3">
              <select
                value={detailDraft.status}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                className="h-9 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="rejected">Rejected</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={detailDraft.speakerFlag}
                    onChange={(event) =>
                      setDetailDraft((current) => ({
                        ...current,
                        speakerFlag: event.target.checked,
                      }))
                    }
                  />
                  Speaker
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={detailDraft.vipFlag}
                    onChange={(event) =>
                      setDetailDraft((current) => ({
                        ...current,
                        vipFlag: event.target.checked,
                      }))
                    }
                  />
                  VIP
                </label>
              </div>
              <textarea
                id="reviewNotes"
                name="reviewNotes"
                value={detailDraft.reviewNotes}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    reviewNotes: event.target.value,
                  }))
                }
                className="min-h-24 w-full resize-none rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
                placeholder="Operator notes for context, exceptions, or follow-up"
              />
              <button
                type="button"
                onClick={saveDetailStatus}
                disabled={savingDetail}
                className="flex h-9 items-center gap-2 rounded-full bg-amber-600 px-4 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {savingDetail ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {savingDetail ? 'Saving…' : 'Save Notes + Status'}
              </button>{' '}
              {onDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex h-9 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Registration
                </button>
              ) : null}{' '}
            </div>
          </div>

          {/* Status history */}
          {(detailState.data?.history || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
                Status History
              </p>
              <div className="mt-2 space-y-2">
                {detailState.data.history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                        {item.action_type}
                      </p>
                      <AdminStatusBadge tone={getStatusTone(item.next_status)}>
                        {item.next_status || 'update'}
                      </AdminStatusBadge>
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.notes || 'No notes captured.'}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email timeline */}
          {(detailState.data?.notifications || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
                Email Timeline
              </p>
              <div className="mt-2 space-y-2">
                {detailState.data.notifications.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                        {item.template_type}
                      </p>
                      <AdminStatusBadge
                        tone={getDeliveryTone(item.delivery_status)}
                      >
                        {item.delivery_status || 'pending'}
                      </AdminStatusBadge>
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.failure_reason ||
                        item.recipient_email ||
                        'Awaiting delivery update.'}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                      {formatDate(item.updated_at || item.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SlideOverDrawer>
  );
}

export default function RegistrationsAdminPanel({ operator }) {
  const listCacheRef = useRef(
    createMemoryCache({ ttlMs: DEFAULT_LIST_TTL_MS })
  );
  const detailCacheRef = useRef(
    createMemoryCache({ ttlMs: DEFAULT_DETAIL_TTL_MS })
  );
  const listRequestRef = useRef(0);
  const listAbortRef = useRef(null);
  const lastListRequestAtRef = useRef(0);
  const detailRequestRef = useRef(0);
  const detailAbortRef = useRef(null);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    category: 'all',
    city: '',
    country: '',
    organization: '',
    // '' shows everyone; 'yes' shows only registrants marked as speakers.
    speakerFlag: '',
    page: 1,
    pageSize: 50,
  });
  const [state, setState] = useState({
    loading: true,
    registrations: [],
    summary: null,
    pagination: null,
    count: 0,
    error: '',
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeRegistrationId, setActiveRegistrationId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailState, setDetailState] = useState({
    loading: false,
    data: null,
    error: '',
  });
  const [detailDraft, setDetailDraft] = useState({
    status: 'pending',
    speakerFlag: false,
    vipFlag: false,
    reviewNotes: '',
  });
  const [savingDetail, setSavingDetail] = useState(false);
  const [exportLoading, setExportLoading] = useState({
    csv: false,
    xlsx: false,
  });
  const [pendingActions, setPendingActions] = useState(new Set());
  const [pendingBulk, setPendingBulk] = useState({
    confirm: false,
    waitlist: false,
    reject: false,
  });
  const [qrLoading, setQrLoading] = useState(false);
  // Free-text filters wait until typing pauses, so each keystroke does not
  // fire a request or clear the selection.
  const [debouncedText, setDebouncedText] = useState({
    search: filters.search,
    city: filters.city,
    country: filters.country,
    organization: filters.organization,
  });
  const debouncedTextRef = useRef(debouncedText);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = {
        search: filters.search,
        city: filters.city,
        country: filters.country,
        organization: filters.organization,
      };
      const current = debouncedTextRef.current;
      if (TEXT_FILTER_KEYS.every((key) => current[key] === next[key])) return;
      debouncedTextRef.current = next;
      setSelectedIds([]);
      setDebouncedText(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search, filters.city, filters.country, filters.organization]);
  const queryString = useMemo(
    () => buildDashboardQueryString({ ...filters, ...debouncedText }),
    [debouncedText, filters]
  );
  const hasConfigError = isSupabaseAdminConfigError(state.error);
  const selectionSummary = summarizeSelection({
    selectedCount: selectedIds.length,
    matchedCount: state.count,
  });
  const orderedRegistrations = state.registrations || [];
  const ds = useClientDataSource({ data: orderedRegistrations });
  const gridColumns = useResponsiveRegistrationColumns();

  const showToast = (message, tone = 'default') => {
    if (tone === 'success') toast.success(message);
    else if (tone === 'danger') toast.error(message);
    else if (tone === 'warning') toast.warning(message);
    else toast(message);
  };
  const clearToast = () => {};
  const invalidateAdminCaches = (registrationIds = []) => {
    invalidateRegistrationCaches({
      listCache: listCacheRef.current,
      detailCache: detailCacheRef.current,
      registrationIds,
    });
  };
  const applySavedRegistrations = (registrations = []) => {
    setState((current) =>
      applySavedRegistrationsToList(current, registrations)
    );
    setDetailState((current) => {
      const saved = registrations.find(
        (registration) => registration?.id === current.data?.registration?.id
      );
      if (!saved) return current;
      return {
        ...current,
        data: {
          ...current.data,
          registration: { ...current.data.registration, ...saved },
        },
      };
    });
  };

  const loadRegistrations = useCallback(
    async ({ background = false, force = false } = {}) => {
      lastListRequestAtRef.current = Date.now();
      const requestId = ++listRequestRef.current;
      listAbortRef.current?.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;
      const cached = force
        ? null
        : readRegistrationListCache(listCacheRef.current, queryString);
      if (cached) {
        setState(cached);
        return;
      }

      if (!background)
        setState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const response = await fetch(
          `/api/admin/registrations?${queryString}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        const data = await response.json();
        if (requestId !== listRequestRef.current) return;
        if (!response.ok) {
          const error = data.error || 'Unable to load registrations.';
          return setState((current) =>
            background
              ? { ...current, loading: false, error }
              : {
                  loading: false,
                  registrations: [],
                  summary: null,
                  pagination: null,
                  count: 0,
                  error,
                }
          );
        }
        const nextState = {
          loading: false,
          registrations: data.registrations || [],
          summary: data.summary,
          pagination: data.pagination,
          count: data.count || 0,
          error: '',
        };
        applyRegistrationListCache(
          listCacheRef.current,
          queryString,
          nextState
        );
        setState(nextState);
        setSelectedIds((current) =>
          current.filter((id) =>
            (data.registrations || []).some(
              (registration) => registration.id === id
            )
          )
        );
      } catch (error) {
        if (
          requestId !== listRequestRef.current ||
          error?.name === 'AbortError'
        )
          return;
        setState((current) =>
          background
            ? { ...current, loading: false, error: 'Network error.' }
            : {
                loading: false,
                registrations: [],
                summary: null,
                pagination: null,
                count: 0,
                error: 'Network error.',
              }
        );
      }
    },
    [queryString]
  );

  const loadDetail = useCallback(
    async (registrationId, { force = false, background = false } = {}) => {
      if (!registrationId) return;
      const requestId = ++detailRequestRef.current;
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      const cached = force
        ? null
        : readRegistrationDetailCache(detailCacheRef.current, registrationId);
      if (cached) {
        setDetailState({ loading: false, data: cached, error: '' });
        setDetailDraft({
          status: cached.registration.status,
          speakerFlag: Boolean(cached.registration.speaker_flag),
          vipFlag: Boolean(cached.registration.vip_flag),
          reviewNotes: cached.registration.review_notes || '',
        });
        return;
      }

      // A background refresh keeps the drawer content on screen.
      if (!background)
        setDetailState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const response = await fetch(
          `/api/admin/registrations/${registrationId}`,
          { cache: 'no-store', signal: controller.signal }
        );
        const data = await response.json();
        if (requestId !== detailRequestRef.current) return;
        // A failed background refresh leaves the shown detail as it is.
        if (!response.ok && background) return;
        if (!response.ok)
          return setDetailState({
            loading: false,
            data: null,
            error: data.error || 'Unable to load registration detail.',
          });
        applyRegistrationDetailCache(
          detailCacheRef.current,
          registrationId,
          data
        );
        setDetailState({ loading: false, data, error: '' });
        setDetailDraft({
          status: data.registration.status,
          speakerFlag: Boolean(data.registration.speaker_flag),
          vipFlag: Boolean(data.registration.vip_flag),
          reviewNotes: data.registration.review_notes || '',
        });
      } catch (error) {
        if (
          requestId !== detailRequestRef.current ||
          error?.name === 'AbortError' ||
          background
        )
          return;
        setDetailState({
          loading: false,
          data: null,
          error: 'Network error while loading registration detail.',
        });
      }
    },
    []
  );

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  useEffect(() => {
    const refreshIfStale = () => {
      if (document.hidden || Date.now() - lastListRequestAtRef.current < 60_000)
        return;
      void loadRegistrations({ background: true, force: true });
      if (drawerOpen && activeRegistrationId) {
        void loadDetail(activeRegistrationId, {
          force: true,
          background: true,
        });
      }
    };
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [activeRegistrationId, drawerOpen, loadDetail, loadRegistrations]);
  useEffect(() => {
    if (activeRegistrationId) void loadDetail(activeRegistrationId);
  }, [activeRegistrationId, loadDetail]);
  useEffect(
    () => () => {
      listAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    },
    []
  );

  const setFilterValue = (key, value) => {
    // Text filters clear the selection once the debounced query changes.
    if (!TEXT_FILTER_KEYS.includes(key)) setSelectedIds([]);
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  };
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleSelection = useCallback(
    (registrationId) =>
      setSelectedIds((current) =>
        current.includes(registrationId)
          ? current.filter((id) => id !== registrationId)
          : [...current, registrationId]
      ),
    []
  );
  const toggleVisibleSelection = () => {
    const visibleIds = orderedRegistrations.map(
      (registration) => registration.id
    );
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    );
  };

  const openDrawerFor = (registrationId) => {
    if (registrationId === activeRegistrationId) {
      void loadDetail(registrationId);
    } else {
      detailRequestRef.current += 1;
      detailAbortRef.current?.abort();
      setDetailState({ loading: true, data: null, error: '' });
    }
    setActiveRegistrationId(registrationId);
    setDrawerOpen(true);
  };

  const handleExport = async (format) => {
    setExportLoading((prev) => ({ ...prev, [format]: true }));
    clearToast();
    try {
      const response = await fetch(
        `/api/admin/badges/export?format=${format}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        showToast(
          errorData.error ||
            `Export failed (${response.status}). Check your Supabase configuration.`,
          'danger'
        );
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mash-2026-registrations.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(
        `${format.toUpperCase()} export downloaded successfully.`,
        'success'
      );
    } catch {
      showToast('Network error during export. Please try again.', 'danger');
    } finally {
      setExportLoading((prev) => ({ ...prev, [format]: false }));
    }
  };

  const updateRegistrationStatus = async ({
    registrationId,
    status,
    speakerFlag,
    vipFlag,
    reviewNotes,
    expectedUpdatedAt = '',
  }) => {
    const response = await fetch('/api/admin/registrations/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        status,
        speakerFlag,
        vipFlag,
        reviewNotes,
        expectedUpdatedAt,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || 'Unable to update registration.');
    return data;
  };

  const qrSend = useQrSendProgress({
    onFinished: () => {
      invalidateAdminCaches();
      void loadRegistrations({ background: true, force: true });
    },
  });

  const queueQrJob = async ({
    resendExisting = false,
    registrationIds = [],
  } = {}) => {
    clearToast();
    try {
      const response = await fetch('/api/admin/passes/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, registrationIds, resendExisting }),
      });
      const data = await response.json();
      if (!response.ok)
        return showToast(
          data.error || 'Unable to queue QR email job.',
          'danger'
        );
      if (data.job?.id) {
        void qrSend.start(data.job);
      } else {
        showToast(data.message || 'QR email job queued.', 'success');
      }
      invalidateAdminCaches(registrationIds);
      void loadRegistrations({ background: true, force: true });
      if (activeRegistrationId) {
        void loadDetail(activeRegistrationId, {
          force: true,
          background: true,
        });
      }
    } catch {
      showToast('Network error while queueing QR email job.', 'danger');
    }
  };

  const bulkUpdateStatus = async (nextStatus) => {
    const registrationsToUpdate = state.registrations.filter(
      (registration) =>
        selectedIds.includes(registration.id) &&
        registration.status !== nextStatus
    );
    if (!registrationsToUpdate.length)
      return showToast(`Selected people are already ${nextStatus}.`, 'warning');
    const skippedCount = selectedIds.length - registrationsToUpdate.length;
    if (
      !window.confirm(
        `Change ${registrationsToUpdate.length} selected registration${registrationsToUpdate.length === 1 ? '' : 's'} to ${nextStatus}?\n\nStatus emails will be queued for those people. ${skippedCount} already have this status and will be skipped.`
      )
    )
      return;
    const bulkKey =
      nextStatus === 'confirmed'
        ? 'confirm'
        : nextStatus === 'waitlisted'
          ? 'waitlist'
          : 'reject';
    setPendingBulk((p) => ({ ...p, [bulkKey]: true }));
    try {
      const response = await fetch('/api/admin/registrations/status/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          updates: registrationsToUpdate.map((registration) => ({
            registrationId: registration.id,
            expectedUpdatedAt: registration.updated_at || '',
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok && response.status !== 207)
        throw new Error(data.error || 'Unable to update registrations.');
      const updatedCount = data.updatedIds?.length || 0;
      const conflictCount = data.conflictIds?.length || 0;
      showToast(
        data.emailResult?.notRequired
          ? `Updated ${updatedCount} registrations; no status emails needed.`
          : !data.emailResult?.queued && updatedCount
            ? `Updated ${updatedCount} registrants, but emails were not queued. Check delivery jobs.`
            : conflictCount
              ? `Updated ${updatedCount}; ${conflictCount} changed elsewhere and need refresh.`
              : `Updated ${updatedCount} registrants to ${nextStatus}.`,
        conflictCount ||
          (!data.emailResult?.queued &&
            !data.emailResult?.notRequired &&
            updatedCount)
          ? 'warning'
          : 'success'
      );
      invalidateAdminCaches(selectedIds);
      applySavedRegistrations(data.registrations || []);
      void loadRegistrations({ background: true, force: true });
      if (activeRegistrationId) {
        void loadDetail(activeRegistrationId, {
          force: true,
          background: true,
        });
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Network error during bulk status update.',
        'danger'
      );
    } finally {
      setPendingBulk((p) => ({ ...p, [bulkKey]: false }));
    }
  };

  const handleSendQr = async () => {
    const target = summarizeQrSelection(selectedIds, state.registrations);
    if (!target.registrationIds.length)
      return showToast(
        'Select confirmed registrants to send QR emails.',
        'warning'
      );
    if (
      !window.confirm(
        `Send QR emails to ${target.registrationIds.length} selected people?\n\n${target.firstSendCount} first sends. ${target.repeatCount} already have a pass and will receive another email. ${target.ineligibleCount} ineligible people will be skipped.`
      )
    )
      return;
    setQrLoading(true);
    await queueQrJob({
      registrationIds: target.registrationIds,
      resendExisting: target.repeatCount > 0,
    });
    setQrLoading(false);
    // Clear the selection so the same people cannot be sent twice by a
    // second tap while this send is running.
    setSelectedIds([]);
  };

  const handleQuickAction = async (registration, actionKey) => {
    const pendingKey = `${registration.id}:${actionKey}`;
    setPendingActions((current) => new Set([...current, pendingKey]));
    try {
      if (actionKey === 'sendQr') {
        if (registration.status !== 'confirmed')
          throw new Error(
            'Confirm this registration before sending a QR pass.'
          );
        if (
          !window.confirm(
            registration.qr_pass_issued_at
              ? `Send another QR email to ${registration.first_name} ${registration.last_name}? This person already has an issued pass.`
              : `Send a QR email to ${registration.first_name} ${registration.last_name}?`
          )
        )
          return;
        await queueQrJob({
          registrationIds: [registration.id],
          resendExisting: Boolean(registration.qr_pass_issued_at),
        });
        return;
      }
      let statusResult;
      if (actionKey === 'confirm')
        statusResult = await updateRegistrationStatus({
          registrationId: registration.id,
          status: 'confirmed',
          expectedUpdatedAt: registration.updated_at || '',
        });
      if (actionKey === 'waitlist')
        statusResult = await updateRegistrationStatus({
          registrationId: registration.id,
          status: 'waitlisted',
          expectedUpdatedAt: registration.updated_at || '',
        });
      if (actionKey === 'reject')
        statusResult = await updateRegistrationStatus({
          registrationId: registration.id,
          status: 'rejected',
          expectedUpdatedAt: registration.updated_at || '',
        });
      showToast(
        statusResult?.emailResult?.notRequired
          ? `Review saved for ${registration.first_name} ${registration.last_name}; no status email needed.`
          : statusResult?.emailResult?.queued
            ? `${actionKey} completed for ${registration.first_name} ${registration.last_name}; email queued.`
            : `${actionKey} saved for ${registration.first_name} ${registration.last_name}, but email was not queued. Check delivery jobs.`,
        statusResult?.emailResult?.queued ||
          statusResult?.emailResult?.notRequired
          ? 'success'
          : 'warning'
      );
      invalidateAdminCaches([registration.id]);
      applySavedRegistrations([statusResult.registration]);
      void loadRegistrations({ background: true, force: true });
      if (activeRegistrationId === registration.id)
        void loadDetail(registration.id, { force: true, background: true });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Unable to complete the quick action.',
        'danger'
      );
    } finally {
      setPendingActions((current) => {
        const next = new Set(current);
        next.delete(pendingKey);
        return next;
      });
    }
  };

  const saveDetailStatus = async () => {
    const registrationId = detailState.data?.registration?.id;
    if (!registrationId) return;
    setSavingDetail(true);
    try {
      const data = await updateRegistrationStatus({
        registrationId,
        status: detailDraft.status,
        speakerFlag: detailDraft.speakerFlag,
        vipFlag: detailDraft.vipFlag,
        reviewNotes: detailDraft.reviewNotes,
        expectedUpdatedAt: detailState.data?.registration?.updated_at || '',
      });
      showToast(
        data.emailResult?.notRequired
          ? 'Review saved; no status email needed.'
          : data.emailResult?.queued
            ? 'Notes saved; email queued for delivery.'
            : 'Review saved, but email was not queued. Check delivery jobs.',
        data.emailResult?.queued || data.emailResult?.notRequired
          ? 'success'
          : 'warning'
      );
      invalidateAdminCaches([registrationId]);
      applySavedRegistrations([data.registration]);
      void loadRegistrations({ background: true, force: true });
      void loadDetail(registrationId, { force: true, background: true });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Unable to save registration review.',
        'danger'
      );
    } finally {
      setSavingDetail(false);
    }
  };

  const resendDetailEmail = async () => {
    const registrationId = detailState.data?.registration?.id;
    if (!registrationId) return;
    try {
      const templateType = detailState.data.registration.qr_pass_issued_at
        ? 'qr_pass_issued'
        : detailDraft.status;
      const response = await fetch('/api/admin/registrations/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId, templateType }),
      });
      const data = await response.json();
      if (!response.ok)
        return showToast(
          data.error || 'Unable to resend attendee email.',
          'danger'
        );
      showToast(
        data.result?.queued
          ? 'QR resend queued in the background.'
          : data.result?.sent
            ? 'Attendee email resent.'
            : 'Attendee email action completed.',
        'success'
      );
      invalidateAdminCaches([registrationId]);
      void loadDetail(registrationId, { force: true, background: true });
    } catch {
      showToast('Network error while resending attendee email.', 'danger');
    }
  };

  const handleDelete = async () => {
    const registrationId = detailState.data?.registration?.id;
    if (!registrationId) return;
    if (!window.confirm('Delete this registration? This cannot be undone.'))
      return;
    try {
      const response = await fetch(
        `/api/admin/registrations/${registrationId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok)
        return showToast(
          data.error || 'Unable to delete registration.',
          'danger'
        );
      setDrawerOpen(false);
      setActiveRegistrationId('');
      showToast('Registration deleted.', 'success');
      invalidateAdminCaches([registrationId]);
      void loadRegistrations({ force: true });
    } catch {
      showToast('Network error while deleting registration.', 'danger');
    }
  };

  const allVisibleSelected =
    orderedRegistrations.length > 0 &&
    orderedRegistrations.every((r) => selectedSet.has(r.id));

  // Cells call the latest handlers through stable wrappers, so the context
  // value only changes when selection, pending actions or loading change.
  const gridHandlersRef = useRef({});
  useEffect(() => {
    gridHandlersRef.current = {
      openDrawerFor,
      handleQuickAction,
      toggleVisibleSelection,
    };
  });
  const stableOpenDrawerFor = useCallback(
    (registrationId) => gridHandlersRef.current.openDrawerFor(registrationId),
    []
  );
  const stableHandleQuickAction = useCallback(
    (registration, actionKey) =>
      gridHandlersRef.current.handleQuickAction(registration, actionKey),
    []
  );
  const stableToggleVisibleSelection = useCallback(
    () => gridHandlersRef.current.toggleVisibleSelection(),
    []
  );
  const gridDisabled = state.loading || hasConfigError;
  const gridCtxValue = useMemo(
    () => ({
      selectedSet,
      toggleSelection,
      toggleVisibleSelection: stableToggleVisibleSelection,
      allVisibleSelected,
      openDrawerFor: stableOpenDrawerFor,
      handleQuickAction: stableHandleQuickAction,
      pendingActions,
      disabled: gridDisabled,
    }),
    [
      selectedSet,
      toggleSelection,
      stableToggleVisibleSelection,
      allVisibleSelected,
      stableOpenDrawerFor,
      stableHandleQuickAction,
      pendingActions,
      gridDisabled,
    ]
  );
  // Skeleton rows only on a first load; reloads keep the grid in place.
  const showGridSkeleton = state.loading && orderedRegistrations.length === 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <AdminPageIntro
        description="Review registrations in date order, act inline, and open richer registrant detail from the review drawer."
        actions={
          <div className="flex flex-wrap gap-2">
            {(operator?.role === 'admin' ? ['csv', 'xlsx'] : []).map(
              (format) => (
                <button
                  key={format}
                  type="button"
                  disabled={exportLoading[format] || hasConfigError}
                  onClick={() => handleExport(format)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:border-white/10 dark:hover:bg-white/10"
                >
                  {exportLoading[format] ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  {format === 'csv' ? 'Export CSV' : 'Export Excel'}
                </button>
              )
            )}
          </div>
        }
      />
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        CSV and Excel include all registrations, regardless of selection or
        filters.
      </p>
      {hasConfigError ? (
        <AdminAlert
          title="Supabase Configuration Required"
          description="This dashboard cannot load registrants or issue QR passes until NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are configured."
          tone="danger"
        />
      ) : null}

      {/* Summary stats */}
      <ReviewSummary summary={state.summary} />

      {/* Filters */}
      <section className="rounded-[10px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Filters
          </p>
          <div className="flex gap-3 text-xs text-zinc-400 dark:text-zinc-500">
            <span>{selectionSummary.selectedLabel}</span>
            <span>{selectionSummary.matchedLabel}</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <input
            value={filters.search}
            onChange={(event) => setFilterValue('search', event.target.value)}
            className="h-9 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 xl:col-span-2 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
            placeholder="Search name, email, code, org…"
          />
          <select
            value={filters.status}
            onChange={(event) => setFilterValue('status', event.target.value)}
            className="h-9 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={filters.category}
            onChange={(event) => setFilterValue('category', event.target.value)}
            className="h-9 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
          >
            <option value="all">All categories</option>
            {ATTENDEE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            value={filters.city}
            onChange={(event) => setFilterValue('city', event.target.value)}
            className="h-9 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
            placeholder="Filter by city"
          />
          <button
            type="button"
            onClick={toggleVisibleSelection}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 transition hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:border-white/10"
          >
            {allVisibleSelected ? 'Clear Visible' : 'Select Visible'}
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <select
            value={filters.speakerFlag}
            onChange={(event) =>
              setFilterValue('speakerFlag', event.target.value)
            }
            aria-label="Filter by speaker"
            className="h-9 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
          >
            <option value="">All registrants</option>
            <option value="yes">Speakers only</option>
          </select>
          <input
            value={filters.country}
            onChange={(event) => setFilterValue('country', event.target.value)}
            className="h-9 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
            placeholder="Filter by country"
          />
          <input
            value={filters.organization}
            onChange={(event) =>
              setFilterValue('organization', event.target.value)
            }
            className="h-9 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
            placeholder="Filter by organization"
          />
        </div>
      </section>

      {/* Error state */}
      {state.error && !hasConfigError ? (
        <AdminAlert
          title="Dashboard Error"
          description={state.error}
          tone="danger"
        />
      ) : null}

      {/* Review queue table */}
      <section className="overflow-hidden rounded-[10px] border border-zinc-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-white/[0.06]">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Registrations
            {!state.loading && state.count > 0 ? (
              <span className="ml-2 text-xs font-normal text-zinc-400 dark:text-zinc-500">
                {state.count} registrants
              </span>
            ) : null}
            {state.loading && !showGridSkeleton ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-zinc-400 dark:text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating
              </span>
            ) : null}
          </p>
        </div>
        <RegistrationGridCtx.Provider value={gridCtxValue}>
          {showGridSkeleton ? (
            <div className="overflow-auto">
              <table className="min-w-full">
                <tbody>
                  <LoadingRows count={8} cols={8} />
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="admin-grid-navy ln-grid"
              style={{ height: '560px' }}
            >
              <RegistrationGrid columns={gridColumns} rowSource={ds} />
            </div>
          )}
        </RegistrationGridCtx.Provider>
        {!state.loading && !state.error && orderedRegistrations.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No registrations match the current filters.
          </div>
        ) : null}
        {state.pagination ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-3 dark:border-white/[0.06]">
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Page {state.pagination.page} of {state.pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  setFilters((current) => ({
                    ...current,
                    page: Math.max(current.page - 1, 1),
                  }));
                }}
                disabled={state.pagination.page <= 1}
                className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  setFilters((current) => ({
                    ...current,
                    page: Math.min(
                      current.page + 1,
                      state.pagination.totalPages
                    ),
                  }));
                }}
                disabled={state.pagination.page >= state.pagination.totalPages}
                className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Registrant detail drawer */}
      <RegistrantDrawer
        activeRegistrationId={activeRegistrationId}
        previewRegistration={state.registrations.find(
          (registration) => registration.id === activeRegistrationId
        )}
        detailState={detailState}
        detailDraft={detailDraft}
        setDetailDraft={setDetailDraft}
        saveDetailStatus={saveDetailStatus}
        resendDetailEmail={resendDetailEmail}
        savingDetail={savingDetail}
        onDelete={handleDelete}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <QrSendProgressCard
        run={qrSend.run}
        onDismiss={qrSend.dismiss}
        lifted={selectedIds.length > 1}
      />

      {/* Sticky bulk actions bar */}
      {selectedIds.length > 1 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:left-[248px] dark:border-white/[0.06] dark:bg-zinc-950/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {selectedIds.length} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <QuickActionButton
                action={{
                  key: 'confirm',
                  label: 'Confirm selected',
                  kind: 'success',
                }}
                onClick={() => bulkUpdateStatus('confirmed')}
                loading={pendingBulk.confirm}
              />
              <QuickActionButton
                action={{
                  key: 'waitlist',
                  label: 'Waitlist selected',
                  kind: 'warning',
                }}
                onClick={() => bulkUpdateStatus('waitlisted')}
                loading={pendingBulk.waitlist}
              />
              <QuickActionButton
                action={{
                  key: 'reject',
                  label: 'Reject selected',
                  kind: 'danger',
                }}
                onClick={() => bulkUpdateStatus('rejected')}
                loading={pendingBulk.reject}
              />
              <QuickActionButton
                action={{
                  key: 'sendQr',
                  label: 'Send QR to selected',
                  kind: 'info',
                }}
                onClick={handleSendQr}
                loading={qrLoading}
                disabled={
                  state.loading ||
                  hasConfigError ||
                  Boolean(qrSend.run?.running) ||
                  !summarizeQrSelection(selectedIds, state.registrations)
                    .registrationIds.length
                }
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="ml-auto text-xs text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
