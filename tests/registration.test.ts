import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { findTenancyKeys } from '../core/http/tenancy-keys.ts';
import {
  registrationSchema,
  toE164,
  toSubmitPayload,
} from '../core/registration/schema.ts';
import {
  REGISTRATION_STATUSES,
  TRANSITIONS,
  canTransition,
} from '../core/registration/transitions.ts';

// Registration rules (docs/system-design.md §7, §12.4).

const valid = {
  first_name: '  Asha ',
  last_name: 'Rao',
  email: ' Asha.Rao@Example.org ',
  consent: true,
};

test('request bodies may not choose the event or org, at any depth', () => {
  assert.deepEqual(findTenancyKeys({ to: 'confirmed' }), []);
  assert.deepEqual(findTenancyKeys({ event_id: 'x' }), ['event_id']);
  assert.deepEqual(findTenancyKeys({ eventId: 'x' }), ['eventId']);
  assert.deepEqual(findTenancyKeys({ answers: { 'Org-Id': 'x' } }), [
    'answers.Org-Id',
  ]);
  assert.deepEqual(findTenancyKeys({ list: [{ organisation_id: 1 }] }), [
    'list[0].organisation_id',
  ]);
});

test('a valid registration is trimmed and the email lower-cased', () => {
  const parsed = registrationSchema.parse(valid);
  assert.equal(parsed.first_name, 'Asha');
  assert.equal(parsed.email, 'asha.rao@example.org');
  assert.equal(parsed.phone_e164, null);
  assert.deepEqual(toSubmitPayload(parsed), {
    first_name: 'Asha',
    last_name: 'Rao',
    email: 'asha.rao@example.org',
    organisation: null,
    category: null,
    phone_e164: null,
    whatsapp_opt_in: false,
    answers: {},
  });
});

test('consent is required and unknown fields are rejected', () => {
  assert.equal(
    registrationSchema.safeParse({ ...valid, consent: false }).success,
    false
  );
  assert.equal(
    registrationSchema.safeParse({ ...valid, status: 'confirmed' }).success,
    false
  );
  assert.equal(
    registrationSchema.safeParse({ ...valid, email: 'not-an-email' }).success,
    false
  );
});

test('WhatsApp updates need a valid phone; phones become E.164', () => {
  assert.equal(
    registrationSchema.safeParse({ ...valid, whatsapp_opt_in: true }).success,
    false
  );
  const parsed = registrationSchema.parse({
    ...valid,
    phone: '098765 43210',
    whatsapp_opt_in: true,
  });
  assert.equal(parsed.phone_e164, '+919876543210');
  assert.equal(toE164('+44 20 7946 0958'), '+442079460958');
  assert.equal(toE164('12'), null);
});

test('answers are bounded', () => {
  const tooMany = Object.fromEntries(
    Array.from({ length: 51 }, (_, i) => [`q${i}`, 'x'])
  );
  assert.equal(
    registrationSchema.safeParse({ ...valid, answers: tooMany }).success,
    false
  );
  assert.equal(
    registrationSchema.safeParse({
      ...valid,
      answers: { nested: { deep: true } },
    }).success,
    false
  );
});

test('status transitions match the SQL transition table', () => {
  const sql = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(`supabase/migrations/${name}`, 'utf8'))
    .join('\n');
  const body = sql.match(
    /function app\.registration_transition_allowed[\s\S]*?\$\$([\s\S]*?)\$\$/
  )?.[1];
  assert.ok(body, 'transition function not found');
  const pairs = [...body.matchAll(/\('(\w+)', '(\w+)'\)/g)]
    .map(([, from, to]) => `${from}>${to}`)
    .sort();
  const code = REGISTRATION_STATUSES.flatMap((from) =>
    TRANSITIONS[from].map((to) => `${from}>${to}`)
  ).sort();
  assert.deepEqual(pairs, code);
  assert.equal(canTransition('rejected', 'confirmed'), false);
  assert.equal(canTransition('pending', 'confirmed'), true);
});
