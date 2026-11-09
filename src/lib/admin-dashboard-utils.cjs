function isSupabaseAdminConfigError(message) {
  const value = String(message || '');

  return (
    value.includes('Missing NEXT_PUBLIC_SUPABASE_URL') ||
    value.includes('Missing SUPABASE_SECRET_KEY')
  );
}

function getBatchStatusTone(message) {
  if (!message) {
    return 'default';
  }

  if (/queued|processing|retrying|in progress/i.test(message)) {
    return 'warning';
  }

  if (
    isSupabaseAdminConfigError(message) ||
    /unable|error|failed/i.test(message)
  ) {
    return 'danger';
  }

  if (/processed|sent|issued|saved|success/i.test(message)) {
    return 'success';
  }

  return 'default';
}

function buildDashboardQueryString(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, rawValue]) => {
    const value = String(rawValue || '').trim();
    if (value) {
      params.set(key, value);
    }
  });

  return params.toString();
}

function getLinkedInProfileUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) ||
      url.username ||
      url.password
    ) {
      return '';
    }
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return '';
  }
}

function summarizeQrSelection(selectedIds = [], registrations = []) {
  const selected = new Set(selectedIds);
  const confirmed = registrations.filter(
    (registration) =>
      selected.has(registration.id) && registration.status === 'confirmed'
  );
  return {
    registrationIds: confirmed.map((registration) => registration.id),
    firstSendCount: confirmed.filter(
      (registration) => !registration.qr_pass_issued_at
    ).length,
    repeatCount: confirmed.filter((registration) =>
      Boolean(registration.qr_pass_issued_at)
    ).length,
    ineligibleCount: selectedIds.length - confirmed.length,
  };
}

function summarizeSelection({ selectedCount = 0, matchedCount = 0 } = {}) {
  const normalizedSelected = Number(selectedCount || 0);
  const normalizedMatched = Number(matchedCount || 0);

  return {
    selectedLabel: `${normalizedSelected} selected`,
    matchedLabel: `${normalizedMatched} matched`,
  };
}

function getStatusRank(status) {
  if (status === 'pending') return 0;
  if (status === 'confirmed') return 1;
  if (status === 'waitlisted') return 2;
  if (status === 'rejected') return 3;
  return 4;
}

function getPriorityRank(priorityTier) {
  const value = String(priorityTier || '').toLowerCase();
  if (value.includes('purple')) return 0;
  if (value.includes('gold')) return 1;
  if (value.includes('blue')) return 2;
  return 3;
}

function prioritizeRegistrationQueue(registrations = []) {
  return [...registrations].sort((left, right) => {
    const statusDelta =
      getStatusRank(left.status) - getStatusRank(right.status);
    if (statusDelta !== 0) return statusDelta;

    const priorityDelta =
      getPriorityRank(left.priority_tier) -
      getPriorityRank(right.priority_tier);
    if (priorityDelta !== 0) return priorityDelta;

    const qrDelta =
      Number(Boolean(left.qr_pass_issued_at)) -
      Number(Boolean(right.qr_pass_issued_at));
    if (qrDelta !== 0) return qrDelta;

    return (
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
    );
  });
}

function getQuickActionOptions(registration = {}) {
  if (registration.status === 'pending') {
    return [
      { key: 'confirm', label: 'Confirm', kind: 'success' },
      { key: 'waitlist', label: 'Waitlist', kind: 'warning' },
      { key: 'reject', label: 'Reject', kind: 'danger' },
    ];
  }

  if (registration.status === 'confirmed') {
    return [
      {
        key: 'sendQr',
        label: 'Send QR',
        kind: 'info',
      },
      { key: 'waitlist', label: 'Waitlist', kind: 'warning' },
      { key: 'reject', label: 'Reject', kind: 'danger' },
    ];
  }

  return [
    { key: 'confirm', label: 'Confirm', kind: 'success' },
    { key: 'reject', label: 'Reject', kind: 'danger' },
  ];
}

module.exports = {
  buildDashboardQueryString,
  getLinkedInProfileUrl,
  summarizeQrSelection,
  summarizeSelection,
  isSupabaseAdminConfigError,
  getBatchStatusTone,
  prioritizeRegistrationQueue,
  getQuickActionOptions,
};
