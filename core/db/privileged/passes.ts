import 'server-only';
import { getPrivilegedClient } from './client';
import { passSecret, signPassToken } from '../../passes/pass-token';
import { sha256Hex } from '../../security/rate-limit';

// QR pass plumbing for the drainer and the public pass page
// (docs/system-design.md §9.1). Service role: callers have already verified
// what they needed; the RPC re-checks registration status anyway.

type IssuePassRow = {
  pass_id: string;
  key_version: number;
  existing: boolean;
};

export type PassPageEvent = {
  id: string;
  name: string;
  status: string;
  kind: string;
  timezone: string;
  starts_at: string | null;
  pass_key_version: number;
  org_name: string;
};

/**
 * Get-or-issue the live QR pass for a confirmed registration and return the
 * signed token. Idempotent: re-drains re-derive the same token from the
 * existing pass row.
 */
export async function issueQrPass(
  eventId: string,
  registrationId: string
): Promise<string | null> {
  const secret = passSecret();
  if (!secret) return null;
  const privileged = getPrivilegedClient();

  const { data: event, error: eventError } = await privileged
    .from('events')
    .select('pass_key_version')
    .eq('id', eventId)
    .maybeSingle();
  if (eventError || !event) {
    console.error('issueQrPass: event missing', {
      eventId,
      code: eventError?.code,
    });
    return null;
  }
  const keyVersion = Number(event.pass_key_version ?? 1);

  const passId = crypto.randomUUID();
  const token = await signPassToken(secret, eventId, passId, keyVersion);
  const { data, error } = await privileged.rpc('issue_pass', {
    p_event_id: eventId,
    p_registration_id: registrationId,
    p_kind: 'qr',
    p_token_hash_hex: await sha256Hex(token),
    p_key_version: keyVersion,
    p_pass_id: passId,
  });
  if (error) {
    console.error('issue_pass failed', { eventId, code: error.code });
    return null;
  }
  const row = (data ?? null) as IssuePassRow | null;
  if (!row?.pass_id) return null;
  // An existing live pass may carry a different id (or key version): the
  // token is deterministic, so just re-derive it from the returned row.
  if (row.pass_id === passId) return token;
  return signPassToken(
    secret,
    eventId,
    row.pass_id,
    Number(row.key_version ?? 1)
  );
}

/** Event facts for the public pass page (no PII). */
export async function getPassPageEvent(
  eventId: string
): Promise<PassPageEvent | null> {
  const { data, error } = await getPrivilegedClient()
    .from('events')
    .select(
      'id, name, status, kind, timezone, starts_at, pass_key_version, organizations(name)'
    )
    .eq('id', eventId)
    .maybeSingle();
  if (error || !data) return null;
  const org = data.organizations as unknown as { name: string } | null;
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    kind: data.kind,
    timezone: data.timezone,
    starts_at: data.starts_at,
    pass_key_version: Number(data.pass_key_version ?? 1),
    org_name: org?.name ?? '',
  };
}

export type PassPageData = {
  pass_status: string;
  registration_status: string;
  code: string;
  first_name: string;
  last_name: string;
};

/** Pass + registration facts for one pass id of one event. */
export async function getPassPageData(
  eventId: string,
  passId: string
): Promise<PassPageData | null> {
  const { data, error } = await getPrivilegedClient()
    .from('passes')
    .select('status, registrations(status, code, first_name, last_name)')
    .eq('id', passId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error || !data) return null;
  const reg = data.registrations as unknown as {
    status: string;
    code: string;
    first_name: string;
    last_name: string;
  } | null;
  return {
    pass_status: data.status,
    registration_status: reg?.status ?? '',
    code: reg?.code ?? '',
    first_name: reg?.first_name ?? '',
    last_name: reg?.last_name ?? '',
  };
}
