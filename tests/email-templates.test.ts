import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_TEMPLATES,
  escapeHtml,
  renderEmail,
  type EmailContext,
} from '../core/messaging/templates.ts';

// Transactional email templates (docs/system-design.md §8).

const base: EmailContext = {
  templateKey: 'confirmed',
  firstName: 'Asha',
  registrationCode: 'ABCD2345',
  eventName: 'Launch Webinar',
  eventKind: 'webinar',
  eventTimezone: 'Asia/Kolkata',
  eventStartsAt: '2026-11-23T10:27:00Z',
  eventEndsAt: null,
  orgName: 'Demo Org',
  eventUrl: 'https://demo.mash.example/launch-webinar',
  subjectOverride: null,
};

test('every template renders a subject, HTML and text', () => {
  for (const templateKey of EMAIL_TEMPLATES) {
    const email = renderEmail({ ...base, templateKey });
    assert.ok(email.subject.includes('Launch Webinar'), templateKey);
    assert.match(email.html, /^<!doctype html>/);
    assert.match(email.text, /Dear Asha,/);
  }
});

test('confirmation shows the time in the event timezone and the code', () => {
  const email = renderEmail(base);
  assert.match(email.text, /3:57\s?pm IST/i);
  assert.match(email.text, /ABCD2345/);
  assert.match(email.text, /joining link/);
});

test('values are escaped in HTML', () => {
  const email = renderEmail({
    ...base,
    firstName: '<script>alert(1)</script>',
    eventName: 'A & B "Event"',
  });
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /A &amp; B &quot;Event&quot;/);
  assert.equal(escapeHtml(`'`), '&#39;');
});

test('a per-event subject override wins and is length-limited', () => {
  const email = renderEmail({ ...base, subjectOverride: 'See you soon!' });
  assert.equal(email.subject, 'See you soon!');
  const long = renderEmail({ ...base, subjectOverride: 'x'.repeat(500) });
  assert.equal(long.subject.length, 200);
});

test('unknown templates are refused', () => {
  assert.throws(() => renderEmail({ ...base, templateKey: 'marketing' }));
});
