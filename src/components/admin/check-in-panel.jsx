'use client';

import { Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import scanSessionUtils from '@/lib/check-in-scan-session.cjs';
import checkInUtils from '@/lib/check-in-panel-utils.cjs';
import checkInDayUtils from '@/lib/check-in-day-utils.cjs';
import { AdminStatCard, AdminStatusBadge } from '@/components/admin/admin-ui';
import AdminPageIntro from '@/components/admin/admin-page-intro';
import { downloadAdminFile } from '@/lib/admin-download';

const {
  classifyCameraStartFailure,
  getCameraStateMessage,
  isCheckInConfigError,
  getCheckInFeedbackTone,
  shouldRetryCameraRequest,
} = checkInUtils;
const { createScanSession } = scanSessionUtils;

// QR codes decode reliably at this width and it keeps per-frame work small.
const MAX_DECODE_WIDTH = 640;

// Uses the browser's native QR detector when it has one; otherwise loads jsQR
// only once the camera starts, so the check-in page bundle stays small.
async function createQrDecoder() {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats?.();
      if (!formats || formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (canvas) => {
          const [code] = await detector.detect(canvas);
          return code?.rawValue || '';
        };
      }
    } catch {
      // Fall back to jsQR below.
    }
  }

  const { default: jsQR } = await import('jsqr');
  return async (canvas, ctx) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(imageData.data, canvas.width, canvas.height)?.data || '';
  };
}
const {
  CHECK_IN_DAYS,
  getCheckInDayShortLabel,
  getDefaultCheckInDay,
  isCheckedInForDay,
} = checkInDayUtils;

function ResultCard({ title, description, tone = 'default' }) {
  const toneMap = {
    default:
      'border-zinc-200 bg-white text-zinc-700 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-zinc-200',
    success:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
    danger:
      'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
    warning:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
  };

  return (
    <div className={`rounded-[10px] border p-4 ${toneMap[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed opacity-90">{description}</p>
    </div>
  );
}

function formatDate(value) {
  if (!value) {
    return 'Not yet';
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function CheckInPanel({ canExport = false }) {
  const [deskLabel, setDeskLabel] = useState('Main Desk');
  const [selectedEventDay, setSelectedEventDay] = useState(() =>
    getDefaultCheckInDay()
  );
  const [query, setQuery] = useState('');
  const [lookupResults, setLookupResults] = useState([]);
  const [scanMessage, setScanMessage] = useState(null);
  const [cameraState, setCameraState] = useState('idle');
  const [manualToken, setManualToken] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [configWarning, setConfigWarning] = useState('');
  const [recentScans, setRecentScans] = useState([]);
  const [dayStats, setDayStats] = useState(null);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityResults, setActivityResults] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const scanSessionRef = useRef(createScanSession());

  const cameraMessage = useMemo(
    () => getCameraStateMessage(cameraState),
    [cameraState]
  );
  const selectedEventDayLabel = useMemo(
    () => getCheckInDayShortLabel(selectedEventDay),
    [selectedEventDay]
  );
  // Day totals come from the server. The counts from the latest scans on
  // screen are only a fallback until the first response arrives.
  const activityStats = useMemo(() => {
    if (dayStats && dayStats.day === selectedEventDay) {
      return {
        valid: dayStats.checkedIn + dayStats.walkIns,
        checkedIn: dayStats.checkedIn,
        walkIns: dayStats.walkIns,
        duplicates: dayStats.duplicates,
        blocked: dayStats.blocked,
        total: dayStats.totalScans,
      };
    }
    const valid = recentScans.filter(
      (scan) => scan.scan_result === 'valid'
    ).length;
    const duplicates = recentScans.filter(
      (scan) => scan.scan_result === 'already_checked_in'
    ).length;
    const blocked = recentScans.filter(
      (scan) => !['valid', 'already_checked_in'].includes(scan.scan_result)
    ).length;

    return {
      valid,
      checkedIn: valid,
      walkIns: 0,
      duplicates,
      blocked,
      total: recentScans.length,
    };
  }, [dayStats, recentScans, selectedEventDay]);

  async function exportCheckIns(format) {
    setExporting(format);
    setExportError('');
    try {
      await downloadAdminFile(
        `/api/admin/check-in/export?format=${format}`,
        `mash-2026-check-ins.${format}`
      );
    } catch (error) {
      setExportError(error.message);
    } finally {
      setExporting('');
    }
  }

  const stopCamera = useCallback((nextState = 'idle') => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState(nextState);
  }, []);

  const completeCheckIn = useCallback(
    async (payload) => {
      scanSessionRef.current.markSubmitting();
      setScanSubmitting(true);

      try {
        const response = await fetch('/api/check-in/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deskLabel,
            eventDay: selectedEventDay,
            ...payload,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          const errorMessage = data.error || 'Unable to complete check-in.';
          setScanMessage({
            tone: 'danger',
            title: isCheckInConfigError(errorMessage)
              ? 'Supabase Admin Configuration Required'
              : 'Check-in failed',
            description: isCheckInConfigError(errorMessage)
              ? 'Check-in tools need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the deployment environment before scans and lookups can reach registrant data.'
              : errorMessage,
          });
          return;
        }

        setRecentScans(data.recentScans || []);
        if (data.stats) {
          setDayStats({ ...data.stats, day: selectedEventDay });
        }
        setScanMessage({
          tone: getCheckInFeedbackTone(data.result),
          title:
            data.result === 'valid'
              ? `Attendee approved for ${selectedEventDayLabel}`
              : data.result === 'already_checked_in'
                ? `Already checked in for ${selectedEventDayLabel}`
                : data.result === 'waitlisted'
                  ? 'Attendee waitlisted'
                  : 'Entry blocked',
          description: `${data.registration.first_name} ${data.registration.last_name} | ${data.registration.organization} | ${data.registration.registration_code}`,
        });
      } catch {
        setScanMessage({
          tone: 'danger',
          title: 'Check-in failed',
          description: 'Network error while validating the attendee.',
        });
      } finally {
        scanSessionRef.current.resetSubmission();
        setScanSubmitting(false);
      }
    },
    [deskLabel, selectedEventDay, selectedEventDayLabel]
  );

  async function startCamera() {
    if (!window.isSecureContext) {
      setCameraState('insecure_or_blocked');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported');
      return;
    }

    stopCamera('requesting');
    scanSessionRef.current = createScanSession();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : '';
      if (shouldRetryCameraRequest(errorName)) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (fallbackError) {
          stopCamera(
            classifyCameraStartFailure({
              isSecureContext: window.isSecureContext,
              errorName:
                fallbackError instanceof DOMException ? fallbackError.name : '',
            })
          );
          return;
        }
      } else {
        stopCamera(
          classifyCameraStartFailure({
            isSecureContext: window.isSecureContext,
            errorName,
          })
        );
        return;
      }
    }

    streamRef.current = stream;
    const video = videoRef.current;
    video.srcObject = stream;
    await video.play();
    setCameraState('active');

    const decode = await createQrDecoder();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let decoding = false;

    // Draw and decode only on the frames the scan session asks for, at a
    // reduced size, so the desk phone is not redrawing full frames at 60fps.
    function scanFrame() {
      const currentVideo = videoRef.current;
      if (
        !currentVideo ||
        currentVideo.readyState < currentVideo.HAVE_ENOUGH_DATA ||
        !currentVideo.videoWidth
      ) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (!decoding && scanSessionRef.current.shouldDecode(Date.now())) {
        const scale = Math.min(1, MAX_DECODE_WIDTH / currentVideo.videoWidth);
        const width = Math.round(currentVideo.videoWidth * scale);
        const height = Math.round(currentVideo.videoHeight * scale);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.drawImage(currentVideo, 0, 0, width, height);
        decoding = true;
        decode(canvas, ctx)
          .then((raw) => {
            decoding = false;
            const token = String(raw || '').trim();
            if (
              token &&
              streamRef.current === stream &&
              scanSessionRef.current.shouldSubmitToken(token, Date.now()) &&
              !scanSessionRef.current.isSubmitting()
            ) {
              stopCamera();
              setManualToken(token);
              void completeCheckIn({ token });
            }
          })
          .catch(() => {
            decoding = false;
          });
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }

  async function lookupAttendee() {
    setLookupLoading(true);

    try {
      const response = await fetch('/api/check-in/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, eventDay: selectedEventDay }),
      });
      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || 'Unable to search attendees.';
        setScanMessage({
          tone: 'danger',
          title: isCheckInConfigError(errorMessage)
            ? 'Supabase Admin Configuration Required'
            : 'Lookup failed',
          description: isCheckInConfigError(errorMessage)
            ? 'Attendee lookup needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the deployment environment before it can load registrants.'
            : errorMessage,
        });
        setLookupResults([]);
        return;
      }

      setLookupResults(data.registrations || []);
    } catch {
      setScanMessage({
        tone: 'danger',
        title: 'Lookup failed',
        description: 'Network error while searching attendees.',
      });
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadConfigHealth() {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const supabaseServices = data?.services?.supabase;

        if (!active || !supabaseServices) {
          return;
        }

        if (
          !supabaseServices.urlConfigured ||
          !supabaseServices.serviceRoleConfigured
        ) {
          setConfigWarning(
            'Supabase admin access is not configured in this deployment. Camera scans, attendee lookup, and check-in validation will stay unavailable until NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are added.'
          );
        }
      } catch {
        // Keep the console usable even if health diagnostics are unavailable.
      }
    }

    void loadConfigHealth();

    return () => {
      active = false;
    };
  }, []);

  const fetchScans = useCallback(
    async (search = '') => {
      const params = new URLSearchParams({ eventDay: selectedEventDay });
      if (search) params.set('search', search);
      const response = await fetch(`/api/check-in/recent?${params}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load scans.');
      if (!search && data.stats) {
        setDayStats({ ...data.stats, day: selectedEventDay });
      }
      return data.scans || [];
    },
    [selectedEventDay]
  );

  const refreshActivity = useCallback(async () => {
    const search = activitySearch.trim();
    try {
      const [recent, matches] = await Promise.all([
        fetchScans(),
        search ? fetchScans(search) : Promise.resolve(null),
      ]);
      setRecentScans(recent);
      setActivityResults(matches);
    } catch {
      // Keep refresh action silent when the network is unstable on-site.
    }
  }, [activitySearch, fetchScans]);

  useEffect(() => {
    let active = true;

    const load = () =>
      fetchScans()
        .then((scans) => {
          if (active) setRecentScans(scans);
        })
        .catch(() => {
          // Keep check-in usable even if the recent scans widget cannot load.
        });

    void load();
    // Other desks check people in too: refresh the totals and recent scans
    // every 15 seconds while this tab is visible.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [fetchScans]);

  useEffect(() => {
    const search = activitySearch.trim();
    let active = true;
    const timer = setTimeout(
      () => {
        if (!search) {
          setActivityResults(null);
          setActivityLoading(false);
          return;
        }
        setActivityLoading(true);
        fetchScans(search)
          .then((scans) => {
            if (active) setActivityResults(scans);
          })
          .catch(() => {
            if (active) setActivityResults([]);
          })
          .finally(() => {
            if (active) setActivityLoading(false);
          });
      },
      search ? 300 : 0
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activitySearch, fetchScans]);

  const searchingActivity = Boolean(activitySearch.trim());
  const activityRows = searchingActivity ? activityResults || [] : recentScans;

  useEffect(
    () => () => {
      stopCamera();
    },
    [stopCamera]
  );

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <AdminPageIntro
          description="Scan or look up attendees at the desk. Exports include actual check-ins across both event days, including spot registrations. Each day attended has a row; use email to count unique people."
          actions={
            <div className="flex flex-wrap gap-2">
              {(canExport ? ['csv', 'xlsx'] : []).map((format) => (
                <button
                  key={format}
                  type="button"
                  disabled={Boolean(exporting)}
                  onClick={() => exportCheckIns(format)}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-4 text-sm text-zinc-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200"
                >
                  <Download size={15} />
                  {exporting === format
                    ? 'Preparing…'
                    : format === 'csv'
                      ? 'Export CSV'
                      : 'Export Excel'}
                </button>
              ))}
            </div>
          }
        />
        {exportError ? (
          <ResultCard
            title="Export failed"
            description={exportError}
            tone="danger"
          />
        ) : null}
        <div className="mt-5 flex flex-wrap gap-4">
          <label className="flex min-w-64 flex-col gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Desk Label
            <input
              id="deskLabel"
              name="deskLabel"
              value={deskLabel}
              onChange={(event) => setDeskLabel(event.target.value)}
              className="h-11 rounded-[10px] border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
            />
          </label>
          <fieldset className="flex flex-col gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <legend>Event Day</legend>
            <div className="inline-flex h-11 rounded-[10px] border border-zinc-200 bg-zinc-50 p-1 dark:border-white/10 dark:bg-white/[0.06]">
              {CHECK_IN_DAYS.map((day) => {
                const selected = selectedEventDay === day.value;
                return (
                  <label
                    key={day.value}
                    className={`flex cursor-pointer items-center rounded-[10px] px-4 text-sm transition ${
                      selected
                        ? 'bg-purple-600 text-white'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="eventDay"
                      value={day.value}
                      checked={selected}
                      onChange={() => setSelectedEventDay(day.value)}
                      className="sr-only"
                    />
                    {day.shortLabel}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label="Checked In"
          value={activityStats.valid}
          tone="success"
          detail={`${selectedEventDayLabel}: ${activityStats.checkedIn} with pass, ${activityStats.walkIns} walk-ins`}
        />
        <AdminStatCard
          label="Duplicates"
          value={activityStats.duplicates}
          tone="warning"
          detail={`${selectedEventDayLabel} repeat attempts`}
        />
        <AdminStatCard
          label="Blocked"
          value={activityStats.blocked}
          tone="danger"
          detail={`${selectedEventDayLabel} rejected or waitlisted entries`}
        />
        <AdminStatCard
          label="Total Scans"
          value={activityStats.total}
          tone="info"
          detail={`${selectedEventDayLabel} scans at all desks`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        {configWarning ? (
          <div className="xl:col-span-2">
            <ResultCard
              title="Supabase Admin Configuration Required"
              description={configWarning}
              tone="danger"
            />
          </div>
        ) : null}
        <div className="rounded-[10px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-600">
            Scanner Frame
          </p>
          <div className="mt-4 overflow-hidden rounded-[10px] border border-zinc-200 bg-zinc-950 dark:border-white/[0.06]">
            <video
              ref={videoRef}
              className="aspect-video w-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startCamera}
              className="h-11 rounded-full bg-purple-600 px-5 text-sm font-medium text-white transition hover:bg-purple-700"
            >
              {cameraState === 'active'
                ? 'Restart Camera Scan'
                : 'Start Camera Scan'}
            </button>
            <button
              type="button"
              onClick={() => stopCamera()}
              className="h-11 rounded-full border border-zinc-200 bg-white px-5 text-sm text-zinc-700 transition hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:border-white/10"
            >
              Stop Camera
            </button>
          </div>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            {cameraMessage}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              id="manualToken"
              name="manualToken"
              value={manualToken}
              onChange={(event) => setManualToken(event.target.value)}
              placeholder="Paste QR token manually"
              className="h-11 flex-1 rounded-[10px] border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => completeCheckIn({ token: manualToken })}
              disabled={!manualToken.trim() || scanSubmitting}
              className="h-11 rounded-full border border-zinc-200 bg-white px-5 text-sm text-zinc-700 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:border-white/10"
            >
              {scanSubmitting ? 'Validating...' : 'Validate Token'}
            </button>
          </div>
        </div>

        <div className="rounded-[10px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-600">
            Manual Lookup
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              id="lookupQuery"
              name="lookupQuery"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, or registration ID"
              className="h-11 flex-1 rounded-[10px] border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={lookupAttendee}
              disabled={!query.trim() || lookupLoading}
              className="h-11 rounded-full bg-purple-600 px-5 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {lookupLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {lookupResults.map((registration) => {
              const checkedInForSelectedDay = isCheckedInForDay(
                registration,
                selectedEventDay
              );
              return (
                <div
                  key={registration.id}
                  className="rounded-[10px] border border-zinc-200 bg-zinc-50 p-4 dark:border-white/[0.06] dark:bg-white/[0.04]"
                >
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {registration.first_name} {registration.last_name}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {registration.organization} |{' '}
                    {registration.registration_code}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <AdminStatusBadge
                      tone={
                        registration.status === 'confirmed'
                          ? 'success'
                          : registration.status === 'pending'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {registration.status}
                    </AdminStatusBadge>
                    {checkedInForSelectedDay ? (
                      <AdminStatusBadge tone="warning">
                        checked in {selectedEventDayLabel}
                      </AdminStatusBadge>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      completeCheckIn({ registrationId: registration.id })
                    }
                    disabled={scanSubmitting}
                    className="mt-3 h-10 rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-700 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:border-white/10"
                  >
                    Check In For {selectedEventDayLabel}
                  </button>
                </div>
              );
            })}
            {!lookupLoading && !lookupResults.length ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Search results will appear here for manual fallback check-in.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[10px] border border-zinc-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-600">
              Recent Activity
            </p>
            <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {searchingActivity ? 'Matching scans' : 'Last validated scans'}
              <span className="ml-2 text-xs font-normal text-zinc-400 dark:text-zinc-500">
                {activityLoading
                  ? 'Searching…'
                  : `${activityRows.length} ${activityRows.length === 1 ? 'scan' : 'scans'} · ${selectedEventDayLabel}`}
              </span>
            </h2>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              type="search"
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 sm:w-72 sm:flex-none dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100"
              placeholder="Search checked-in name or code…"
              aria-label="Search scans by attendee name or registration code"
            />
            <button
              type="button"
              onClick={() => {
                void refreshActivity();
              }}
              className="h-10 rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-700 transition hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:border-white/10"
            >
              Refresh Activity
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400">
              <tr>
                {['Attendee', 'Result', 'Desk', 'Day', 'Scanned at'].map(
                  (label) => (
                    <th key={label} className="px-5 py-3 font-semibold">
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {activityRows.map((scan) => (
                <tr
                  key={scan.id}
                  className="border-t border-zinc-100 transition hover:bg-zinc-50/70 dark:border-white/[0.06] dark:hover:bg-white/[0.03]"
                >
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {scan.registration?.first_name}{' '}
                      {scan.registration?.last_name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {scan.registration?.registration_code}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {scan.registration?.organization || 'Independent'}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <AdminStatusBadge
                      tone={getCheckInFeedbackTone(scan.scan_result)}
                    >
                      {scan.scan_result.replaceAll('_', ' ')}
                    </AdminStatusBadge>
                  </td>
                  <td className="px-5 py-3 text-zinc-700 dark:text-zinc-200">
                    {scan.desk_label || 'Desk not set'}
                  </td>
                  <td className="px-5 py-3 text-zinc-700 dark:text-zinc-200">
                    {getCheckInDayShortLabel(scan.event_day)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatDate(scan.created_at)}
                  </td>
                </tr>
              ))}
              {!activityRows.length && !activityLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-zinc-400 dark:text-zinc-500"
                  >
                    {searchingActivity
                      ? `No ${selectedEventDayLabel} scans match "${activitySearch.trim()}". Walk-ins are listed on the Spot Registrations page.`
                      : 'Recent scan activity will appear here after the first successful validation.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {scanMessage ? (
        <ResultCard
          title={scanMessage.title}
          description={scanMessage.description}
          tone={scanMessage.tone}
        />
      ) : null}
    </div>
  );
}
