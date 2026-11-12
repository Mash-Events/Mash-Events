import 'server-only';
import { getPrivilegedClient } from './client';

// Privileged registration helpers. Event id first, always.

export type SubmitResult =
  | { result: 'created'; registration_id: string; code: string; status: string }
  | { result: 'duplicate'; registration_id?: string }
  | { result: 'closed' | 'full' | 'not_found' };

export type PublicEvent = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  status: string;
  settings: Record<string, unknown> | null;
};

/** Minimal event facts for a public route (id comes from host + slug). */
export async function getPublicEvent(
  eventId: string
): Promise<PublicEvent | null> {
  const { data, error } = await getPrivilegedClient()
    .from('events')
    .select('id, org_id, slug, name, status, settings')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data as PublicEvent | null;
}

export async function submitRegistration(
  eventId: string,
  payload: Record<string, unknown>,
  consentVersion: string
): Promise<SubmitResult> {
  const { data, error } = await getPrivilegedClient().rpc(
    'submit_registration',
    {
      p_event_id: eventId,
      p_payload: payload,
      p_consent_version: consentVersion,
    }
  );
  if (error) throw error;
  return data as SubmitResult;
}
