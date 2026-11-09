function toNumber(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function buildAdminNavigation({ pathname = '', summary = {}, jobs = [] } = {}) {
  const normalizedPath = String(pathname || '');
  const failed = jobs.reduce(
    (total, job) => total + toNumber(job?.failed_items),
    0
  );

  return [
    {
      key: 'operations',
      label: 'Operations',
      items: [
        {
          href: '/admin/submissions',
          label: 'Submissions',
          active: normalizedPath === '/admin/submissions',
          badgeCount: 0,
          badgeTone: 'default',
          showBadge: false,
        },
        {
          href: '/admin/registrations',
          label: 'Review Queue',
          active:
            normalizedPath === '/admin/registrations' ||
            normalizedPath === '/admin',
          badgeCount: toNumber(summary.pending),
          badgeTone: 'warning',
          showBadge: toNumber(summary.pending) > 0,
        },
        {
          href: '/admin/delivery',
          label: 'Delivery',
          active: normalizedPath === '/admin/delivery',
          badgeCount: failed,
          badgeTone: 'danger',
          showBadge: failed > 0,
        },
        {
          href: '/admin/check-in',
          label: 'Check-In',
          active: normalizedPath === '/admin/check-in',
          badgeCount: 0,
          badgeTone: 'default',
          showBadge: false,
        },
        {
          href: '/admin/email-jobs',
          label: 'Emails',
          active: normalizedPath === '/admin/email-jobs',
          badgeCount: 0,
          badgeTone: 'warning',
          showBadge: false,
        },
        {
          href: '/admin/guest-invitations',
          label: 'Guest Invitations',
          active: normalizedPath === '/admin/guest-invitations',
          badgeCount: 0,
          badgeTone: 'default',
          showBadge: false,
        },
        {
          href: '/admin/speaker-communications',
          label: 'Speaker Communications',
          active: normalizedPath === '/admin/speaker-communications',
          badgeCount: 0,
          badgeTone: 'default',
          showBadge: false,
        },
        {
          href: '/admin/reminders',
          label: 'Reminders',
          active: normalizedPath === '/admin/reminders',
          badgeCount: 0,
          badgeTone: 'default',
          showBadge: false,
        },
        {
          href: '/admin/certificates',
          label: 'Certificates',
          active: normalizedPath === '/admin/certificates',
          badgeCount: 0,
          badgeTone: 'default',
          showBadge: false,
        },
        {
          href: '/admin/spot-registrations',
          label: 'Spot Registrations',
          active: normalizedPath === '/admin/spot-registrations',
          badgeCount: 0,
          badgeTone: 'default',
          showBadge: false,
        },
      ],
    },
  ];
}

module.exports = {
  buildAdminNavigation,
};
