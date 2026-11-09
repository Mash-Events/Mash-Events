import { createHash, randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sniffImageMimeType } from '@/lib/upload-validation';
import {
  assertReminderEditable,
  bumpReminderContentVersion,
  deleteReminderAttachmentRow,
  getReminderCampaign,
  insertReminderAttachment,
  listAttachmentRows,
} from '@/lib/reminder-db';
import reminderUtils from '@/lib/reminder-utils.cjs';

const {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  sanitizeAttachmentFilename,
} = reminderUtils;

export const REMINDER_ATTACHMENT_BUCKET = 'reminder-attachments';

function storage() {
  return getSupabaseAdmin().storage.from(REMINDER_ATTACHMENT_BUCKET);
}

function formatMegabytes(bytes) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

// The type comes from the file's own bytes, never its name or the browser's
// claim, so a renamed executable cannot go out as "agenda.pdf".
function sniffAttachmentType(buffer) {
  if (buffer.length >= 5 && buffer.toString('latin1', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }
  return sniffImageMimeType(buffer);
}

export async function downloadReminderAttachment(path) {
  const { data, error } = await storage().download(path);
  if (error || !data) {
    throw new Error(error?.message || 'Unable to read the stored attachment.');
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function removeReminderAttachmentFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await storage().remove(list);
  if (error) throw new Error(error.message || 'Unable to remove attachments.');
}

export async function addReminderAttachment({ campaignId, file, operator }) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Choose a file to attach.');
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Each attachment must be ${formatMegabytes(MAX_ATTACHMENT_BYTES)} or smaller. This file is too large.`
    );
  }
  await getReminderCampaign(campaignId);
  await assertReminderEditable(campaignId);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) throw new Error('The file is empty.');
  const contentType = sniffAttachmentType(buffer);
  if (!ATTACHMENT_TYPES[contentType]) {
    throw new Error('Attach only PDF, PNG or JPG files.');
  }

  const existing = await listAttachmentRows(campaignId);
  if (existing.length >= MAX_ATTACHMENTS) {
    throw new Error(`Add at most ${MAX_ATTACHMENTS} attachments.`);
  }
  const total =
    existing.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0) +
    buffer.length;
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachments must add up to ${formatMegabytes(MAX_TOTAL_ATTACHMENT_BYTES)} or less. These would be ${formatMegabytes(total)}, which is too large.`
    );
  }

  const id = randomUUID();
  const path = `${campaignId}/${id}.${ATTACHMENT_TYPES[contentType]}`;
  const { error } = await storage().upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Unable to store the file.');

  let inserted = false;
  try {
    const row = await insertReminderAttachment({
      id,
      campaign_id: campaignId,
      filename: sanitizeAttachmentFilename(file.name, contentType),
      storage_path: path,
      content_type: contentType,
      size_bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      created_by_email: operator?.primaryEmail || null,
    });
    inserted = true;
    await bumpReminderContentVersion({ id: campaignId, operator });
    return row;
  } catch (recordError) {
    // Undo both halves, so no row is left pointing at a removed file.
    if (inserted) {
      await deleteReminderAttachmentRow({ campaignId, attachmentId: id }).catch(
        () => {}
      );
    }
    await removeReminderAttachmentFiles([path]).catch(() => {});
    throw recordError;
  }
}

export async function removeReminderAttachment({
  campaignId,
  attachmentId,
  operator,
}) {
  await assertReminderEditable(campaignId);
  const removed = await deleteReminderAttachmentRow({
    campaignId,
    attachmentId,
  });
  await bumpReminderContentVersion({ id: campaignId, operator });
  try {
    await removeReminderAttachmentFiles([removed.storage_path]);
  } catch (storageError) {
    console.error('Removed attachment, but not its stored file.', storageError);
  }
  return removed;
}

// Copies every attachment of one reminder into another, for "Duplicate".
export async function copyReminderAttachments({ fromId, toId, operator }) {
  const rows = await listAttachmentRows(fromId);
  for (const row of rows) {
    const id = randomUUID();
    const path = `${toId}/${id}.${ATTACHMENT_TYPES[row.content_type]}`;
    const { error } = await storage().copy(row.storage_path, path);
    if (error) throw new Error(error.message || 'Unable to copy attachments.');
    await insertReminderAttachment({
      id,
      campaign_id: toId,
      filename: row.filename,
      storage_path: path,
      content_type: row.content_type,
      size_bytes: row.size_bytes,
      sha256: row.sha256,
      created_by_email: operator?.primaryEmail || null,
    });
  }
  return rows.length;
}
