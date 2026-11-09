'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdminAlert,
  AdminStatusBadge,
  LoadingRows,
} from '@/components/admin/admin-ui';
import { ChevronRight } from 'lucide-react';
import AdminPageIntro from '@/components/admin/admin-page-intro';
import AdminPagination from '@/components/admin/admin-pagination';
import pagination from '@/lib/admin-pagination.cjs';
import jobView from '@/lib/admin-job-view.cjs';

const {
  coverageSummary,
  groupJobsByDay,
  itemFilterOptions,
  jobDuration,
  summarizeJobs,
  itemMatchesFilter,
  itemTone,
  jobCounts,
  jobStatusLabel,
  jobTone,
} = jobView;
const { totalPagesFor } = pagination;

function formatDate(value) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

// Queue processing runs like the speaker bulk send: one request at a time,
// a few items per request, and a short pause before the next one. Requests
// never overlap, so sends stay steady instead of arriving in bursts.
const PROCESS_CHUNK_SIZE = 5;
// The pause grows while a round changes nothing and resets on progress, so an
// idle or stuck queue is not polled several times a second.
const PROCESS_GAP_MS = 1500;
const PROCESS_MAX_GAP_MS = 10_000;
const PROCESS_GAP_GROWTH = 1.6;
// Stop looping when a job reports no progress for this long.
const PROCESS_STALL_MS = 2 * 60 * 1000;

function jobProgressFingerprint(job) {
  if (!job) return 'none';
  return [
    job.id,
    job.status,
    job.sent_items,
    job.failed_items,
    job.skipped_items,
    job.retrying_items,
  ].join(':');
}

function waitForVisiblePage() {
  if (typeof document === 'undefined' || !document.hidden) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onChange);
      resolve();
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat('en-IN', {
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

// Time of day in IST; rows sit under a day heading, so no date is needed.
function formatClock(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

const TONE_COLORS = {
  success: 'var(--adm-ok)',
  warning: 'var(--adm-warn)',
  danger: 'var(--adm-bad)',
  default: 'var(--adm-ink-3)',
};

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

function pillButtonStyle(tone = 'default') {
  const danger = tone === 'danger';
  return {
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    border: `1px solid ${danger ? 'var(--adm-bad)' : 'var(--adm-line-strong)'}`,
    background: danger ? 'var(--adm-bad-soft)' : 'var(--adm-panel)',
    color: danger ? 'var(--adm-bad)' : 'var(--adm-ink)',
  };
}

function chipStyle(active) {
  return {
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${active ? 'var(--adm-ink)' : 'var(--adm-line-strong)'}`,
    background: active ? 'var(--adm-ink)' : 'var(--adm-panel)',
    color: active ? 'var(--adm-accent-ink)' : 'var(--adm-ink-2)',
  };
}

function ProgressBar({ percent, tone }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{
        height: 6,
        borderRadius: 999,
        background: 'var(--adm-line-strong)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 999,
          background: TONE_COLORS[tone] || TONE_COLORS.default,
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}

/**
 * Generic admin job-queue panel.
 *
 * Renders the shared job list → job detail → process/retry workflow used by
 * both the confirmation-email queue and the QR pass delivery queue. All
 * endpoint URLs, labels, accent styling, and panel-specific rendering are
 * provided through the `config` prop so each queue stays a thin wrapper.
 */
export default function JobManagerPanel({ config }) {
  const {
    endpoints, // { list, detail(jobId), process, retry(jobId) }
    messages, // { loadJobs, networkLoadJobs, loadDetail, networkLoadDetail, process, retry }
    intro,
    alertTitle,
    statCards, // [{ key: 'queued'|'processing'|'sent'|'failed', label, tone, detail }]
    listHeader, // { eyebrow, description }
    accent, // { eyebrow, processButton, rowProcessButton, selectedRow, progressBar }
    renderJobTitle, // (job, detailItems?) => ReactNode
    renderJobSubtitle, // (job) => ReactNode
    renderJobTag, // optional (job) => string shown after the title, e.g. the email type
    emptyState, // (state) => string
    detail, // { eyebrow, stats: [{ label, field }], emptyHint }
    trackQueueUnavailable = false,
    queueUnavailableAlert, // { title, description } when trackQueueUnavailable
    coverageLabel = 'Coverage', // heading for the coverage block, when the list API returns one
    paginationLabel = 'sends', // what the pager counts, e.g. "Showing 1–15 of 40 sends"
  } = config;

  const [jobsState, setJobsState] = useState({
    loading: true,
    jobs: [],
    selectedJobId: '',
    selectedDetail: null,
    error: '',
    queueUnavailable: false,
    coverage: null,
    summary: null,
    total: 0,
    pageSize: 15,
  });
  const [page, setPage] = useState(1);
  // The processing loop and refreshes read the page from here, so they keep
  // loading the page on screen without restarting.
  const pageRef = useRef(1);
  const goToPage = (nextPage) => {
    pageRef.current = nextPage;
    setItemFilter('all');
    setJobsState((current) => ({
      ...current,
      loading: true,
      selectedJobId: '',
    }));
    setPage(nextPage);
  };
  const [itemFilter, setItemFilter] = useState('all');

  // One job open at a time; clicking the open job closes it.
  const toggleJob = (jobId) => {
    setItemFilter('all');
    setJobsState((current) => ({
      ...current,
      selectedJobId: current.selectedJobId === jobId ? '' : jobId,
    }));
  };

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch(
        `${endpoints.list}?page=${pageRef.current}`,
        {
          cache: 'no-store',
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setJobsState((current) => ({
          ...current,
          loading: false,
          error: data.error || messages.loadJobs,
        }));
        return;
      }

      setJobsState((current) => ({
        ...current,
        loading: false,
        jobs: data.jobs || [],
        coverage: data.coverage || null,
        summary: data.summary || null,
        total: Number(data.total ?? (data.jobs || []).length),
        pageSize: Number(data.pageSize || (data.jobs || []).length || 15),
        selectedJobId: current.selectedJobId,
        ...(trackQueueUnavailable
          ? { queueUnavailable: Boolean(data.queueUnavailable) }
          : {}),
        error: '',
      }));
    } catch {
      setJobsState((current) => ({
        ...current,
        loading: false,
        error: messages.networkLoadJobs,
      }));
    }
  }, [endpoints.list, messages, trackQueueUnavailable]);

  const loadJobDetail = useCallback(
    async (jobId) => {
      if (!jobId) {
        setJobsState((current) => ({ ...current, selectedDetail: null }));
        return;
      }

      try {
        const response = await fetch(endpoints.detail(jobId), {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) {
          setJobsState((current) => ({
            ...current,
            error: data.error || messages.loadDetail,
          }));
          return;
        }

        setJobsState((current) => ({
          ...current,
          selectedDetail: { job: data.job, items: data.items || [] },
          error: '',
        }));
      } catch {
        setJobsState((current) => ({
          ...current,
          error: messages.networkLoadDetail,
        }));
      }
    },
    [endpoints, messages]
  );

  useEffect(() => {
    let active = true;

    async function hydrateJobs() {
      try {
        const response = await fetch(
          `${endpoints.list}?page=${pageRef.current}`,
          {
            cache: 'no-store',
          }
        );
        const data = await response.json();
        if (!active) return;

        if (!response.ok) {
          setJobsState((current) => ({
            ...current,
            loading: false,
            error: data.error || 'Unable to load jobs.',
          }));
          return;
        }

        setJobsState((current) => ({
          ...current,
          loading: false,
          jobs: data.jobs || [],
          coverage: data.coverage || null,
          summary: data.summary || null,
          total: Number(data.total ?? (data.jobs || []).length),
          pageSize: Number(data.pageSize || (data.jobs || []).length || 15),
          selectedJobId: current.selectedJobId,
          ...(trackQueueUnavailable
            ? { queueUnavailable: Boolean(data.queueUnavailable) }
            : {}),
          error: '',
        }));
      } catch {
        if (active) {
          setJobsState((current) => ({
            ...current,
            loading: false,
            error: 'Network error while loading jobs.',
          }));
        }
      }
    }

    void hydrateJobs();
    return () => {
      active = false;
    };
  }, [endpoints.list, trackQueueUnavailable, page]);

  useEffect(() => {
    if (!jobsState.selectedJobId) return undefined;
    let active = true;

    async function hydrateJobDetail() {
      try {
        const response = await fetch(
          endpoints.detail(jobsState.selectedJobId),
          { cache: 'no-store' }
        );
        const data = await response.json();
        if (!active) return;

        if (!response.ok) {
          setJobsState((current) => ({
            ...current,
            error: data.error || 'Unable to load job detail.',
          }));
          return;
        }

        setJobsState((current) => ({
          ...current,
          selectedDetail: { job: data.job, items: data.items || [] },
          error: '',
        }));
      } catch {
        if (active) {
          setJobsState((current) => ({
            ...current,
            error: 'Network error while loading job detail.',
          }));
        }
      }
    }

    void hydrateJobDetail();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsState.selectedJobId]);

  const hasActiveJobs = useMemo(() => {
    const summary = jobsState.summary;
    if (summary && summary.queued + summary.processing > 0) return true;
    return jobsState.jobs.some((job) =>
      ['queued', 'processing'].includes(job.status)
    );
  }, [jobsState.jobs, jobsState.summary]);

  // Latest refresh callbacks for the processing loop, which outlives renders.
  const refreshRef = useRef({ loadJobs, loadJobDetail, selectedJobId: '' });
  useEffect(() => {
    refreshRef.current = {
      loadJobs,
      loadJobDetail,
      selectedJobId: jobsState.selectedJobId,
    };
  }, [jobsState.selectedJobId, loadJobDetail, loadJobs]);

  // True while a process request is in flight, shared across loop restarts
  // so two requests are never sent at once.
  const processingRef = useRef(false);
  // Set when the loop gave up on a job that stopped moving; a manual process
  // or retry clears it and restarts the loop.
  const [processingStalled, setProcessingStalled] = useState(false);

  useEffect(() => {
    if (!hasActiveJobs || processingStalled) return undefined;
    let cancelled = false;

    const run = async () => {
      let gapMs = PROCESS_GAP_MS;
      let lastFingerprint = '';
      let lastProgressAt = Date.now();

      while (!cancelled) {
        await waitForVisiblePage();
        if (cancelled) break;

        let fingerprint = lastFingerprint;
        if (!processingRef.current) {
          processingRef.current = true;
          try {
            const response = await fetch(endpoints.process, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chunkSize: PROCESS_CHUNK_SIZE }),
            });
            const json = await response.json().catch(() => ({}));
            fingerprint = jobProgressFingerprint(json?.job);
          } catch {
            // The next round retries; the queue keeps the item.
          } finally {
            processingRef.current = false;
          }
        }
        if (cancelled) break;

        const { selectedJobId, ...refresh } = refreshRef.current;
        void refresh.loadJobs();
        if (selectedJobId) void refresh.loadJobDetail(selectedJobId);

        if (fingerprint !== lastFingerprint) {
          lastFingerprint = fingerprint;
          lastProgressAt = Date.now();
          gapMs = PROCESS_GAP_MS;
        } else {
          gapMs = Math.min(gapMs * PROCESS_GAP_GROWTH, PROCESS_MAX_GAP_MS);
          if (Date.now() - lastProgressAt > PROCESS_STALL_MS) {
            setProcessingStalled(true);
            break;
          }
        }

        await new Promise((resolve) => window.setTimeout(resolve, gapMs));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [endpoints.process, hasActiveJobs, processingStalled]);

  const processJob = async (jobId = '') => {
    setProcessingStalled(false);
    try {
      await fetch(endpoints.process, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, chunkSize: PROCESS_CHUNK_SIZE }),
      });
      void loadJobs();
      if (jobId) void loadJobDetail(jobId);
    } catch {
      setJobsState((current) => ({
        ...current,
        error: messages.process,
      }));
    }
  };

  const retryJob = async (jobId) => {
    setProcessingStalled(false);
    try {
      await fetch(endpoints.retry(jobId), { method: 'POST' });
      void loadJobs();
      void loadJobDetail(jobId);
    } catch {
      setJobsState((current) => ({
        ...current,
        error: messages.retry,
      }));
    }
  };

  const metrics = useMemo(
    () => jobsState.summary || summarizeJobs(jobsState.jobs),
    [jobsState.jobs, jobsState.summary]
  );

  // Recipients of the open job, shown under its row.
  const openDetail =
    jobsState.selectedDetail?.job?.id === jobsState.selectedJobId
      ? jobsState.selectedDetail
      : null;
  const openItems = useMemo(() => openDetail?.items || [], [openDetail]);
  const filterOptions = useMemo(
    () => itemFilterOptions(openItems),
    [openItems]
  );
  const activeFilter = filterOptions.some((option) => option.key === itemFilter)
    ? itemFilter
    : 'all';
  const visibleItems = openItems.filter((item) =>
    itemMatchesFilter(item, activeFilter)
  );
  const dayGroups = useMemo(
    () => groupJobsByDay(jobsState.jobs),
    [jobsState.jobs]
  );
  const coverage = coverageSummary(jobsState.coverage);

  return (
    <div className="space-y-5">
      <AdminPageIntro description={intro.description} />

      {jobsState.error ? (
        <AdminAlert
          title={alertTitle}
          description={jobsState.error}
          tone="danger"
        />
      ) : null}
      {processingStalled && hasActiveJobs ? (
        <AdminAlert
          title="Automatic processing paused"
          description="A job has made no progress for two minutes, so this page stopped sending it. The scheduled worker can still pick it up. Retry or process the job to start again."
          tone="warning"
        />
      ) : null}
      {trackQueueUnavailable && jobsState.queueUnavailable ? (
        <AdminAlert
          title={queueUnavailableAlert.title}
          description={queueUnavailableAlert.description}
          tone="warning"
        />
      ) : null}

      {/* Summary strip: overall progress first, then the live counters. */}
      <section
        style={panelStyle}
        className={`grid divide-y md:divide-x md:divide-y-0 ${coverage ? 'md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]' : 'md:grid-cols-4'}`}
      >
        {coverage ? (
          <div className="px-5 py-4" style={dividerStyle}>
            <p style={eyebrowStyle}>{coverageLabel}</p>
            <p
              className="mt-1 text-2xl font-semibold tabular-nums"
              style={{ color: 'var(--adm-ink)' }}
            >
              {coverage.issued}
              <span
                className="text-base font-normal"
                style={{ color: 'var(--adm-ink-3)' }}
              >
                {' '}
                / {coverage.confirmed}
              </span>
            </p>
            <div className="mt-2">
              <ProgressBar
                percent={coverage.percent}
                tone={coverage.remaining ? 'warning' : 'success'}
              />
            </div>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--adm-ink-3)' }}>
              {coverage.remaining
                ? `${coverage.percent}% done · ${coverage.remaining} confirmed delegate${coverage.remaining === 1 ? '' : 's'} still need a pass`
                : 'Every confirmed delegate has a pass'}
            </p>
          </div>
        ) : null}
        {statCards.map((card) => {
          const value = Number(metrics[card.key] || 0);
          const alert = card.key === 'failed' && value > 0;
          return (
            <div key={card.key} className="px-5 py-4" style={dividerStyle}>
              <p style={eyebrowStyle}>{card.label}</p>
              <p
                className="mt-1 text-2xl font-semibold tabular-nums"
                style={{
                  color: alert
                    ? 'var(--adm-bad)'
                    : value
                      ? 'var(--adm-ink)'
                      : 'var(--adm-ink-4)',
                }}
              >
                {value}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--adm-ink-3)' }}>
                {card.detail}
              </p>
            </div>
          );
        })}
      </section>

      <section style={panelStyle} className="overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          style={{ borderBottom: '1px solid var(--adm-line)' }}
        >
          <div>
            <p style={eyebrowStyle}>{listHeader.eyebrow}</p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--adm-ink-3)' }}>
              {listHeader.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void processJob()}
            disabled={!hasActiveJobs}
            style={pillButtonStyle()}
            className="shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Process All
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div
              role="row"
              className={`grid items-center gap-x-4 px-5 py-2 ${JOB_GRID}`}
              style={{
                ...eyebrowStyle,
                background: 'var(--adm-panel-2)',
                borderBottom: '1px solid var(--adm-line)',
              }}
            >
              <span />
              <span>Send</span>
              <span className="text-right">Recipients</span>
              <span className="text-right">Sent</span>
              <span className="text-right">Skipped</span>
              <span className="text-right">Failed</span>
              <span>Progress</span>
              <span>Started</span>
              <span className="text-right">Took</span>
              <span className="text-right">Status</span>
            </div>

            {jobsState.loading ? (
              <table className="min-w-full">
                <tbody>
                  <LoadingRows count={5} cols={6} />
                </tbody>
              </table>
            ) : null}

            {!jobsState.loading
              ? dayGroups.map((group) => (
                  <div key={group.key}>
                    <div
                      className="flex items-baseline gap-3 px-5 py-2"
                      style={{ borderBottom: '1px solid var(--adm-line)' }}
                    >
                      <span
                        className="text-xs font-semibold"
                        style={{ color: 'var(--adm-ink)' }}
                      >
                        {group.label}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--adm-ink-3)' }}
                      >
                        {group.jobs.length} send
                        {group.jobs.length === 1 ? '' : 's'} · {group.sent} sent
                      </span>
                    </div>

                    {group.jobs.map((job) => {
                      const counts = jobCounts(job);
                      const tone = jobTone(job);
                      const open = jobsState.selectedJobId === job.id;
                      const duration = jobDuration(job);
                      return (
                        <div
                          key={job.id}
                          style={{
                            borderBottom: '1px solid var(--adm-line)',
                            background: open
                              ? 'var(--adm-panel-2)'
                              : 'transparent',
                          }}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={open}
                            onClick={() => toggleJob(job.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                toggleJob(job.id);
                              }
                            }}
                            className={`grid cursor-pointer items-center gap-x-4 px-5 py-2.5 hover:bg-[var(--adm-panel-2)] ${JOB_GRID}`}
                          >
                            <ChevronRight
                              size={15}
                              aria-hidden="true"
                              style={{
                                color: 'var(--adm-ink-3)',
                                transform: open ? 'rotate(90deg)' : 'none',
                                transition: 'transform 150ms ease',
                              }}
                            />
                            <p
                              className="truncate text-sm font-medium"
                              style={{ color: 'var(--adm-ink)' }}
                              title={renderJobTitle(job)}
                            >
                              {renderJobTitle(job)}
                              {renderJobTag ? (
                                <span
                                  className="ml-2 text-xs font-normal"
                                  style={{ color: 'var(--adm-ink-3)' }}
                                >
                                  {renderJobTag(job)}
                                </span>
                              ) : null}
                            </p>
                            <NumberCell value={counts.total} strong />
                            <NumberCell value={counts.sent} />
                            <NumberCell value={counts.skipped} />
                            <NumberCell value={counts.failed} tone="danger" />
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <ProgressBar
                                  percent={counts.percent}
                                  tone={tone}
                                />
                              </div>
                              <span
                                className="w-9 text-right text-xs tabular-nums"
                                style={{ color: 'var(--adm-ink-2)' }}
                              >
                                {counts.percent}%
                              </span>
                            </div>
                            <span
                              className="text-xs tabular-nums"
                              style={{ color: 'var(--adm-ink-2)' }}
                            >
                              {formatClock(job.created_at)}
                            </span>
                            <span
                              className="text-right text-xs tabular-nums"
                              style={{ color: 'var(--adm-ink-3)' }}
                            >
                              {duration || (counts.waiting ? 'running' : '–')}
                            </span>
                            <div className="flex items-center justify-end gap-2">
                              {['queued', 'processing'].includes(job.status) ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void processJob(job.id);
                                  }}
                                  style={linkButtonStyle()}
                                >
                                  Process
                                </button>
                              ) : null}
                              {job.failed_items > 0 ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void retryJob(job.id);
                                  }}
                                  style={linkButtonStyle('danger')}
                                >
                                  Retry Failed
                                </button>
                              ) : null}
                              <AdminStatusBadge tone={tone}>
                                {jobStatusLabel(job)}
                              </AdminStatusBadge>
                            </div>
                          </div>

                          {open ? (
                            <RecipientList
                              loading={!openDetail}
                              items={openItems}
                              visibleItems={visibleItems}
                              filterOptions={filterOptions}
                              activeFilter={activeFilter}
                              onFilter={setItemFilter}
                              total={counts.total}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))
              : null}
          </div>
        </div>

        <AdminPagination
          page={page}
          pageSize={jobsState.pageSize}
          total={jobsState.total}
          totalPages={totalPagesFor(jobsState.total, jobsState.pageSize)}
          onPage={goToPage}
          label={paginationLabel}
          disabled={jobsState.loading}
        />

        {!jobsState.loading && !jobsState.jobs.length ? (
          <div
            className="p-8 text-center text-sm"
            style={{ color: 'var(--adm-ink-3)' }}
          >
            {emptyState(jobsState)}
          </div>
        ) : null}
      </section>
    </div>
  );
}

// Send · Recipients · Sent · Skipped · Failed · Progress · Started · Took ·
// Status, shared by the header and every row so the columns line up.
const JOB_GRID =
  'grid-cols-[16px_minmax(0,2.4fr)_76px_56px_60px_56px_minmax(130px,1.2fr)_72px_64px_220px]';

const RECIPIENT_GRID = 'grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_96px_72px]';

const dividerStyle = { borderColor: 'var(--adm-line)' };

function NumberCell({ value, tone, strong = false }) {
  const number = Number(value || 0);
  const alert = tone === 'danger' && number > 0;
  return (
    <span
      className={`text-right text-sm tabular-nums ${alert || strong ? 'font-semibold' : ''}`}
      style={{
        color: alert
          ? 'var(--adm-bad)'
          : number
            ? 'var(--adm-ink)'
            : 'var(--adm-ink-4)',
      }}
    >
      {number || '–'}
    </span>
  );
}

function linkButtonStyle(tone = 'default') {
  const danger = tone === 'danger';
  return {
    borderRadius: 999,
    padding: '3px 10px',
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    border: `1px solid ${danger ? 'var(--adm-bad)' : 'var(--adm-line-strong)'}`,
    background: danger ? 'var(--adm-bad-soft)' : 'var(--adm-panel)',
    color: danger ? 'var(--adm-bad)' : 'var(--adm-ink)',
  };
}

function RecipientList({
  loading,
  items,
  visibleItems,
  filterOptions,
  activeFilter,
  onFilter,
  total,
}) {
  if (loading) {
    return (
      <p className="px-12 pb-4 text-sm" style={{ color: 'var(--adm-ink-3)' }}>
        Loading recipients…
      </p>
    );
  }

  return (
    <div className="pr-5 pb-4 pl-12">
      {items.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onFilter(option.key)}
              aria-pressed={activeFilter === option.key}
              style={chipStyle(activeFilter === option.key)}
            >
              {option.label} {option.count}
            </button>
          ))}
        </div>
      ) : null}

      {/* Long lists scroll inside the send, so the next send stays close. */}
      <div style={panelStyle} className="overflow-hidden">
        <div
          className={`grid gap-x-4 px-4 py-1.5 ${RECIPIENT_GRID}`}
          style={{
            ...eyebrowStyle,
            background: 'var(--adm-panel-2)',
            borderBottom: '1px solid var(--adm-line)',
          }}
        >
          <span>Name</span>
          <span>Email</span>
          <span>Status</span>
          <span className="text-right">Time</span>
        </div>
        <ul className="max-h-[360px] overflow-y-auto">
          {visibleItems.map((item) => {
            const name =
              [item.registration?.first_name, item.registration?.last_name]
                .filter(Boolean)
                .join(' ') || 'Unknown recipient';
            const showReason = item.failure_reason && item.status !== 'sent';
            return (
              <li
                key={item.id}
                className="px-4 py-2"
                style={{ borderBottom: '1px solid var(--adm-line)' }}
              >
                <div className={`grid items-center gap-x-4 ${RECIPIENT_GRID}`}>
                  <span
                    className="truncate text-sm"
                    style={{ color: 'var(--adm-ink)' }}
                  >
                    {name}
                  </span>
                  <span
                    className="truncate text-xs"
                    style={{ color: 'var(--adm-ink-3)' }}
                  >
                    {item.registration?.email}
                  </span>
                  <span>
                    <AdminStatusBadge tone={itemTone(item.status)}>
                      {item.status}
                    </AdminStatusBadge>
                  </span>
                  <span
                    className="text-right text-xs tabular-nums"
                    style={{ color: 'var(--adm-ink-3)' }}
                  >
                    {formatTime(
                      item.sent_at || item.last_attempt_at || item.updated_at
                    )}
                  </span>
                </div>
                {showReason ? (
                  <p
                    className="mt-1 text-xs"
                    style={{
                      color:
                        item.status === 'skipped'
                          ? 'var(--adm-ink-3)'
                          : 'var(--adm-bad)',
                    }}
                  >
                    {item.failure_reason}
                    {item.status === 'failed' && item.attempt_count
                      ? ` (${item.attempt_count} attempt${item.attempt_count === 1 ? '' : 's'})`
                      : ''}
                  </p>
                ) : null}
              </li>
            );
          })}
          {!items.length ? (
            <li
              className="px-4 py-3 text-sm"
              style={{ color: 'var(--adm-ink-3)' }}
            >
              This send has no recipients recorded yet.
            </li>
          ) : null}
        </ul>
      </div>

      {items.length > 0 && total > items.length ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--adm-ink-3)' }}>
          Showing the first {items.length} of {total} recipients.
        </p>
      ) : null}
    </div>
  );
}
