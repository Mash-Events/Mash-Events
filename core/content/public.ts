import 'server-only';
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { EventContent } from '../site/types';

// Public event content for static/ISR pages (docs/system-design.md §10.1,
// §12.9). Uses the anon key and public_event_content() only — no cookies, no
// service role — so the result is safe to cache and share. The cache key and
// tag always carry the event id.

export const contentTag = (eventId: string) => `event:${eventId}:content`;

async function fetchContent(eventId: string): Promise<EventContent | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc('public_event_content', {
    p_event_id: eventId,
  });
  if (error) {
    console.error('public_event_content failed', { eventId, code: error.code });
    throw new Error('content unavailable');
  }
  return (data as EventContent | null) ?? null;
}

export function getPublicEventContent(
  eventId: string
): Promise<EventContent | null> {
  return unstable_cache(
    () => fetchContent(eventId),
    ['event', eventId, 'content'],
    { tags: [contentTag(eventId)], revalidate: 3600 }
  )();
}
