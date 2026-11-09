function createScanSession({
  decodeIntervalMs = 180,
  duplicateCooldownMs = 2000,
} = {}) {
  let lastDecodeAt = -Infinity;
  let lastToken = '';
  let lastTokenAt = -Infinity;
  let submitting = false;

  return {
    shouldDecode(now) {
      if (now - lastDecodeAt < decodeIntervalMs) {
        return false;
      }

      lastDecodeAt = now;
      return true;
    },
    shouldSubmitToken(token, now) {
      const normalizedToken = String(token || '').trim();

      if (!normalizedToken) {
        return false;
      }

      if (
        normalizedToken === lastToken &&
        now - lastTokenAt < duplicateCooldownMs
      ) {
        return false;
      }

      lastToken = normalizedToken;
      lastTokenAt = now;
      return true;
    },
    markSubmitting() {
      submitting = true;
    },
    resetSubmission() {
      submitting = false;
    },
    isSubmitting() {
      return submitting;
    },
  };
}

module.exports = {
  createScanSession,
};
