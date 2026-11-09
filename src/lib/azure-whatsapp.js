import MessageClient, {
  isUnexpected,
} from '@azure-rest/communication-messages';
import { EVENT_CONFIG } from '@/lib/registration-constants';

const DEFAULT_HIGH_PRIORITY_TEMPLATES = new Set([
  'confirmed',
  'qr_pass_issued',
]);

let client;

function readEnv(name) {
  return process.env[name]?.trim() || '';
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getHighPriorityTemplates() {
  const configured = parseList(
    readEnv('AZURE_WHATSAPP_HIGH_PRIORITY_TEMPLATES')
  );
  return new Set(
    configured.length ? configured : DEFAULT_HIGH_PRIORITY_TEMPLATES
  );
}

export function getAzureWhatsAppConfig() {
  const connectionString = readEnv(
    'AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING'
  );
  const channelRegistrationId = readEnv(
    'AZURE_WHATSAPP_CHANNEL_REGISTRATION_ID'
  );

  return {
    enabled: readEnv('AZURE_WHATSAPP_ENABLED').toLowerCase() === 'true',
    connectionString,
    channelRegistrationId,
    templateLanguage: readEnv('AZURE_WHATSAPP_TEMPLATE_LANGUAGE') || 'en_US',
    defaultCountryCode: readEnv('AZURE_WHATSAPP_DEFAULT_COUNTRY_CODE'),
    templateByType: {
      confirmed: readEnv('AZURE_WHATSAPP_TEMPLATE_CONFIRMED'),
      qr_pass_issued: readEnv('AZURE_WHATSAPP_TEMPLATE_QR_PASS_ISSUED'),
    },
    templateParamsByType: {
      confirmed:
        parseList(readEnv('AZURE_WHATSAPP_TEMPLATE_CONFIRMED_PARAMS')).length >
        0
          ? parseList(readEnv('AZURE_WHATSAPP_TEMPLATE_CONFIRMED_PARAMS'))
          : ['firstName', 'eventName'],
      qr_pass_issued:
        parseList(readEnv('AZURE_WHATSAPP_TEMPLATE_QR_PASS_ISSUED_PARAMS'))
          .length > 0
          ? parseList(readEnv('AZURE_WHATSAPP_TEMPLATE_QR_PASS_ISSUED_PARAMS'))
          : ['firstName', 'registrationCode'],
    },
    highPriorityTemplates: getHighPriorityTemplates(),
  };
}

export function isAzureWhatsAppConfigured(config = getAzureWhatsAppConfig()) {
  return Boolean(
    config.enabled && config.connectionString && config.channelRegistrationId
  );
}

function getClient(config) {
  if (!client) {
    client = MessageClient(config.connectionString);
  }

  return client;
}

export function normalizeWhatsAppRecipientPhone({
  phone,
  country,
  defaultCountryCode = '',
} = {}) {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  const compact = raw.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(compact)) {
    return compact;
  }

  const digits = compact.replace(/\D/g, '');
  const normalizedCountry = String(country || '')
    .trim()
    .toLowerCase();
  const fallbackCountryCode = defaultCountryCode.replace(/\D/g, '');
  const canAssumeIndia =
    (!fallbackCountryCode || fallbackCountryCode === '91') &&
    (normalizedCountry === 'india' || normalizedCountry === 'in');

  if (canAssumeIndia && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }

  if (fallbackCountryCode && digits.length >= 8 && digits.length <= 14) {
    return `+${fallbackCountryCode}${digits}`;
  }

  return '';
}

function getTemplateParamValue(name, registration) {
  const values = {
    firstName: registration.first_name,
    fullName: [registration.first_name, registration.last_name]
      .filter(Boolean)
      .join(' '),
    eventName: EVENT_CONFIG.name,
    eventShortName: EVENT_CONFIG.shortName,
    registrationCode: registration.registration_code,
    contactEmail: EVENT_CONFIG.contactEmail,
  };

  return String(values[name] || '');
}

function buildTemplate({ templateName, language, paramNames, registration }) {
  const values = paramNames.map((name) => ({
    kind: 'text',
    name,
    text: getTemplateParamValue(name, registration),
  }));

  return {
    name: templateName,
    language,
    bindings: {
      kind: 'whatsApp',
      body: paramNames.map((name) => ({ refValue: name })),
    },
    values,
  };
}

export async function sendRegistrationWhatsAppNotification({
  registration,
  templateType,
  config = getAzureWhatsAppConfig(),
} = {}) {
  if (!config.highPriorityTemplates.has(templateType)) {
    return { sent: false, skipped: true, reason: 'not_high_priority' };
  }

  const templateName = config.templateByType[templateType];
  if (!isAzureWhatsAppConfigured(config) || !templateName) {
    return { sent: false, skipped: true, reason: 'not_configured' };
  }

  const to = normalizeWhatsAppRecipientPhone({
    phone: registration.phone,
    country: registration.country,
    defaultCountryCode: config.defaultCountryCode,
  });

  if (!to) {
    return { sent: false, skipped: true, reason: 'invalid_phone' };
  }

  const messageClient = getClient(config);
  const result = await messageClient.path('/messages/notifications:send').post({
    contentType: 'application/json',
    body: {
      channelRegistrationId: config.channelRegistrationId,
      to: [to],
      kind: 'template',
      template: buildTemplate({
        templateName,
        language: config.templateLanguage,
        paramNames: config.templateParamsByType[templateType] || [],
        registration,
      }),
    },
  });

  if (isUnexpected(result)) {
    const details =
      result.body?.error?.message ||
      result.body?.message ||
      `Azure WhatsApp request failed with status ${result.status}.`;
    throw new Error(details);
  }

  const receipt = result.body?.receipts?.[0] || {};
  return {
    sent: true,
    providerMessageId: receipt.messageId || null,
    recipientPhone: receipt.to || to,
    providerPayload: result.body || null,
  };
}
