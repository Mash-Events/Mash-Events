import {
  EVENT_CONFIG,
  REGISTRATION_EMAIL_COPY,
} from '@/lib/registration-constants';
import { renderBrandedEmailHtml } from '@/lib/email-branding';
import {
  getQrPassEmailInlineAttachments,
  getEventEmailInlineAttachments,
} from '@/lib/qr-pass-email-assets';
import {
  getApplicationCommsEmail,
  getResendClient,
  getResendFromEmail,
} from '@/lib/resend';
import applicationAcknowledgementEmail from '@/lib/application-acknowledgement-email.cjs';
import qrPassEmailUtils from '@/lib/qr-pass-email.cjs';
import qrPassTemplateUtils from '@/lib/qr-pass-template.cjs';

const renderEmailHtml = renderBrandedEmailHtml;
const { buildQrPassEmail } = qrPassEmailUtils;
const { isInvitationQrPassTemplateEnabled } = qrPassTemplateUtils;
const {
  buildRegistrationAcknowledgementEmail,
  buildRegistrationConfirmedEmail,
  buildRegistrationWaitlistedEmail,
  buildRegistrationRejectedEmail,
} = applicationAcknowledgementEmail;

export async function deliverRegistrationEmail({
  registration,
  templateType,
  notificationId,
  db,
  qrImageUrl,
  pdfAttachment,
}) {
  const templateFactory = REGISTRATION_EMAIL_COPY[templateType];

  if (!templateFactory) {
    throw new Error(`Unsupported email template: ${templateType}`);
  }

  const usesInvitationQrPassTemplate =
    templateType === 'qr_pass_issued' && isInvitationQrPassTemplateEnabled();
  const defaultCopy = templateFactory({ firstName: registration.first_name });
  const replyEmail = getApplicationCommsEmail();
  const registrationStatusCopy =
    templateType === 'submission_received'
      ? buildRegistrationAcknowledgementEmail({
          firstName: registration.first_name,
          replyEmail,
        })
      : templateType === 'confirmed'
        ? buildRegistrationConfirmedEmail({
            firstName: registration.first_name,
            replyEmail,
          })
        : templateType === 'waitlisted'
          ? buildRegistrationWaitlistedEmail({
              firstName: registration.first_name,
              replyEmail,
            })
          : templateType === 'rejected'
            ? buildRegistrationRejectedEmail({
                firstName: registration.first_name,
                replyEmail,
              })
            : null;
  const invitationCopy = usesInvitationQrPassTemplate
    ? buildQrPassEmail({
        firstName: registration.first_name,
        qrImageUrl,
        registrationCode: registration.registration_code,
        siteUrl:
          process.env.SITE_URL ||
          process.env.NEXT_PUBLIC_SITE_URL ||
          'https://mash.example',
      })
    : null;
  const { subject, text } =
    invitationCopy || registrationStatusCopy || defaultCopy;
  const resend = getResendClient();

  if (!resend) {
    if (notificationId && db?.markNotificationDelivery) {
      await db.markNotificationDelivery(notificationId, {
        delivery_status: 'failed',
        failure_reason: 'Missing RESEND_API_KEY.',
      });
    }

    return {
      sent: false,
      skipped: true,
      error: 'Missing RESEND_API_KEY.',
    };
  }

  try {
    const attachments = [];

    if (usesInvitationQrPassTemplate) {
      attachments.push(...(await getQrPassEmailInlineAttachments()));
      attachments.push({
        filename: 'mash-2026-calendar.ics',
        content: Buffer.from(invitationCopy.calendarContent, 'utf8'),
      });
    }

    if (registrationStatusCopy) {
      attachments.push(...(await getEventEmailInlineAttachments()));
    }

    if (pdfAttachment) {
      attachments.push({
        filename: pdfAttachment.filename,
        content: pdfAttachment.buffer,
      });
    }

    const { data, error } = await resend.emails.send({
      from: getResendFromEmail(),
      to: [registration.email],
      subject,
      text,
      html:
        invitationCopy?.html ||
        registrationStatusCopy?.html ||
        renderEmailHtml(text, {
          qrImageUrl,
          registrationCode: registration.registration_code,
        }),
      replyTo: usesInvitationQrPassTemplate
        ? [EVENT_CONFIG.contactEmail]
        : registrationStatusCopy
          ? [replyEmail]
          : undefined,
      attachments: attachments.length ? attachments : undefined,
    });

    if (error) {
      throw new Error(error.message || 'Failed to send email.');
    }

    if (notificationId && db?.markNotificationDelivery) {
      await db.markNotificationDelivery(notificationId, {
        delivery_status: 'sent',
        provider_message_id: data?.id || null,
      });
    }

    return { sent: true, providerMessageId: data?.id || null };
  } catch (error) {
    if (notificationId && db?.markNotificationDelivery) {
      await db.markNotificationDelivery(notificationId, {
        delivery_status: 'failed',
        failure_reason:
          error instanceof Error ? error.message : 'Failed to send email.',
      });
    }

    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Failed to send email.',
    };
  }
}
