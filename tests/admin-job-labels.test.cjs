const test = require('node:test');
const assert = require('node:assert/strict');
const { jobParticipantTitle } = require('../src/lib/admin-job-labels.cjs');

test('job titles use a participant name for one recipient', () => {
  assert.equal(
    jobParticipantTitle({
      total_items: 1,
      recipient_preview: [
        { registration: { first_name: 'Asha', last_name: 'Rao' } },
      ],
    }),
    'Asha Rao'
  );
});

test('multi-recipient jobs show a name and the remaining recipient count', () => {
  const job = { total_items: 4, recipient_preview: [] };
  assert.equal(
    jobParticipantTitle(job, [
      { registration: { first_name: 'Ashish', last_name: 'Varma' } },
    ]),
    'Ashish Varma + 3 others'
  );
  assert.equal(jobParticipantTitle(job), '4 participants');
});

test('jobs without accessible recipient names use a plain count', () => {
  assert.equal(jobParticipantTitle({ total_items: 1 }), '1 participant');
  assert.equal(jobParticipantTitle({ total_items: 0 }), 'No participants');
});
