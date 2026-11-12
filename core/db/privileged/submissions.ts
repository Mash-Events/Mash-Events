import 'server-only';
import { getPrivilegedClient } from './client';

// Privileged submission helpers (docs/system-design.md §16.4). Event id
// first, always; the public route has already checked the proxy marker,
// origin, rate limits and body schema before calling these.

export type SubmitSubmissionResult = { result: 'received' | 'not_found' };

export async function submitSubmission(
  eventId: string,
  input: {
    kind: string;
    name: string;
    email: string;
    message: string;
    payload: Record<string, unknown>;
  }
): Promise<SubmitSubmissionResult> {
  const { data, error } = await getPrivilegedClient().rpc('submit_submission', {
    p_event_id: eventId,
    p_kind: input.kind,
    p_name: input.name,
    p_email: input.email,
    p_message: input.message,
    p_payload: input.payload,
  });
  if (error) throw error;
  return data as SubmitSubmissionResult;
}
