'use client';

import JobManagerPanel from '@/components/admin/job-manager-panel';
import jobLabels from '@/lib/admin-job-labels.cjs';

const { jobParticipantTitle } = jobLabels;

const DELIVERY_JOBS_CONFIG = {
  endpoints: {
    list: '/api/admin/passes/jobs',
    detail: (jobId) => `/api/admin/passes/jobs/${jobId}`,
    process: '/api/admin/passes/jobs/process',
    retry: (jobId) => `/api/admin/passes/jobs/${jobId}/retry`,
  },
  messages: {
    loadJobs: 'Unable to load jobs.',
    networkLoadJobs: 'Network error while loading jobs.',
    loadDetail: 'Unable to load job detail.',
    networkLoadDetail: 'Network error while loading job detail.',
    process: 'Unable to process QR delivery job right now.',
    retry: 'Unable to retry failed QR delivery items.',
  },
  intro: {
    eyebrow: 'Email delivery',
    title: 'QR Pass Emails',
    description:
      'Every QR pass send, who it reached, and anything that needs a retry.',
    chips: () => [],
  },
  alertTitle: 'Delivery Error',
  trackQueueUnavailable: true,
  coverageLabel: 'Delegates with a QR pass',
  queueUnavailableAlert: {
    title: 'Direct-Send Compatibility Mode',
    description:
      'Queue tables are not deployed in this environment yet. New QR sends will still work, but they are processed immediately instead of being tracked here as background jobs.',
  },
  statCards: [
    {
      key: 'queued',
      label: 'Waiting',
      tone: 'warning',
      detail: 'Queued to send',
    },
    {
      key: 'processing',
      label: 'Sending now',
      tone: 'info',
      detail: 'Building the PDF pass and emailing it',
    },
    {
      key: 'sent',
      label: 'Sent today',
      tone: 'success',
      detail: 'Accepted by Resend for delivery',
    },
    {
      key: 'failed',
      label: 'Failed',
      tone: 'danger',
      detail: 'Use Retry Failed on the send',
    },
  ],
  listHeader: {
    eyebrow: 'Recent QR sends',
    description:
      'Each send from Registrations is one job. Click a send to see who it went to.',
  },
  accent: {
    eyebrow: 'text-amber-600',
    processButton:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    rowProcessButton:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    selectedRow: 'bg-amber-50/40 dark:bg-amber-950/20',
    progressBar: 'bg-amber-600',
  },
  renderJobTitle: jobParticipantTitle,
  renderJobSubtitle: (job) =>
    `${job.total_items} recipient${job.total_items === 1 ? '' : 's'}`,
  emptyState: (state) =>
    state.queueUnavailable
      ? 'Queue-backed jobs are unavailable in this environment, so there is nothing to inspect here yet.'
      : 'No QR delivery jobs yet. Queue one from the review page to see it here.',
  detail: {
    eyebrow: 'Recipients',
    stats: [
      { label: 'Total', field: 'total_items' },
      { label: 'Sent', field: 'sent_items' },
      { label: 'Skipped', field: 'skipped_items' },
      { label: 'Failed', field: 'failed_items' },
    ],
    emptyHint:
      'Select a delivery job to inspect its item timeline and retry failures.',
  },
};

export default function DeliveryJobsPanel({ operator }) {
  return <JobManagerPanel operator={operator} config={DELIVERY_JOBS_CONFIG} />;
}
