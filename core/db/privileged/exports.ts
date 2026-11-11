import 'server-only';
import { getPrivilegedClient } from './client';

// Private-bucket export storage (docs/system-design.md §12.11): files land
// under event-private/<event_id>/exports/ and are only ever handed out as
// short-TTL signed URLs created server-side.

const SIGNED_URL_TTL_SECONDS = 600;

export async function storeExportFile(
  eventId: string,
  fileName: string,
  content: Buffer,
  contentType: string
): Promise<{ path: string; url: string; expiresIn: number }> {
  const path = `${eventId}/exports/${fileName}`;
  const storage = getPrivilegedClient().storage.from('event-private');

  const { error: uploadError } = await storage.upload(path, content, {
    contentType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data, error: urlError } = await storage.createSignedUrl(
    path,
    SIGNED_URL_TTL_SECONDS
  );
  if (urlError || !data?.signedUrl)
    throw urlError ?? new Error('no signed url');

  return {
    path,
    url: data.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  };
}
