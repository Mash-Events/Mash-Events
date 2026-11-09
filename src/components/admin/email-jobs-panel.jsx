'use client';

import JobManagerPanel from '@/components/admin/job-manager-panel';
import OutgoingEmailHistory from '@/components/admin/outgoing-email-history';
import AdminPageIntro from '@/components/admin/admin-page-intro';
import jobLabels from '@/lib/admin-job-labels.cjs';

const { jobParticipantTitle } = jobLabels;

const EMAIL_JOBS_CONFIG = {
  endpoints: {
    list: '/api/admin/email-jobs',
    detail: (jobId) => `/api/admin/email-jobs/${jobId}`,
    process: '/api/admin/email-jobs/process',
    retry: (jobId) => `/api/admin/email-jobs/${jobId}/retry`,
  },
  messages: {
    loadJobs: 'Unable to load registration email jobs.',
    networkLoadJobs: 'Network error while loading registration email jobs.',
    loadDetail: 'Unable to load email job detail.',
    networkLoadDetail: 'Network error while loading email job detail.',
    process: 'Unable to process registration email job right now.',
    retry: 'Unable to retry failed registration email items.',
  },
  intro: {
    eyebrow: 'Email delivery',
    title: 'Outgoing Emails',
    // The page intro is shown above the email history instead.
    description: '',
    chips: () => [],
  },
  alertTitle: 'Email Queue Error',
  statCards: [
    {
      key: 'queued',
      label: 'Waiting',
      tone: 'warning',
      detail: 'Waiting for background worker',
    },
    {
      key: 'processing',
      label: 'Sending now',
      tone: 'info',
      detail: 'Currently sending',
    },
    {
      key: 'sent',
      label: 'Sent today',
      tone: 'success',
      detail: 'Accepted by email provider',
    },
    {
      key: 'failed',
      label: 'Failed',
      tone: 'danger',
      detail: 'Use Retry Failed on the send',
    },
  ],
  listHeader: {
    eyebrow: 'Registration email queue',
    description:
      'Status emails (received, confirmed, waitlisted, rejected) sent in bulk. Click a send to see who it went to.',
  },
  accent: {
    eyebrow: 'text-purple-600',
    processButton:
      'border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
    rowProcessButton:
      'border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
    selectedRow: 'bg-purple-50/40 dark:bg-purple-950/20',
    progressBar: 'bg-purple-600',
  },
  renderJobTitle: jobParticipantTitle,
  // "submission_received" -> "Submission received"
  renderJobTag: (job) => {
    const label = String(job.template_type || '').replaceAll('_', ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  },
  renderJobSubtitle: (job) =>
    `${job.template_type.replaceAll('_', ' ')} · ${job.total_items} recipient${job.total_items === 1 ? '' : 's'}`,
  emptyState: () => 'No registration email jobs yet.',
  detail: {
    eyebrow: 'Selected Job',
    stats: [
      { label: 'Total', field: 'total_items' },
      { label: 'Sent', field: 'sent_items' },
      { label: 'Failed', field: 'failed_items' },
    ],
    emptyHint:
      'Select an email job to inspect its timeline and retry failures.',
  },
};

export default function EmailJobsPanel({ operator }) {
  return (
    <div className="space-y-6">
      <AdminPageIntro description="Every email the site has sent and whether it reached the inbox. Use the filters to find bounced or suppressed addresses." />
      <OutgoingEmailHistory />
      <JobManagerPanel operator={operator} config={EMAIL_JOBS_CONFIG} />
    </div>
  );
}
