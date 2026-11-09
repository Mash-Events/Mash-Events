import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildQrPngBuffer } from '@/lib/registration-pass';
import { PASS_IMAGE_BUCKET } from '@/lib/registration-utils';
import passUtils from '@/lib/registration-pass-utils.cjs';

const { buildPassImageStoragePath } = passUtils;

let bucketEnsured = false;

async function ensurePassImageBucket(supabase) {
  if (bucketEnsured) {
    return;
  }

  const existing = await supabase.storage.getBucket(PASS_IMAGE_BUCKET);

  if (existing.error) {
    const createResult = await supabase.storage.createBucket(
      PASS_IMAGE_BUCKET,
      {
        public: true,
        allowedMimeTypes: ['image/png'],
        fileSizeLimit: 512 * 1024,
      }
    );

    if (
      createResult.error &&
      !/already exists/i.test(createResult.error.message || '')
    ) {
      throw new Error(
        createResult.error.message ||
          'Unable to create pass image storage bucket.'
      );
    }
  } else if (!existing.data?.public) {
    const updateResult = await supabase.storage.updateBucket(
      PASS_IMAGE_BUCKET,
      {
        public: true,
        allowedMimeTypes: ['image/png'],
        fileSizeLimit: 512 * 1024,
      }
    );

    if (updateResult.error) {
      throw new Error(
        updateResult.error.message ||
          'Unable to update pass image storage bucket.'
      );
    }
  }

  bucketEnsured = true;
}

export async function uploadPassQrImage({ passId, registrationId, token }) {
  const normalizedPassId = String(passId || '').trim();
  const normalizedRegistrationId = String(registrationId || '').trim();
  const normalizedToken = String(token || '').trim();

  if (!normalizedPassId || !normalizedRegistrationId || !normalizedToken) {
    throw new Error(
      'Pass ID, registration ID, and token are required for QR image upload.'
    );
  }

  const supabase = getSupabaseAdmin();
  await ensurePassImageBucket(supabase);

  const qrImageBuffer = await buildQrPngBuffer(normalizedToken);
  const storagePath = buildPassImageStoragePath({
    passId: normalizedPassId,
    registrationId: normalizedRegistrationId,
  });

  const uploadResult = await supabase.storage
    .from(PASS_IMAGE_BUCKET)
    .upload(storagePath, qrImageBuffer, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '31536000',
    });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message || 'Unable to upload QR image.');
  }

  const publicUrlResult = supabase.storage
    .from(PASS_IMAGE_BUCKET)
    .getPublicUrl(storagePath);
  const publicUrl = publicUrlResult.data?.publicUrl || '';

  if (!publicUrl) {
    throw new Error('Unable to build a public QR image URL.');
  }

  return {
    bucket: PASS_IMAGE_BUCKET,
    path: storagePath,
    publicUrl,
  };
}
