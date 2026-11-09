const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyCameraStartFailure,
  getCameraStateMessage,
  isCheckInConfigError,
  getCheckInFeedbackTone,
  shouldRetryCameraRequest,
} = require('../src/lib/check-in-panel-utils.cjs');

test('flags missing Supabase admin configuration as a check-in blocker', () => {
  assert.equal(
    isCheckInConfigError(
      'Missing NEXT_PUBLIC_SUPABASE_URL for server-side Supabase admin client.'
    ),
    true
  );
  assert.equal(
    isCheckInConfigError(
      'Missing SUPABASE_SECRET_KEY for server-side Supabase admin client.'
    ),
    true
  );
  assert.equal(isCheckInConfigError('Network error.'), false);
});

test('returns camera guidance for unsupported and permission-denied states', () => {
  assert.match(
    getCameraStateMessage('unsupported'),
    /camera scanning is not supported/i
  );
  assert.match(
    getCameraStateMessage('permission_denied'),
    /camera access was denied/i
  );
  assert.match(
    getCameraStateMessage('insecure_or_blocked'),
    /secure browsing context/i
  );
  assert.match(
    getCameraStateMessage('camera_unavailable'),
    /no available camera/i
  );
});

test('returns success tone only for valid attendee check-in', () => {
  assert.equal(getCheckInFeedbackTone('valid'), 'success');
  assert.equal(getCheckInFeedbackTone('already_checked_in'), 'warning');
  assert.equal(getCheckInFeedbackTone('rejected'), 'danger');
});

test('classifies camera start failures into user-facing states', () => {
  assert.equal(
    classifyCameraStartFailure({
      isSecureContext: false,
      errorName: 'SecurityError',
    }),
    'insecure_or_blocked'
  );
  assert.equal(
    classifyCameraStartFailure({
      isSecureContext: true,
      errorName: 'NotAllowedError',
    }),
    'permission_denied'
  );
  assert.equal(
    classifyCameraStartFailure({
      isSecureContext: true,
      errorName: 'NotSupportedError',
    }),
    'permission_denied'
  );
  assert.equal(
    classifyCameraStartFailure({
      isSecureContext: true,
      errorName: 'NotFoundError',
    }),
    'camera_unavailable'
  );
  assert.equal(
    classifyCameraStartFailure({
      isSecureContext: true,
      errorName: 'AbortError',
    }),
    'camera_unavailable'
  );
  assert.equal(
    classifyCameraStartFailure({
      isSecureContext: true,
      errorName: 'UnknownError',
    }),
    'error'
  );
});

test('retries camera request for constraint and device selection failures', () => {
  assert.equal(shouldRetryCameraRequest('OverconstrainedError'), true);
  assert.equal(shouldRetryCameraRequest('ConstraintNotSatisfiedError'), true);
  assert.equal(shouldRetryCameraRequest('NotFoundError'), true);
  assert.equal(shouldRetryCameraRequest('NotAllowedError'), false);
});
