import 'server-only';
import { getPrivilegedClient } from './client';

// Privileged queue access for the drainer and webhooks. Event id first.

export type ClaimedItem = {
  item_id: string;
  lease_id: string;
  template_key: string;
  recipient: string;
  attempts: number;
  registration_id: string;
  registration_code: string;
  first_name: string;
  last_name: string;
  registration_status: string;
  event_id: string;
  event_name: string;
  event_slug: string;
  event_kind: string;
  event_timezone: string;
  event_starts_at: string | null;
  event_ends_at: string | null;
  org_id: string;
  org_name: string;
  org_slug: string;
  from_name: string | null;
  reply_to: string | null;
  subject_override: string | null;
  job_subject: string | null;
  job_body: string | null;
  include_join_link: boolean;
  /** Attachment kinds requested for this item's job (docs §8). */
  attachments: string[] | null;
};

export async function eventsWithDueMessages(
  channel: 'email' | 'whatsapp',
  limit = 20
): Promise<string[]> {
  const { data, error } = await getPrivilegedClient().rpc(
    'message_events_due',
    {
      p_channel: channel,
      p_limit: limit,
    }
  );
  if (error) throw error;
  return (data ?? []).map((row: { event_id: string }) => row.event_id);
}

export async function claimMessageItems(
  eventId: string,
  channel: 'email' | 'whatsapp',
  limit: number
): Promise<ClaimedItem[]> {
  const { data, error } = await getPrivilegedClient().rpc(
    'claim_message_items',
    {
      p_event_id: eventId,
      p_channel: channel,
      p_limit: limit,
      p_lease_seconds: 120,
    }
  );
  if (error) throw error;
  return (data ?? []) as ClaimedItem[];
}

export async function finishMessageItem(
  eventId: string,
  itemId: string,
  leaseId: string,
  outcome: 'sent' | 'retry' | 'failed',
  providerMessageId?: string,
  errorText?: string
): Promise<boolean> {
  const { data, error } = await getPrivilegedClient().rpc(
    'finish_message_item',
    {
      p_event_id: eventId,
      p_item_id: itemId,
      p_lease_id: leaseId,
      p_outcome: outcome,
      p_provider_message_id: providerMessageId ?? null,
      p_error: errorText ?? null,
    }
  );
  if (error) throw error;
  return Boolean(data);
}

export async function recordDelivery(
  provider: 'resend' | 'azure_acs',
  providerMessageId: string,
  status: string,
  tagEventId: string | null
): Promise<string> {
  const { data, error } = await getPrivilegedClient().rpc(
    'record_message_delivery',
    {
      p_provider: provider,
      p_provider_message_id: providerMessageId,
      p_status: status,
      p_tag_event_id: tagEventId,
    }
  );
  if (error) throw error;
  return String(data);
}
