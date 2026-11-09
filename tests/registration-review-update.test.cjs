const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveRegistrationReviewFields,
  buildRegistrationReviewItems,
} = require('../src/lib/registration-review-update.cjs');

const badge = ({ attendeeCategory, speakerFlag, vipFlag }) => ({
  label: `${attendeeCategory}:${speakerFlag ? 'S' : ''}${vipFlag ? 'V' : ''}`,
  hex: '#000000',
});

test('review items lock on the client version, else the snapshot', () => {
  const snapshots = new Map([
    [
      'a',
      {
        status: 'pending',
        attendee_category: 'delegate',
        speaker_flag: false,
        vip_flag: true,
        review_notes: 'keep me',
        updated_at: '2026-10-01T00:00:00.123456+00:00',
      },
    ],
    [
      'b',
      {
        status: 'pending',
        attendee_category: 'media',
        speaker_flag: false,
        vip_flag: false,
        review_notes: null,
        updated_at: '2026-10-02T00:00:00+00:00',
      },
    ],
  ]);

  const { items, missingIds } = buildRegistrationReviewItems({
    updates: [
      { registrationId: 'a', expectedUpdatedAt: '2026-09-30T00:00:00+00:00' },
      { registrationId: 'b' },
      { registrationId: 'a' },
      { registrationId: 'gone' },
    ],
    snapshots,
    speakerFlag: true,
    getBadgeColor: badge,
  });

  assert.deepEqual(missingIds, ['gone']);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    id: 'a',
    expected_updated_at: '2026-09-30T00:00:00+00:00',
    review_notes: 'keep me',
    speaker_flag: true,
    vip_flag: true,
    badge_color_label: 'delegate:SV',
    badge_color_hex: '#000000',
  });
  assert.equal(items[1].expected_updated_at, '2026-10-02T00:00:00+00:00');
  assert.equal(items[1].review_notes, null);
  assert.equal(items[1].badge_color_label, 'media:S');
});

const existing = {
  review_notes: 'Needs step-free access',
  speaker_flag: true,
  vip_flag: true,
};

test('status-only updates preserve existing review notes and flags', () => {
  assert.deepEqual(resolveRegistrationReviewFields(existing, {}), {
    reviewNotes: 'Needs step-free access',
    speakerFlag: true,
    vipFlag: true,
  });
});

test('explicit review edits can clear notes and flags', () => {
  assert.deepEqual(
    resolveRegistrationReviewFields(existing, {
      reviewNotes: '  ',
      speakerFlag: false,
      vipFlag: false,
    }),
    { reviewNotes: '', speakerFlag: false, vipFlag: false }
  );
});
