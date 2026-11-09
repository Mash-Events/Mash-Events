import { after } from 'next/server';
import { processRegistrationEmailJob } from '@/lib/registration-email-job-service';

// Sends a freshly queued review email job after the response has gone out.
// The cron drain picks the job up if this background run fails.
export function scheduleRegistrationEmailJob(jobId) {
  if (!jobId) return;
  after(async () => {
    try {
      await processRegistrationEmailJob({
        jobId,
        operator: {
          userId: 'system-after-trigger',
          primaryEmail: 'system-after-trigger@local',
        },
      });
    } catch (error) {
      console.error(
        'Failed to process registration email job in background:',
        error
      );
    }
  });
}
