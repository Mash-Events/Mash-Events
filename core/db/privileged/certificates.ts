import 'server-only';
import { getPrivilegedClient } from './client';
import { certSecret, signCertToken } from '../../certificates/cert-token';

// Certificate plumbing for the drainer, the public claim page and the
// verify page (docs/system-design.md §9.1 phase 3). Service role: callers
// verify what they need; status is always re-checked here.

export type CertClaimEvent = {
  id: string;
  name: string;
  status: string;
  kind: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  pass_key_version: number;
  org_name: string;
};

/** Event facts for the public certificate pages (no PII). */
export async function getCertEvent(
  eventId: string
): Promise<CertClaimEvent | null> {
  const { data, error } = await getPrivilegedClient()
    .from('events')
    .select(
      'id, name, status, kind, timezone, starts_at, ends_at, pass_key_version, organizations(name)'
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
    ends_at: data.ends_at,
    pass_key_version: Number(data.pass_key_version ?? 1),
    org_name: org?.name ?? '',
  };
}

/**
 * The claim token for a registration's issued certificate, or null when the
 * registration has no (live) certificate. Deterministic: re-sent emails
 * re-derive the same link. Key rotation rides the event's pass_key_version.
 */
export async function certificateClaimToken(
  eventId: string,
  registrationId: string
): Promise<string | null> {
  const secret = certSecret();
  if (!secret) return null;
  const privileged = getPrivilegedClient();
  const { data, error } = await privileged
    .from('event_certificates')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('registration_id', registrationId)
    .eq('status', 'issued')
    .maybeSingle();
  if (error || !data) return null;
  const { data: event } = await privileged
    .from('events')
    .select('pass_key_version')
    .eq('id', eventId)
    .maybeSingle();
  return signCertToken(
    secret,
    eventId,
    data.id,
    Number(event?.pass_key_version ?? 1)
  );
}

export type CertClaimData = {
  cert_status: string;
  code: string;
  first_name: string;
  last_name: string;
  issued_at: string;
  registration_status: string;
};

/** Certificate + registration facts for one certificate id of one event. */
export async function getCertClaimData(
  eventId: string,
  certId: string
): Promise<CertClaimData | null> {
  const { data, error } = await getPrivilegedClient()
    .from('event_certificates')
    .select(
      'status, code, issued_at, registrations(status, first_name, last_name)'
    )
    .eq('id', certId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error || !data) return null;
  const reg = data.registrations as unknown as {
    status: string;
    first_name: string;
    last_name: string;
  } | null;
  return {
    cert_status: data.status,
    code: data.code,
    issued_at: data.issued_at,
    first_name: reg?.first_name ?? '',
    last_name: reg?.last_name ?? '',
    registration_status: reg?.status ?? '',
  };
}

/** Public verify lookup by certificate code; name only, no contact data. */
export async function getCertByCode(
  eventId: string,
  code: string
): Promise<{
  status: string;
  first_name: string;
  last_name: string;
  issued_at: string;
  revoked_at: string | null;
} | null> {
  const { data, error } = await getPrivilegedClient()
    .from('event_certificates')
    .select(
      'status, issued_at, revoked_at, registrations(first_name, last_name)'
    )
    .eq('event_id', eventId)
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  const reg = data.registrations as unknown as {
    first_name: string;
    last_name: string;
  } | null;
  return {
    status: data.status,
    first_name: reg?.first_name ?? '',
    last_name: reg?.last_name ?? '',
    issued_at: data.issued_at,
    revoked_at: data.revoked_at,
  };
}

/**
 * The permanent record: after the retention purge removes the live rows,
 * the slim registry (name as printed, event name, dates, status) still
 * answers the public verify page.
 */
export async function getRegistryCert(
  eventId: string,
  code: string
): Promise<{
  status: string;
  name: string;
  event_dates: string | null;
  issued_at: string;
} | null> {
  const { data, error } = await getPrivilegedClient()
    .from('event_certificate_registry')
    .select('status, name, event_dates, issued_at')
    .eq('event_id', eventId)
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    status: string;
    name: string;
    event_dates: string | null;
    issued_at: string;
  };
}
