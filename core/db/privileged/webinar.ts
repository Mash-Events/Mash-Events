import 'server-only';
import { getPrivilegedClient } from './client';

export type JoinResult =
  | { result: 'ok'; join_url: string }
  | {
      result: 'early';
      opens_at: string;
      starts_at: string | null;
      timezone: string;
      event_name: string;
    }
  | { result: 'ended' | 'no_link'; event_name: string }
  | { result: 'invalid' };

/** Records a join for a verified token of THIS event (event id first). */
export async function recordWebinarJoin(
  eventId: string,
  registrationId: string,
  ipHash: string
): Promise<JoinResult> {
  const { data, error } = await getPrivilegedClient().rpc(
    'record_webinar_join',
    {
      p_event_id: eventId,
      p_registration_id: registrationId,
      p_ip_hash: ipHash,
    }
  );
  if (error) throw error;
  return data as JoinResult;
}

export async function releaseDueMessageIntents(): Promise<number> {
  const { data, error } = await getPrivilegedClient().rpc(
    'release_due_message_intents'
  );
  if (error) throw error;
  return Number(data ?? 0);
}
