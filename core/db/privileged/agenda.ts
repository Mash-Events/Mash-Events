import 'server-only';
import { getPrivilegedClient } from './client';
import type { AgendaSession } from '../../agenda/agenda-pdf';

// Agenda facts for the mail drainer's attachment builder
// (docs/system-design.md §8). Public schedule data only.

export async function getAgendaSessions(
  eventId: string
): Promise<AgendaSession[]> {
  const { data, error } = await getPrivilegedClient()
    .from('event_sessions')
    .select(
      'id, title, starts_at, ends_at, room, track, event_session_speakers(event_speakers(name))'
    )
    .eq('event_id', eventId)
    .eq('visible', true)
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => {
    const speakers =
      (row.event_session_speakers as unknown as
        { event_speakers: { name: string } }[] | null) ?? [];
    return {
      title: row.title,
      startsAt: row.starts_at ?? '',
      endsAt: row.ends_at ?? '',
      room: row.room,
      track: row.track,
      speakers: speakers
        .map((s) => s.event_speakers?.name)
        .filter(Boolean) as string[],
    };
  });
}
