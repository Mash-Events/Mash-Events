import { getSupabaseAdmin } from '@/lib/supabase-admin';
import reminderUtils from '@/lib/reminder-utils.cjs';
import guestSendAttempt from '@/lib/guest-send-attempt.cjs';

const { RETRY_BEFORE_MS } = guestSendAttempt;

const {
  buildRecipientRows,
  normalizeAttachmentRow,
  normalizeCampaignInput,
  normalizeCampaignRow,
} = reminderUtils;

const CAMPAIGN_SELECT =
  'id,name,subject,body,content_version,created_by_email,updated_by_email,created_at,updated_at';
const ATTACHMENT_SELECT =
  'id,campaign_id,filename,storage_path,content_type,size_bytes,sha256,created_at';
const DELIVERY_SELECT =
  'id,registration_id,content_version,delivery_status,recipient_email,request_sha256,failure_reason,created_at';
const PAGE_SIZE = 1000;

function getSupabase() {
  return getSupabaseAdmin();
}

// PostgREST returns at most 1000 rows per request, so lists are read in
// pages until a short page comes back.
async function selectAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(
      from,
      from + PAGE_SIZE - 1
    );
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export class ReminderNotFoundError extends Error {
  constructor(message = 'Reminder not found.') {
    super(message);
    this.code = 'REMINDER_NOT_FOUND';
  }
}

export class ReminderAlreadySendingError extends Error {
  constructor() {
    super(
      'This reminder is already being sent to this registrant. Confirm its delivery before trying again.'
    );
    this.code = 'REMINDER_ALREADY_SENDING';
  }
}

async function getCampaignRow(id) {
  const { data, error } = await getSupabase()
    .from('reminder_campaigns')
    .select(CAMPAIGN_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ReminderNotFoundError();
  return data;
}

// Server-only: includes storage paths.
export async function listAttachmentRows(campaignId) {
  const { data, error } = await getSupabase()
    .from('reminder_campaign_attachments')
    .select(ATTACHMENT_SELECT)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listReminderCampaigns() {
  const supabase = getSupabase();
  const [{ data, error }, attachments, accepted] = await Promise.all([
    supabase
      .from('reminder_campaigns')
      .select(CAMPAIGN_SELECT)
      .order('created_at', { ascending: true })
      .limit(200),
    selectAll(() =>
      supabase
        .from('reminder_campaign_attachments')
        .select('campaign_id')
        .order('id', { ascending: true })
    ),
    selectAll(() =>
      supabase
        .from('reminder_deliveries')
        .select('campaign_id,registration_id')
        .eq('delivery_status', 'accepted')
        .order('id', { ascending: true })
    ),
  ]);
  if (error) throw new Error(error.message);

  const attachmentCounts = new Map();
  for (const row of attachments) {
    attachmentCounts.set(
      row.campaign_id,
      (attachmentCounts.get(row.campaign_id) || 0) + 1
    );
  }
  const reached = new Map();
  for (const row of accepted) {
    const set = reached.get(row.campaign_id) || new Set();
    set.add(row.registration_id);
    reached.set(row.campaign_id, set);
  }
  return (data || []).map((row) => ({
    ...normalizeCampaignRow(row),
    attachmentCount: attachmentCounts.get(row.id) || 0,
    sentCount: reached.get(row.id)?.size || 0,
  }));
}

export async function getReminderCampaign(id) {
  const [row, attachments] = await Promise.all([
    getCampaignRow(id),
    listAttachmentRows(id),
  ]);
  return {
    campaign: normalizeCampaignRow(row),
    attachments: attachments.map(normalizeAttachmentRow),
  };
}

// Server-only: the copy plus attachment storage paths for building emails.
export async function getReminderCampaignForSend(id) {
  const [row, attachments] = await Promise.all([
    getCampaignRow(id),
    listAttachmentRows(id),
  ]);
  return { campaign: normalizeCampaignRow(row), attachments };
}

export async function createReminderCampaign({ input, operator }) {
  const campaign = normalizeCampaignInput(input);
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from('reminder_campaigns')
    .insert({
      ...campaign,
      created_by_email: operator?.primaryEmail || null,
      updated_by_email: operator?.primaryEmail || null,
      created_at: now,
      updated_at: now,
    })
    .select(CAMPAIGN_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return normalizeCampaignRow(data);
}

// Copy and attachments stay fixed while a send could still be retried, so
// the retry rebuilds exactly the email first attempted. Attempts past the
// retry window can never be retried, so they no longer hold the lock.
export async function assertReminderEditable(campaignId) {
  const retryableSince = new Date(Date.now() - RETRY_BEFORE_MS).toISOString();
  const { data, error } = await getSupabase()
    .from('reminder_deliveries')
    .select('recipient_email')
    .eq('campaign_id', campaignId)
    .eq('delivery_status', 'sending')
    .gt('created_at', retryableSince)
    .limit(3);
  if (error) throw new Error(error.message);
  if (data?.length) {
    throw new Error(
      `This reminder cannot be changed while a send is unresolved (${data
        .map((row) => row.recipient_email)
        .join(', ')}). Wait for it to finish or retry it first.`
    );
  }
}

async function writeCampaign({ current, changes, operator }) {
  const { data, error } = await getSupabase()
    .from('reminder_campaigns')
    .update({
      ...changes,
      updated_by_email: operator?.primaryEmail || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)
    .eq('content_version', current.content_version)
    .select(CAMPAIGN_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      'This reminder changed in another window. Reload it and try again.'
    );
  }
  return normalizeCampaignRow(data);
}

// Renaming alone keeps the version; any copy change bumps it.
export async function updateReminderCampaign({ id, input, operator }) {
  const next = normalizeCampaignInput(input);
  const current = await getCampaignRow(id);
  const copyChanged =
    next.subject !== current.subject || next.body !== current.body;
  if (copyChanged) await assertReminderEditable(id);
  return writeCampaign({
    current,
    changes: {
      ...next,
      content_version: current.content_version + (copyChanged ? 1 : 0),
    },
    operator,
  });
}

export async function bumpReminderContentVersion({ id, operator }) {
  const current = await getCampaignRow(id);
  return writeCampaign({
    current,
    changes: { content_version: current.content_version + 1 },
    operator,
  });
}

export async function insertReminderAttachment(row) {
  const { data, error } = await getSupabase()
    .from('reminder_campaign_attachments')
    .insert(row)
    .select(ATTACHMENT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getReminderAttachmentRow({ campaignId, attachmentId }) {
  const { data, error } = await getSupabase()
    .from('reminder_campaign_attachments')
    .select(ATTACHMENT_SELECT)
    .eq('id', attachmentId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ReminderNotFoundError('Attachment not found.');
  return data;
}

export async function deleteReminderAttachmentRow({
  campaignId,
  attachmentId,
}) {
  const { data, error } = await getSupabase()
    .from('reminder_campaign_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('campaign_id', campaignId)
    .select(ATTACHMENT_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ReminderNotFoundError('Attachment not found.');
  return data;
}

// Only a reminder that has never been sent to anyone can be removed.
export async function deleteReminderCampaign(id) {
  await getCampaignRow(id);
  const { count, error: countError } = await getSupabase()
    .from('reminder_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id);
  if (countError) throw new Error(countError.message);
  if (count) {
    throw new Error(
      'A reminder that has already been sent cannot be removed. Its send history is kept.'
    );
  }
  const attachments = await listAttachmentRows(id);
  const { error } = await getSupabase()
    .from('reminder_campaigns')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
  return attachments;
}

export async function listConfirmedRegistrations() {
  return selectAll(() =>
    getSupabase()
      .from('event_registrations')
      .select('id,first_name,last_name,email,organization,attendee_category')
      .eq('status', 'confirmed')
      .order('first_name', { ascending: true })
      .order('id', { ascending: true })
  );
}

export async function listReminderRecipients(campaignId) {
  await getCampaignRow(campaignId);
  const [registrations, deliveries] = await Promise.all([
    listConfirmedRegistrations(),
    selectAll(() =>
      getSupabase()
        .from('reminder_deliveries')
        .select(DELIVERY_SELECT)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
    ),
  ]);
  return buildRecipientRows({ registrations, deliveries });
}

// A retry finishes an attempt already made, so it skips the confirmed check.
export async function getConfirmedRegistration(
  id,
  { requireConfirmed = true } = {}
) {
  const { data, error } = await getSupabase()
    .from('event_registrations')
    .select('id,first_name,last_name,email,status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ReminderNotFoundError('Registrant not found.');
  if (requireConfirmed && data.status !== 'confirmed') {
    throw new Error('This registrant is no longer confirmed.');
  }
  return data;
}

export async function hasAcceptedReminder({ campaignId, registrationId }) {
  const { count, error } = await getSupabase()
    .from('reminder_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('registration_id', registrationId)
    .eq('delivery_status', 'accepted');
  if (error) throw new Error(error.message);
  return Boolean(count);
}

export async function getActiveReminderAttempt({ campaignId, registrationId }) {
  const { data, error } = await getSupabase()
    .from('reminder_deliveries')
    .select(
      'id,registration_id,content_version,recipient_email,recipient_name,delivery_status,request_sha256,created_at'
    )
    .eq('campaign_id', campaignId)
    .eq('registration_id', registrationId)
    .eq('delivery_status', 'sending')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function claimReminderSend({
  campaignId,
  registrationId,
  contentVersion,
  resend,
  operator,
}) {
  const { data, error } = await getSupabase().rpc('claim_reminder_send', {
    p_campaign_id: campaignId,
    p_registration_id: registrationId,
    p_expected_content_version: contentVersion,
    p_resend: Boolean(resend),
    p_actor_clerk_id: operator?.userId || null,
    p_actor_email: operator?.primaryEmail || null,
  });
  if (error) {
    if (error.code === '23505') throw new ReminderAlreadySendingError();
    if (error.code === 'P0002') throw new ReminderNotFoundError();
    if (error.code === 'P0001') throw new Error(error.message);
    throw new Error(error.message);
  }
  if (!data) throw new ReminderAlreadySendingError();
  return data;
}

async function finishReminderSend(params) {
  const { data, error } = await getSupabase().rpc(
    'finish_reminder_send',
    params
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Unable to record the reminder delivery.');
  return data;
}

export function markReminderSent({ attemptId, providerMessageId }) {
  return finishReminderSend({
    p_attempt_id: attemptId,
    p_outcome: 'accepted',
    p_provider_message_id: providerMessageId,
  });
}

export function markReminderFailed({ attemptId, errorMessage }) {
  return finishReminderSend({
    p_attempt_id: attemptId,
    p_outcome: 'failed',
    p_failure_reason: String(errorMessage || 'Email was not sent.').slice(
      0,
      1000
    ),
  });
}

export async function prepareReminderSendRequest(attemptId, requestSha256) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reminder_deliveries')
    .update({
      request_sha256: requestSha256,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .eq('delivery_status', 'sending')
    .is('request_sha256', null)
    .select('request_sha256')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;

  const { data: existing, error: lookupError } = await supabase
    .from('reminder_deliveries')
    .select('request_sha256,delivery_status')
    .eq('id', attemptId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (
    existing?.delivery_status !== 'sending' ||
    existing.request_sha256 !== requestSha256
  ) {
    throw new Error(
      'The reminder email changed since this attempt began. Check Resend before retrying.'
    );
  }
}
