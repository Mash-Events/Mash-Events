function isCheckInConfigError(message) {
  const value = String(message || '');

  return (
    value.includes('Missing NEXT_PUBLIC_SUPABASE_URL') ||
    value.includes('Missing SUPABASE_SECRET_KEY')
  );
}

function getCameraStateMessage(cameraState) {
  if (cameraState === 'requesting') {
    return 'Requesting camera access. If your browser prompts for permission, allow the rear camera for the smoothest scan.';
  }

  if (cameraState === 'unsupported') {
    return 'Live camera scanning is not supported in this browser. Use manual QR token entry or attendee lookup instead.';
  }

  if (cameraState === 'permission_denied') {
    return 'Camera access was denied. Allow camera access in your browser settings, then try again.';
  }

  if (cameraState === 'insecure_or_blocked') {
    return 'Camera scanning needs a secure browsing context and an available camera device. Open the site directly over HTTPS and try again.';
  }

  if (cameraState === 'camera_unavailable') {
    return 'No available camera was detected, or another app is already using it. Close other camera apps and try again.';
  }

  if (cameraState === 'error') {
    return 'Camera access could not be started. Check browser permissions, HTTPS access, and whether another app is using the camera.';
  }

  if (cameraState === 'active') {
    return 'Point the rear camera at the attendee QR code. The scanner will validate it automatically.';
  }

  return 'Use the rear camera on Android or a modern desktop browser for the most reliable QR scan performance.';
}

function getCheckInFeedbackTone(result) {
  if (result === 'valid') {
    return 'success';
  }

  if (result === 'already_checked_in' || result === 'waitlisted') {
    return 'warning';
  }

  return 'danger';
}

function classifyCameraStartFailure({
  isSecureContext = true,
  errorName = '',
} = {}) {
  if (!isSecureContext || errorName === 'SecurityError') {
    return 'insecure_or_blocked';
  }

  if (
    errorName === 'NotAllowedError' ||
    errorName === 'PermissionDeniedError' ||
    errorName === 'NotSupportedError'
  ) {
    return 'permission_denied';
  }

  if (
    errorName === 'NotFoundError' ||
    errorName === 'DevicesNotFoundError' ||
    errorName === 'NotReadableError' ||
    errorName === 'TrackStartError' ||
    errorName === 'AbortError'
  ) {
    return 'camera_unavailable';
  }

  return 'error';
}

function shouldRetryCameraRequest(errorName = '') {
  return (
    errorName === 'OverconstrainedError' ||
    errorName === 'ConstraintNotSatisfiedError' ||
    errorName === 'NotFoundError' ||
    errorName === 'DevicesNotFoundError'
  );
}

module.exports = {
  classifyCameraStartFailure,
  isCheckInConfigError,
  getCameraStateMessage,
  getCheckInFeedbackTone,
  shouldRetryCameraRequest,
};
