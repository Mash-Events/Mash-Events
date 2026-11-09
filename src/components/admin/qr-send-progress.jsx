'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { AdminAlert } from '@/components/admin/admin-ui';
import qrSendProgress from '@/lib/qr-send-progress.cjs';

const { describeQrSend, summarizeQrSendJob } = qrSendProgress;

// One pass per request, so the counter moves with every email, like the
// speaker badge send. Claims are atomic, so this can run alongside the
// background kick-off and the pass-week cron without double-sending.
const SEND_CHUNK_SIZE = 1;
const SEND_GAP_MS = 400;
// When another worker is mid-send there is nothing to claim; wait a little
// longer before asking again.
const IDLE_GAP_MS = 2000;
const MAX_CONSECUTIVE_ERRORS = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadFailures(jobId) {
  try {
    const response = await fetch(`/api/admin/passes/jobs/${jobId}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) return [];
    return (data.items || [])
      .filter((item) => item.status === 'failed' || item.status === 'retrying')
      .map((item) => ({
        id: item.id,
        name:
          [item.registration?.first_name, item.registration?.last_name]
            .filter(Boolean)
            .join(' ') ||
          item.registration?.email ||
          'Unknown registrant',
        reason: item.failure_reason || 'Not sent yet.',
      }));
  } catch {
    return [];
  }
}

export function useQrSendProgress({ onFinished } = {}) {
  const [run, setRun] = useState(null);
  const cancelledRef = useRef(false);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const start = useCallback(async (job) => {
    if (!job?.id) return;
    let latest = summarizeQrSendJob(job);
    setRun({ jobId: job.id, running: true, summary: latest, failures: [] });

    let errors = 0;
    let lastError = '';
    while (!cancelledRef.current && latest.pending > 0) {
      const doneBefore = latest.done;
      try {
        const response = await fetch('/api/admin/passes/jobs/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, chunkSize: SEND_CHUNK_SIZE }),
        });
        const data = await response.json();
        if (!response.ok || !data.job) {
          throw new Error(data.error || 'Unable to send QR passes.');
        }
        errors = 0;
        latest = summarizeQrSendJob(data.job);
        setRun((current) =>
          current?.jobId === job.id ? { ...current, summary: latest } : current
        );
      } catch (error) {
        errors += 1;
        lastError =
          error instanceof Error
            ? error.message
            : 'Network error while sending.';
        if (errors >= MAX_CONSECUTIVE_ERRORS) break;
      }
      await sleep(latest.done > doneBefore ? SEND_GAP_MS : IDLE_GAP_MS);
    }

    if (cancelledRef.current) return;
    const failures =
      latest.failed || latest.retrying ? await loadFailures(job.id) : [];
    setRun((current) =>
      current?.jobId === job.id
        ? {
            ...current,
            running: false,
            summary: latest,
            failures,
            error: errors >= MAX_CONSECUTIVE_ERRORS ? lastError : '',
          }
        : current
    );
    onFinishedRef.current?.();
  }, []);

  const dismiss = useCallback(() => setRun(null), []);

  return { run, start, dismiss };
}

export function QrSendProgressCard({ run, onDismiss, lifted = false }) {
  if (!run) return null;
  const { summary } = run;
  const copy = describeQrSend(summary, { running: run.running });

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 z-50 w-[min(380px,calc(100vw-2rem))] rounded-[10px] bg-white shadow-lg dark:bg-zinc-950 ${lifted ? 'bottom-24' : 'bottom-4'}`}
    >
      <AdminAlert
        tone={copy.tone}
        title={copy.title}
        description={
          <span style={{ display: 'grid', gap: 8 }}>
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                height: 6,
                borderRadius: 999,
                background: 'var(--adm-line)',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${Math.max(summary.percent, 3)}%`,
                  background: 'currentColor',
                  transition: 'width 300ms ease',
                }}
              />
            </span>
            <span>{copy.detail}</span>
            {run.running ? (
              <span>
                Keep this page open for the fastest send. If you leave, the rest
                still goes out in the background.
              </span>
            ) : null}
            {run.error ? (
              <span style={{ color: 'var(--adm-bad)' }}>
                Stopped after repeated errors: {run.error} The rest will finish
                in the background.
              </span>
            ) : null}
            {run.failures.length ? (
              <span style={{ display: 'grid', gap: 3 }}>
                {run.failures.map((failure) => (
                  <span key={failure.id} style={{ color: 'var(--adm-bad)' }}>
                    {failure.name}: {failure.reason}
                  </span>
                ))}
              </span>
            ) : null}
            {!run.running ? (
              <span>
                Bounced or suppressed addresses show up in Outgoing Emails
                within a few minutes.
              </span>
            ) : null}
          </span>
        }
        actions={
          run.running ? null : (
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {summary.failed ? (
                <Link
                  href="/admin/delivery"
                  className="inline-flex h-8 items-center rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200"
                >
                  Retry in QR Pass Emails
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200"
              >
                <X size={14} /> Dismiss
              </button>
            </span>
          )
        }
      />
    </div>
  );
}
