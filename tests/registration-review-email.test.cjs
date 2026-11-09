const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  getReviewEmailTemplate,
} = require('../src/lib/registration-review-email.cjs');

test('reviewing an unchanged pending registration does not queue an unsupported email', () => {
  assert.equal(getReviewEmailTemplate('pending', 'pending'), null);
});

test('notes-only saves do not resend status emails', () => {
  for (const status of ['confirmed', 'waitlisted', 'rejected']) {
    assert.equal(getReviewEmailTemplate(status, status), null);
  }
});

test('a changed decision queues its matching email, while returning to pending does not', () => {
  assert.equal(getReviewEmailTemplate('pending', 'confirmed'), 'confirmed');
  assert.equal(getReviewEmailTemplate('pending', 'waitlisted'), 'waitlisted');
  assert.equal(getReviewEmailTemplate('pending', 'rejected'), 'rejected');
  assert.equal(getReviewEmailTemplate('rejected', 'pending'), null);
});
