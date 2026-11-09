import {
  createNotification,
  markNotificationDelivery,
} from '@/lib/registration-db';
import {
  getAzureWhatsAppConfig,
  isAzureWhatsAppConfigured,
  normalizeWhatsAppRecipientPhone,
  sendRegistrationWhatsAppNotification,
} from '@/lib/azure-whatsapp';

export async function deliverHighPriorityRegistrationWhatsApp({
  registration,
  templateType,
  operator = null,
  db = {
    createNotification,
    markNotificationDelivery,
  },
} = {}) {
  const config = getAzureWhatsAppConfig();
  if (
    !config.highPriorityTemplates.has(templateType) ||
    !isAzureWhatsAppConfigured(config) ||
    !config.templateByType[templateType]
  ) {
    return { sent: false, skipped: true, reason: 'not_configured' };
  }

  const recipientPhone = normalizeWhatsAppRecipientPhone({
    phone: registration?.phone,
    country: registration?.country,
    defaultCountryCode: config.defaultCountryCode,
  });

  if (!recipientPhone) {
    return { sent: false, skipped: true, reason: 'invalid_phone' };
  }

  let notificationId = null;
  try {
    notificationId = await db.createNotification({
      registrationId: registration.id,
      templateType,
      recipientEmail: registration.email,
      recipientPhone,
      deliveryChannel: 'whatsapp',
      actorClerkId: operator?.userId || null,
      actorEmail: operator?.primaryEmail || null,
    });

    const result = await sendRegistrationWhatsAppNotification({
      registration,
      templateType,
      config,
    });

    if (result.skipped) {
      await db.markNotificationDelivery(notificationId, {
        delivery_status: 'skipped',
        failure_reason: result.reason || 'WhatsApp notification skipped.',
      });
      return { ...result, notificationId };
    }

    await db.markNotificationDelivery(notificationId, {
      delivery_status: 'sent',
      provider_message_id: result.providerMessageId,
      provider_payload: result.providerPayload,
    });

    return { ...result, notificationId };
  } catch (error) {
    if (notificationId) {
      await db.markNotificationDelivery(notificationId, {
        delivery_status: 'failed',
        failure_reason:
          error instanceof Error
            ? error.message
            : 'Unable to send WhatsApp notification.',
      });
    }

    return {
      sent: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to send WhatsApp notification.',
      notificationId,
    };
  }
}
