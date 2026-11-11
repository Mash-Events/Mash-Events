import 'server-only';
import { getPrivilegedClient } from './client';

// Retention purge (docs/system-design.md §13, migration 20261111120000).
// Deletes attendee personal data for events past their retention window.

export async function purgeDueEventData(limit = 50): Promise<{
  eventsPurged: number;
}> {
  const { data, error } = await getPrivilegedClient().rpc(
    'purge_due_event_data',
    { p_limit: limit }
  );
  if (error) throw error;
  const result = (data ?? {}) as { events_purged?: number };
  return { eventsPurged: Number(result.events_purged ?? 0) };
}
