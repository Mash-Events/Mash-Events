const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  PUBLIC_FORMS,
  FORM_CLOSED_MESSAGE,
  getFormClosedMessage,
  buildFormStatuses,
  isPublicFormKey,
} = require('../src/lib/form-settings.cjs');

test('forms without a stored row are open', () => {
  const statuses = buildFormStatuses([]);
  assert.equal(statuses.length, PUBLIC_FORMS.length);
  assert.ok(statuses.every((form) => form.open));
});

test('stored rows close only their own form', () => {
  const statuses = buildFormStatuses([
    {
      form_key: 'registration',
      is_open: false,
      updated_by_email: 'admin@example.com',
      updated_at: '2026-10-12T00:00:00.000Z',
    },
    { form_key: 'not_a_form', is_open: false },
  ]);
  const byKey = Object.fromEntries(statuses.map((form) => [form.key, form]));
  assert.equal(byKey.registration.open, false);
  assert.equal(byKey.registration.updatedBy, 'admin@example.com');
  assert.equal(byKey.speaker_application.open, true);
  assert.equal(statuses.length, PUBLIC_FORMS.length);
});

test('newsletter is not a closable form', () => {
  assert.equal(isPublicFormKey('newsletter'), false);
  assert.equal(isPublicFormKey('registration'), true);
});

test('each public form has its own closed message', () => {
  for (const form of PUBLIC_FORMS) {
    assert.match(getFormClosedMessage(form.key), /closed/, form.key);
  }
  assert.match(getFormClosedMessage('speaker_application'), /Speaker/);
  assert.doesNotMatch(
    getFormClosedMessage('speaker_application'),
    /Registration/
  );
  assert.equal(getFormClosedMessage('unknown'), FORM_CLOSED_MESSAGE);
});
