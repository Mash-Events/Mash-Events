import {
  createNotification,
  getRegistrationById,
  issuePassForRegistration,
  markQrPassIssued,
  markNotificationDelivery,
} from '@/lib/registration-db';
import { buildPassAttachment } from '@/lib/registration-pass';
import { uploadPassQrImage } from '@/lib/registration-pass-assets';
import { deliverRegistrationEmail } from '@/lib/registration-email';
import { deliverHighPriorityRegistrationWhatsApp } from '@/lib/registration-whatsapp-notifications';
import {
  DEFAULT_JOB_CHUNK_SIZE,
  MAX_JOB_RETRIES,
  assertQueueInfrastructureAvailable,
  buildJobSelection,
  shouldSkipJobItem,
} from '@/lib/registration-job-utils.cjs';
import {
  claimPassIssueEmailJobItems,
  createPassIssueEmailJobWithItems,
  getPassIssueEmailJob,
  getNextPassIssueEmailJob,
  listPassIssueEmailJobItems,
  listRegistrationsForPassJob,
  refreshPassIssueEmailJob,
  retryFailedPassIssueEmailJobItems,
  updatePassIssueEmailJobItem,
} from '@/lib/registration-ops-db';

async function sendPassEmail({ item, registration, operator, resendExisting }) {
  if (registration.status !== 'confirmed') {
    return updatePassIssueEmailJobItem(item.id, {
      status: 'skipped',
      failure_reason: 'Registration is no longer confirmed.',
    });
  }

  if (shouldSkipJobItem({ resendExisting, registration })) {
    return updatePassIssueEmailJobItem(item.id, {
      status: 'skipped',
      failure_reason: 'QR pass already issued and resend mode is disabled.',
    });
  }

  // Reuse the row the worker just loaded instead of fetching it again.
  const issued = await issuePassForRegistration({
    registrationId: registration.id,
    registration,
    operator,
  });

  const notificationId = await createNotification({
    registrationId: registration.id,
    templateType: 'qr_pass_issued',
    recipientEmail: registration.email,
    actorClerkId: operator.userId,
    actorEmail: operator.primaryEmail,
  });

  const attachment = await buildPassAttachment({
    token: issued.token,
    registration: {
      ...issued.registration,
      qr_token: issued.token,
    },
  });

  const qrImage = await uploadPassQrImage({
    passId: issued.passId,
    registrationId: issued.registration.id,
    token: issued.token,
  });

  const emailResult = await deliverRegistrationEmail({
    registration: issued.registration,
    templateType: 'qr_pass_issued',
    notificationId,
    db: { markNotificationDelivery },
    qrImageUrl: qrImage.publicUrl,
    pdfAttachment: {
      filename: attachment.filename,
      buffer: attachment.pdfBuffer,
    },
  });

  if (!emailResult.sent) {
    throw new Error(emailResult.error || 'Unable to deliver QR pass email.');
  }

  await markQrPassIssued({
    registrationId: issued.registration.id,
    operator,
  });

  await deliverHighPriorityRegistrationWhatsApp({
    registration: issued.registration,
    templateType: 'qr_pass_issued',
    operator,
  });

  return updatePassIssueEmailJobItem(item.id, {
    status: 'sent',
    notification_id: notificationId,
    pass_id: issued.passId,
    token: issued.token,
    sent_at: new Date().toISOString(),
    failure_reason: null,
  });
}

export async function createPassIssueEmailJob({
  filters = {},
  registrationIds = [],
  resendExisting = false,
  operator,
}) {
  const selection = buildJobSelection({
    filters,
    registrationIds,
    resendExisting,
  });

  // Explicit ids go straight to the RPC, which keeps only confirmed rows;
  // filtered sends resolve their ids first.
  const jobRegistrationIds = selection.registrationIds.length
    ? selection.registrationIds
    : (
        await listRegistrationsForPassJob({
          filters: selection.filters,
          registrationIds: [],
        })
      ).map((registration) => registration.id);

  try {
    return await createPassIssueEmailJobWithItems({
      selection,
      registrationIds: jobRegistrationIds,
      operator,
      maxAttempts: MAX_JOB_RETRIES,
    });
  } catch (error) {
    assertQueueInfrastructureAvailable(
      error,
      'Queue-backed QR delivery is required for bulk sends. Deploy the QR job tables before running this action.'
    );
  }
}

export async function processPassIssueEmailJob({
  jobId,
  operator,
  chunkSize = DEFAULT_JOB_CHUNK_SIZE,
}) {
  const job = await getPassIssueEmailJob(jobId);
  const items = await claimPassIssueEmailJobItems({
    jobId,
    limit: chunkSize,
  });

  for (const item of items) {
    try {
      const registration = await getRegistrationById(item.registration_id);
      await sendPassEmail({
        item,
        registration,
        operator,
        resendExisting: job.resend_existing,
      });
    } catch (error) {
      const attemptsRemaining =
        Number(item.max_attempts || MAX_JOB_RETRIES) -
        Number(item.attempt_count || 0);
      const nextStatus = attemptsRemaining > 0 ? 'retrying' : 'failed';

      await updatePassIssueEmailJobItem(item.id, {
        status: nextStatus,
        failure_reason:
          error instanceof Error
            ? error.message
            : 'Unable to send QR pass email.',
      });
    }
  }

  return refreshPassIssueEmailJob(jobId);
}

export async function processNextAvailablePassIssueEmailJob({
  operator,
  chunkSize,
} = {}) {
  const activeJob = await getNextPassIssueEmailJob();

  if (!activeJob) {
    return null;
  }

  return processPassIssueEmailJob({
    jobId: activeJob.id,
    operator,
    chunkSize,
  });
}

export async function getPassIssueEmailJobDetail(jobId) {
  const job = await getPassIssueEmailJob(jobId);
  const items = await listPassIssueEmailJobItems({ jobId, limit: 50 });

  return {
    job,
    items,
  };
}

export async function retryPassIssueEmailJob(jobId) {
  await retryFailedPassIssueEmailJobItems(jobId);
  return refreshPassIssueEmailJob(jobId);
}
