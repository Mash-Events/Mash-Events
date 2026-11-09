import {
  claimReminderSend,
  getActiveReminderAttempt,
  getConfirmedRegistration,
  getReminderCampaignForSend,
  hasAcceptedReminder,
  markReminderFailed,
  markReminderSent,
  prepareReminderSendRequest,
} from '@/lib/reminder-db';
import { downloadReminderAttachment } from '@/lib/reminder-attachments';
import { getEventEmailInlineAttachments } from '@/lib/qr-pass-email-assets';
import {
  getResendClient,
  getResendFromEmail,
  sendApplicantConfirmationEmail,
} from '@/lib/resend';
import reminderEmail from '@/lib/reminder-email.cjs';
import reminderUtils from '@/lib/reminder-utils.cjs';
import guestSendAttempt from '@/lib/guest-send-attempt.cjs';
import qrPassEmail from '@/lib/qr-pass-email.cjs';

const { REMINDER_CALENDAR_FILENAME, REMINDER_REPLY_TO, buildReminderEmail } =
  reminderEmail;
const { buildEventCalendarIcs } = qrPassEmail;
const { isDefiniteProviderRejection, isValidEmail } = reminderUtils;
const { RETRY_BEFORE_MS, canRetryGuestSend, hashGuestEmailRequest } =
  guestSendAttempt;

// A bulk send reads the same few files for every registrant, so each warm
// instance keeps them in memory, keyed by content hash.
const attachmentCache = new Map();
const MAX_CACHED_ATTACHMENTS = 20;

async function loadAttachmentFiles(rows) {
  return Promise.all(
    rows.map(async (row) => {
      const key = `${row.id}:${row.sha256}`;
      let content = attachmentCache.get(key);
      if (!content) {
        content = await downloadReminderAttachment(row.storage_path);
        if (attachmentCache.size >= MAX_CACHED_ATTACHMENTS) {
          attachmentCache.clear();
        }
        attachmentCache.set(key, content);
      }
      return { filename: row.filename, content };
    })
  );
}

function reminderIdempotencyKey(attemptId) {
  return `event-reminder/${attemptId}`;
}

async function buildReminderMessage({
  campaign,
  attachmentRows,
  recipient,
  now,
  test = false,
}) {
  const email = buildReminderEmail({
    subject: campaign.subject,
    body: campaign.body,
    recipient,
    replyEmail: REMINDER_REPLY_TO,
    now,
    test,
  });
  const [inline, files] = await Promise.all([
    getEventEmailInlineAttachments(),
    loadAttachmentFiles(attachmentRows),
  ]);
  // The fixed "Plan ahead" section promises this calendar file, as in the
  // QR pass email.
  const calendar = {
    filename: REMINDER_CALENDAR_FILENAME,
    content: Buffer.from(buildEventCalendarIcs(), 'utf8'),
  };
  return { email, attachments: [...inline, calendar, ...files] };
}

function testRecipientName(operator) {
  const name = String(operator?.displayName || '').trim();
  return name && !name.includes('@') ? name.split(/\s+/)[0] : 'there';
}

// A test goes to one address (the admin's own by default), is marked
// [TEST], and is never recorded, so it cannot count as a send.
export async function sendReminderTest({ campaignId, operator, to }) {
  if (!getResendClient()) throw new Error('Resend is not configured.');
  const recipientEmail = String(to || operator?.primaryEmail || '')
    .trim()
    .toLowerCase();
  if (!recipientEmail) {
    throw new Error('An email address is required for the test.');
  }
  if (!isValidEmail(recipientEmail)) {
    throw new Error(`${recipientEmail} is not a valid email address.`);
  }

  const { campaign, attachments: attachmentRows } =
    await getReminderCampaignForSend(campaignId);
  const { email, attachments } = await buildReminderMessage({
    campaign,
    attachmentRows,
    recipient: { firstName: testRecipientName(operator) },
    test: true,
  });
  const delivery = await sendApplicantConfirmationEmail({
    to: recipientEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: REMINDER_REPLY_TO,
    attachments,
  });
  if (!delivery.sent) {
    throw new Error(delivery.error || 'Resend did not accept the test email.');
  }
  return {
    recipient: recipientEmail,
    providerMessageId: delivery.providerMessageId,
  };
}

export async function sendReminder({
  campaignId,
  registrationId,
  operator,
  expectedContentVersion = null,
  resend = false,
  retry = false,
}) {
  if (!getResendClient()) throw new Error('Resend is not configured.');

  let attempt;
  let newAttempt = false;
  let providerAccepted = false;
  let providerContacted = false;

  try {
    const [{ campaign, attachments: attachmentRows }, registration] =
      await Promise.all([
        getReminderCampaignForSend(campaignId),
        getConfirmedRegistration(registrationId, { requireConfirmed: !retry }),
      ]);
    // Every send in one bulk run uses the copy the admin confirmed, even if
    // someone saves new copy part-way through.
    if (
      expectedContentVersion !== null &&
      expectedContentVersion !== campaign.contentVersion
    ) {
      throw new Error(
        'The reminder copy changed since you started. Reload it and check the preview before sending.'
      );
    }
    const recipient = {
      firstName: registration.first_name,
      lastName: registration.last_name,
    };

    if (retry) {
      attempt = await getActiveReminderAttempt({ campaignId, registrationId });
      if (!canRetryGuestSend(attempt)) {
        throw new Error(
          'This send cannot be retried safely now. Check its outcome in Resend.'
        );
      }
      if (attempt.content_version !== campaign.contentVersion) {
        throw new Error(
          'The reminder copy changed since this attempt began. Check Resend before retrying.'
        );
      }
    } else {
      if (!isValidEmail(registration.email)) {
        throw new Error(
          `${registration.email || 'This registrant'} is not a valid email address. Fix it in the registration first.`
        );
      }
      if (
        !resend &&
        (await hasAcceptedReminder({ campaignId, registrationId }))
      ) {
        throw new Error(
          `${registration.first_name} has already been sent this reminder. Use Resend to send it again.`
        );
      }
      // Build once before claiming, so a broken attachment fails without
      // opening an attempt.
      await buildReminderMessage({ campaign, attachmentRows, recipient });
      attempt = await claimReminderSend({
        campaignId,
        registrationId,
        contentVersion: campaign.contentVersion,
        resend,
        operator,
      });
      newAttempt = true;
    }

    // Days to go are counted from when the attempt began, so a retry the
    // next morning rebuilds the identical email.
    const { email, attachments } = await buildReminderMessage({
      campaign,
      attachmentRows,
      recipient,
      now: new Date(attempt.created_at),
    });
    const to = [attempt.recipient_email];

    const requestSha256 = hashGuestEmailRequest({
      from: getResendFromEmail(),
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: REMINDER_REPLY_TO,
      attachments,
    });
    await prepareReminderSendRequest(attempt.id, requestSha256);

    providerContacted = true;
    const delivery = await sendApplicantConfirmationEmail({
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: REMINDER_REPLY_TO,
      attachments,
      idempotencyKey: reminderIdempotencyKey(attempt.id),
    });
    if (!delivery.sent || !delivery.providerMessageId) {
      throw new Error('Resend did not confirm a reminder message ID.');
    }
    providerAccepted = true;
    return await markReminderSent({
      attemptId: attempt.id,
      providerMessageId: delivery.providerMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Email was not sent.';
    // Resend definitely refused it (a bad address, a rejected attachment,
    // a rate limit), so nothing went out: close the attempt as failed and
    // it can be sent again. Only an unknown outcome stays locked.
    const rejected =
      providerContacted &&
      !providerAccepted &&
      isDefiniteProviderRejection(error);
    if (attempt && ((newAttempt && !providerContacted) || rejected)) {
      try {
        await markReminderFailed({
          attemptId: attempt.id,
          errorMessage: rejected ? `Resend rejected it: ${message}` : message,
        });
      } catch (recordError) {
        console.error('Unable to close unsent reminder attempt.', recordError);
      }
      if (rejected)
        throw new Error(`Resend rejected this reminder: ${message}`);
    }
    if (providerContacted && attempt) {
      console.error('Reminder provider outcome needs reconciliation.', {
        campaignId,
        registrationId,
        attemptId: attempt.id,
        providerAccepted,
      });
      throw new Error(
        providerAccepted
          ? 'Resend accepted this reminder, but recording it failed. The send is locked for safe retry.'
          : 'The reminder outcome is uncertain. It is locked against a duplicate send; retry the same attempt after 10 minutes.'
      );
    }
    throw error;
  }
}

// Past Resend's 24-hour idempotency window a safe retry is impossible, so an
// admin can release the attempt (recorded as failed) after checking Resend.
export async function releaseReminderAttempt({ campaignId, registrationId }) {
  const attempt = await getActiveReminderAttempt({
    campaignId,
    registrationId,
  });
  if (!attempt)
    throw new Error('Unresolved send not found for this registrant.');
  if (Date.now() - Date.parse(attempt.created_at) < RETRY_BEFORE_MS) {
    throw new Error(
      'This send cannot be released yet. It can still be retried safely; release is only possible after 23 hours.'
    );
  }
  return markReminderFailed({
    attemptId: attempt.id,
    errorMessage:
      'Released by an admin after 23 hours without a confirmed outcome. Check Resend before sending again.',
  });
}
