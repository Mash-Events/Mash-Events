import MessageClient from '@azure-rest/communication-messages';
import type { ClaimedItem } from '../db/privileged/messaging';

// WhatsApp channel (docs/system-design.md §8.1, S19). Azure Communication
// Services Advanced Messaging with pre-registered Meta templates —
// confirmations to opted-in registrants only. The transport is inert unless
// the whole channel is configured; queued items then simply wait.

export type WhatsAppConfig = {
  enabled: boolean;
  connectionString: string;
  channelRegistrationId: string;
  templateLanguage: string;
  templates: { confirmed: string };
  confirmedParams: string[];
};

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; retryable: boolean; error: string };

function readEnv(name: string): string {
  return process.env[name]?.trim() || '';
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getWhatsAppConfig(): WhatsAppConfig {
  const confirmedParams = parseList(
    readEnv('AZURE_WHATSAPP_TEMPLATE_CONFIRMED_PARAMS')
  );
  return {
    enabled: readEnv('AZURE_WHATSAPP_ENABLED').toLowerCase() === 'true',
    connectionString: readEnv('AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING'),
    channelRegistrationId: readEnv('AZURE_WHATSAPP_CHANNEL_REGISTRATION_ID'),
    templateLanguage: readEnv('AZURE_WHATSAPP_TEMPLATE_LANGUAGE') || 'en_US',
    templates: {
      confirmed: readEnv('AZURE_WHATSAPP_TEMPLATE_CONFIRMED'),
    },
    confirmedParams: confirmedParams.length
      ? confirmedParams
      : ['firstName', 'eventName'],
  };
}

export function isWhatsAppConfigured(
  config: WhatsAppConfig = getWhatsAppConfig()
): boolean {
  return Boolean(
    config.enabled && config.connectionString && config.channelRegistrationId
  );
}

/** Template parameter values, all event-scoped from the claimed item. */
export function whatsAppParamValue(name: string, item: ClaimedItem): string {
  switch (name) {
    case 'firstName':
      return item.first_name ?? '';
    case 'fullName':
      return [item.first_name, item.last_name].filter(Boolean).join(' ');
    case 'eventName':
      return item.event_name ?? '';
    case 'registrationCode':
      return item.registration_code ?? '';
    default:
      return '';
  }
}

type MinimalClient = {
  path: (path: string) => {
    post: (request: {
      contentType: string;
      body: Record<string, unknown>;
    }) => Promise<{
      status: number;
      body?: unknown;
    }>;
  };
};

export async function sendWhatsAppTemplate(
  item: ClaimedItem,
  config: WhatsAppConfig,
  createClient: (config: WhatsAppConfig) => MinimalClient = (c) =>
    MessageClient(c.connectionString) as unknown as MinimalClient
): Promise<WhatsAppSendResult> {
  const templateName = config.templates.confirmed;
  if (!templateName) {
    return { ok: false, retryable: false, error: 'template_not_configured' };
  }
  const to = item.recipient;
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    return { ok: false, retryable: false, error: 'invalid_phone' };
  }

  const paramNames = config.confirmedParams;
  let result: { status: number; body?: unknown };
  try {
    result = await createClient(config)
      .path('/messages/notifications:send')
      .post({
        contentType: 'application/json',
        body: {
          channelRegistrationId: config.channelRegistrationId,
          to: [to],
          kind: 'template',
          template: {
            name: templateName,
            language: config.templateLanguage,
            bindings: {
              kind: 'whatsApp',
              body: paramNames.map((name) => ({ refValue: name })),
            },
            values: paramNames.map((name) => ({
              kind: 'text',
              name,
              text: whatsAppParamValue(name, item),
            })),
          },
        },
      });
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: error instanceof Error ? error.message.slice(0, 200) : 'network',
    };
  }

  if (result.status < 200 || result.status >= 300) {
    const body = result.body as
      { error?: { message?: string }; message?: string } | undefined;
    const details =
      body?.error?.message ||
      body?.message ||
      `azure whatsapp failed with status ${result.status}`;
    return {
      ok: false,
      retryable: result.status === 429 || result.status >= 500,
      error: details.slice(0, 200),
    };
  }

  const receipts =
    (result.body as { receipts?: { messageId?: string }[] } | undefined)
      ?.receipts ?? [];
  return { ok: true, providerMessageId: receipts[0]?.messageId ?? null };
}
