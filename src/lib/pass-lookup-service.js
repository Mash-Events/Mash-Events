import {
  createPassIssueEmailJob,
  processPassIssueEmailJob,
} from '@/lib/pass-issue-job-service';
import passUtils from '@/lib/registration-pass-utils.cjs';
import passLookupWindow from '@/lib/pass-lookup-window.cjs';
import {
  findRegistrationForPassLookup,
  listPendingPassLookupJobs,
  listRecentPassLookupRequests,
} from '@/lib/registration-ops-db';

const { getIssuedEntryPass } = passUtils;
const { PASS_LOOKUP_OPERATOR, canQueuePassLookup } = passLookupWindow;

const DAY_MS = 24 * 60 * 60 * 1000;

// Queues a resend of an attendee's existing QR pass. It never issues a new
// pass: issuePassForRegistration() would create one for a confirmed
// registration without a pass, so we stop here unless one is already issued.
export async function requestPassLookup(email, now = new Date()) {
  const registration = await findRegistrationForPassLookup(email);

  if (!registration || registration.status !== 'confirmed') {
    return { queued: false, reason: 'not_eligible' };
  }

  if (!getIssuedEntryPass(registration.entry_passes)) {
    return { queued: false, reason: 'no_pass' };
  }

  const recent = await listRecentPassLookupRequests({
    registrationId: registration.id,
    operatorId: PASS_LOOKUP_OPERATOR.userId,
    since: new Date(now.getTime() - DAY_MS).toISOString(),
  });

  if (!canQueuePassLookup(recent, now)) {
    return { queued: false, reason: 'cooldown' };
  }

  const job = await createPassIssueEmailJob({
    registrationIds: [registration.id],
    resendExisting: true,
    operator: PASS_LOOKUP_OPERATOR,
  });

  return { queued: true, jobId: job.id, registrationId: registration.id };
}

export function processPassLookupJob(jobId) {
  return processPassIssueEmailJob({
    jobId,
    operator: PASS_LOOKUP_OPERATOR,
    chunkSize: 1,
  });
}

// Sends only jobs created by the public page, one at a time, so a burst of
// requests stays well under Resend's per-second limit.
export async function drainPassLookupJobs({ limit = 20 } = {}) {
  const jobs = await listPendingPassLookupJobs({
    operatorId: PASS_LOOKUP_OPERATOR.userId,
    limit,
  });

  let processed = 0;
  for (const job of jobs) {
    try {
      await processPassLookupJob(job.id);
      processed += 1;
    } catch (error) {
      console.error('Pass lookup drain: job failed', job.id, error);
    }
  }

  return { pending: jobs.length, processed };
}
