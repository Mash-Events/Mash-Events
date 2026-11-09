import {
  createNotification,
  getRegistrationById,
  markNotificationDelivery,
} from './registration-db.js';
import { deliverRegistrationEmail } from './registration-email.js';
import { REGISTRATION_EMAIL_COPY } from './registration-constants.js';
import { deliverHighPriorityRegistrationWhatsApp } from './registration-whatsapp-notifications.js';
import {
  DEFAULT_JOB_CHUNK_SIZE,
  MAX_JOB_RETRIES,
  isQueueInfrastructureUnavailable,
} from './registration-job-utils.cjs';
import {
  claimRegistrationEmailJobItems,
  createRegistrationEmailJobRecord,
  getRegistrationEmailJob,
  insertRegistrationEmailJobItems,
  getNextRegistrationEmailJob,
  listRegistrationEmailJobItems,
  refreshRegistrationEmailJob,
  retryFailedRegistrationEmailJobItems,
  updateRegistrationEmailJobItem,
} from './registration-ops-db.js';

function createSystemOperator() {
  return {
    userId: 'system-job-processor',
    primaryEmail: 'system-job-processor@local',
  };
}

export function createRegistrationEmailJobProcessor(deps = {}) {
  const {
    createJobRecord = createRegistrationEmailJobRecord,
    insertJobItems = insertRegistrationEmailJobItems,
    refreshJob = refreshRegistrationEmailJob,
    getNextJob = getNextRegistrationEmailJob,
    getJob = getRegistrationEmailJob,
    claimJobItems = claimRegistrationEmailJobItems,
    updateJobItem = updateRegistrationEmailJobItem,
    getRegistration = getRegistrationById,
    sendRegistrationEmail = deliverRegistrationEmail,
    sendRegistrationWhatsApp = deliverHighPriorityRegistrationWhatsApp,
    createRegistrationNotification = createNotification,
    updateNotificationDelivery = markNotificationDelivery,
    listJobItems = listRegistrationEmailJobItems,
    retryFailedItems = retryFailedRegistrationEmailJobItems,
  } = deps;

  async function queueRegistrationEmailJob({
    registrationId,
    templateType,
    notificationId = null,
    recipientEmail = null,
    operator = null,
  }) {
    if (!Object.hasOwn(REGISTRATION_EMAIL_COPY, templateType)) {
      throw new Error(`Unsupported email template: ${templateType}`);
    }
    try {
      const nextNotificationId =
        notificationId ||
        (await createRegistrationNotification({
          registrationId,
          templateType,
          recipientEmail:
            recipientEmail || (await getRegistration(registrationId)).email,
          actorClerkId: operator?.userId || null,
          actorEmail: operator?.primaryEmail || null,
        }));

      const job = await createJobRecord({
        templateType,
        operator,
      });

      await insertJobItems({
        jobId: job.id,
        items: [
          {
            registrationId,
            notificationId: nextNotificationId,
            templateType,
          },
        ],
        maxAttempts: MAX_JOB_RETRIES,
      });

      const refreshedJob = await refreshJob(job.id);
      return {
        queued: true,
        jobId: refreshedJob.id,
        notificationId: nextNotificationId,
      };
    } catch (error) {
      if (isQueueInfrastructureUnavailable(error)) {
        return {
          queued: false,
          queueUnavailable: true,
          error:
            'Registration confirmation email queue is unavailable. Submission was saved but confirmation email was not queued.',
        };
      }

      throw error;
    }
  }

  async function queueRegistrationEmailBatchJob({
    registrations = [],
    templateType,
    operator = null,
  }) {
    if (!Object.hasOwn(REGISTRATION_EMAIL_COPY, templateType)) {
      throw new Error(`Unsupported email template: ${templateType}`);
    }
    const normalizedRegistrations = registrations.filter(
      (registration) => registration?.id
    );

    if (!normalizedRegistrations.length) {
      return {
        queued: false,
        jobId: null,
        notificationIds: [],
        empty: true,
      };
    }

    try {
      const notifications = await Promise.all(
        normalizedRegistrations.map(async (registration) => ({
          registrationId: registration.id,
          notificationId: await createRegistrationNotification({
            registrationId: registration.id,
            templateType,
            recipientEmail:
              registration.email ||
              (await getRegistration(registration.id)).email,
            actorClerkId: operator?.userId || null,
            actorEmail: operator?.primaryEmail || null,
          }),
          templateType,
        }))
      );

      const job = await createJobRecord({
        templateType,
        operator,
      });

      await insertJobItems({
        jobId: job.id,
        items: notifications,
        maxAttempts: MAX_JOB_RETRIES,
      });

      const refreshedJob = await refreshJob(job.id);
      return {
        queued: true,
        jobId: refreshedJob.id,
        notificationIds: notifications.map((item) => item.notificationId),
        totalItems: refreshedJob.total_items || notifications.length,
      };
    } catch (error) {
      if (isQueueInfrastructureUnavailable(error)) {
        return {
          queued: false,
          queueUnavailable: true,
          error:
            'Registration confirmation email queue is unavailable. Updates were saved but email was not queued.',
        };
      }

      throw error;
    }
  }

  async function processRegistrationEmailJob({
    jobId,
    operator = createSystemOperator(),
    chunkSize = DEFAULT_JOB_CHUNK_SIZE,
  }) {
    const job = await getJob(jobId);
    const items = await claimJobItems({ jobId, limit: chunkSize });

    for (const item of items) {
      try {
        const registration = await getRegistration(item.registration_id);
        const emailResult = await sendRegistrationEmail({
          registration,
          templateType: item.template_type,
          notificationId: item.notification_id,
          db: { markNotificationDelivery: updateNotificationDelivery },
        });

        if (!emailResult.sent) {
          throw new Error(
            emailResult.error || 'Unable to deliver registration email.'
          );
        }

        await sendRegistrationWhatsApp({
          registration,
          templateType: item.template_type,
          operator,
        });

        await updateJobItem(item.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          failure_reason: null,
        });
      } catch (error) {
        const attemptsRemaining =
          Number(item.max_attempts || MAX_JOB_RETRIES) -
          Number(item.attempt_count || 0);
        const nextStatus = attemptsRemaining > 0 ? 'retrying' : 'failed';

        await updateJobItem(item.id, {
          status: nextStatus,
          failure_reason:
            error instanceof Error
              ? error.message
              : 'Unable to deliver registration email.',
        });
      }
    }

    return refreshJob(job.id);
  }

  async function processNextAvailableRegistrationEmailJob({
    operator = createSystemOperator(),
    chunkSize,
  } = {}) {
    const activeJob = await getNextJob();

    if (!activeJob) {
      return null;
    }

    return processRegistrationEmailJob({
      jobId: activeJob.id,
      operator,
      chunkSize,
    });
  }

  async function getRegistrationEmailJobDetail(jobId) {
    const [job, items] = await Promise.all([
      getJob(jobId),
      listJobItems({ jobId, limit: 100 }),
    ]);

    return { job, items };
  }

  async function retryRegistrationEmailJob(jobId) {
    await retryFailedItems(jobId);
    return refreshJob(jobId);
  }

  return {
    queueRegistrationEmailJob,
    queueRegistrationEmailBatchJob,
    processRegistrationEmailJob,
    processNextAvailableRegistrationEmailJob,
    getRegistrationEmailJobDetail,
    retryRegistrationEmailJob,
  };
}

const defaultProcessor = createRegistrationEmailJobProcessor();

export const queueRegistrationEmailJob =
  defaultProcessor.queueRegistrationEmailJob;
export const queueRegistrationEmailBatchJob =
  defaultProcessor.queueRegistrationEmailBatchJob;
export const processRegistrationEmailJob =
  defaultProcessor.processRegistrationEmailJob;
export const processNextAvailableRegistrationEmailJob =
  defaultProcessor.processNextAvailableRegistrationEmailJob;
export const getRegistrationEmailJobDetail =
  defaultProcessor.getRegistrationEmailJobDetail;
export const retryRegistrationEmailJob =
  defaultProcessor.retryRegistrationEmailJob;
