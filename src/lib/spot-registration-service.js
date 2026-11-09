import { getEventEmailInlineAttachments } from '@/lib/qr-pass-email-assets';
import {
  getApplicationCommsEmail,
  getResendClient,
  sendApplicantConfirmationEmail,
} from '@/lib/resend';
import {
  createSpotRegistration,
  findAdvanceRegistration,
  findEarlierSpotRegistration,
  finishSpotRegistrationEmail,
} from '@/lib/spot-registration-db';
import spotUtils from '@/lib/spot-registration-utils.cjs';
import emailUtils from '@/lib/application-acknowledgement-email.cjs';

const { eventDayNow, normalizeSpotInput, returningSpotEmailStatus } = spotUtils;
const { buildSpotRegistrationEmail } = emailUtils;

export async function registerSpotAttendee({ input, operator }) {
  const day = eventDayNow();
  if (!day) {
    throw new Error(
      'Spot registration opens on 14 October and closes after 15 October 2026 (India time).'
    );
  }
  const details = normalizeSpotInput(input);
  if (await findAdvanceRegistration(details.email)) {
    throw new Error(
      'This email already has an advance registration. Use manual lookup on the Check-in page.'
    );
  }

  const earlier = await findEarlierSpotRegistration(
    details.email,
    day.eventDay
  );
  if (earlier) {
    return createSpotRegistration({
      input: details,
      eventDay: day.eventDay,
      operator,
      emailStatus: returningSpotEmailStatus(earlier),
    });
  }
  if (!getResendClient()) throw new Error('Email delivery is not configured.');

  const email = buildSpotRegistrationEmail({
    firstName: details.fullName.split(/\s+/)[0],
    eventDay: day.eventDay,
    replyEmail: getApplicationCommsEmail(),
  });
  const inlineAttachments = await getEventEmailInlineAttachments();
  const registration = await createSpotRegistration({
    input: details,
    eventDay: day.eventDay,
    operator,
  });

  try {
    const delivery = await sendApplicantConfirmationEmail({
      to: registration.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: getApplicationCommsEmail(),
      attachments: inlineAttachments,
      idempotencyKey: `spot-registration-${registration.id}`,
    });
    if (!delivery.sent || !delivery.providerMessageId) {
      throw new Error('Email provider did not confirm a message ID.');
    }
    return await finishSpotRegistrationEmail({
      id: registration.id,
      status: 'sent',
      providerMessageId: delivery.providerMessageId,
    });
  } catch (error) {
    // Attendance stays recorded. An uncertain email outcome must never cause
    // another spot record or automatic second send.
    console.error('Spot registration email needs review.', {
      registrationId: registration.id,
      error,
    });
    try {
      return await finishSpotRegistrationEmail({
        id: registration.id,
        status: 'needs_review',
        errorMessage:
          error instanceof Error ? error.message : 'Email outcome is unknown.',
      });
    } catch (recordError) {
      console.error('Unable to record spot email outcome.', {
        registrationId: registration.id,
        error: recordError,
      });
      return registration;
    }
  }
}
