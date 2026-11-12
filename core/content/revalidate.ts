import 'server-only';
import { revalidateTag } from 'next/cache';
import { contentTag } from './public';

/**
 * Called after an admin changes an event or its content. `expire: 0` so the
 * next visitor sees the change (e.g. registration opening), not a stale page.
 */
export function revalidateEventContent(eventId: string) {
  revalidateTag(contentTag(eventId), { expire: 0 });
}

/** Directory tag: the public events listing on the platform's main domain. */
export const directoryTag = 'platform:directory';

/**
 * Called after an admin toggles `events.listed` (or changes an event so the
 * directory card needs a refresh).
 */
export function revalidateDirectory() {
  revalidateTag(directoryTag, { expire: 0 });
}
