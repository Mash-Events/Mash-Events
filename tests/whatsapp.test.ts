import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWhatsAppConfig,
  isWhatsAppConfigured,
  sendWhatsAppTemplate,
  whatsAppParamValue,
} from '../core/messaging/whatsapp.ts';

// WhatsApp channel (docs/system-design.md §8.1, S19): config gate, template
// parameter mapping, and the Azure call through an injected client.

const ENV = {
  AZURE_WHATSAPP_ENABLED: 'true',
  AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING:
    'endpoint=https://example.communications.azure.com/;accesskey=abc',
  AZURE_WHATSAPP_CHANNEL_REGISTRATION_ID: 'channel-id-1',
  AZURE_WHATSAPP_TEMPLATE_CONFIRMED: 'event_confirmed',
};

const ITEM = {
  item_id: 'i1',
  lease_id: 'l1',
  template_key: 'confirmed',
  recipient: '+919900000001',
  attempts: 0,
  registration_id: 'r1',
  registration_code: 'AB12CD34',
  first_name: 'Asha',
  last_name: 'Rao',
  registration_status: 'confirmed',
  event_id: 'e1',
  event_name: 'Orbit Summit 2026',
  event_slug: 'orbit-summit',
  event_kind: 'hybrid',
  event_timezone: 'Asia/Kolkata',
  event_starts_at: null,
  event_ends_at: null,
  org_id: 'o1',
  org_name: 'Demo Org',
  org_slug: 'demo',
  from_name: null,
  reply_to: null,
  subject_override: null,
  job_subject: null,
  job_body: null,
  include_join_link: false,
};

function withEnv(patch: Record<string, string | undefined>, run: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(patch)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('the channel is inert until every credential is present', () => {
  withEnv({ ...ENV, AZURE_WHATSAPP_ENABLED: 'false' }, () => {
    assert.equal(isWhatsAppConfigured(getWhatsAppConfig()), false);
  });
  withEnv(
    {
      ...ENV,
      AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING: undefined,
    },
    () => {
      assert.equal(isWhatsAppConfigured(getWhatsAppConfig()), false);
    }
  );
  withEnv(ENV, () => {
    assert.equal(isWhatsAppConfigured(getWhatsAppConfig()), true);
  });
  withEnv({ ...ENV, AZURE_WHATSAPP_CHANNEL_REGISTRATION_ID: '' }, () => {
    assert.equal(isWhatsAppConfigured(getWhatsAppConfig()), false);
  });
});

test('template parameters map from the claimed item only', () => {
  assert.equal(whatsAppParamValue('firstName', ITEM), 'Asha');
  assert.equal(whatsAppParamValue('fullName', ITEM), 'Asha Rao');
  assert.equal(whatsAppParamValue('eventName', ITEM), 'Orbit Summit 2026');
  assert.equal(whatsAppParamValue('registrationCode', ITEM), 'AB12CD34');
  assert.equal(whatsAppParamValue('anythingElse', ITEM), '');
});

test('a successful template send returns the provider message id', async () => {
  const seen: unknown[] = [];
  const result = await sendWhatsAppTemplate(
    ITEM,
    {
      ...getWhatsAppConfig(),
      ...{ templates: { confirmed: 'event_confirmed' } },
      enabled: true,
      connectionString: 'x',
      channelRegistrationId: 'c1',
    },
    () => ({
      path: (path: string) => ({
        post: async (request: { body: unknown }) => {
          seen.push({ path, body: request.body });
          return {
            status: 202,
            body: { receipts: [{ messageId: 'provider-123' }] },
          };
        },
      }),
    })
  );
  assert.deepEqual(result, { ok: true, providerMessageId: 'provider-123' });
  const call = seen[0] as {
    path: string;
    body: { to: string[]; kind: string; template: { name: string } };
  };
  assert.equal(call.path, '/messages/notifications:send');
  assert.deepEqual(call.body.to, ['+919900000001']);
  assert.equal(call.body.kind, 'template');
  assert.equal(call.body.template.name, 'event_confirmed');
});

test('rate limits are retryable, other failures are not', async () => {
  const fail = (status: number) => () => ({
    path: () => ({
      post: async () => ({
        status,
        body: { error: { message: `status ${status}` } },
      }),
    }),
  });
  const retryable = await sendWhatsAppTemplate(
    ITEM,
    {
      enabled: true,
      connectionString: 'x',
      channelRegistrationId: 'c',
      templateLanguage: 'en',
      templates: { confirmed: 't' },
      confirmedParams: [],
    },
    fail(429)
  );
  assert.deepEqual(retryable, {
    ok: false,
    retryable: true,
    error: 'status 429',
  });
  const permanent = await sendWhatsAppTemplate(
    ITEM,
    {
      enabled: true,
      connectionString: 'x',
      channelRegistrationId: 'c',
      templateLanguage: 'en',
      templates: { confirmed: 't' },
      confirmedParams: [],
    },
    fail(400)
  );
  assert.deepEqual(permanent, {
    ok: false,
    retryable: false,
    error: 'status 400',
  });
});

test('missing template name or invalid phone fail without sending', async () => {
  const never = () => ({
    path: () => ({
      post: async () => {
        throw new Error('must not be called');
      },
    }),
  });
  assert.deepEqual(
    await sendWhatsAppTemplate(
      ITEM,
      {
        enabled: true,
        connectionString: 'x',
        channelRegistrationId: 'c',
        templateLanguage: 'en',
        templates: { confirmed: '' },
        confirmedParams: [],
      },
      never
    ),
    { ok: false, retryable: false, error: 'template_not_configured' }
  );
  assert.deepEqual(
    await sendWhatsAppTemplate(
      { ...ITEM, recipient: 'not-a-phone' },
      {
        enabled: true,
        connectionString: 'x',
        channelRegistrationId: 'c',
        templateLanguage: 'en',
        templates: { confirmed: 't' },
        confirmedParams: [],
      },
      never
    ),
    { ok: false, retryable: false, error: 'invalid_phone' }
  );
});
