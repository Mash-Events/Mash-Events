export const EVENT_CONFIG = {
  name: 'Mash Event 2026',
  shortName: 'Mash Event 2026',
  startDate: '2026-10-14',
  endDate: '2026-10-15',
  qrIssueDate: '2026-10-07',
  badgeFreezeDate: '2026-10-09',
  contactEmail: 'contact@example.org',
  senderEmail: 'noreply@example.org',
};

export const REGISTRATION_SOURCE = 'mash-register-page';
export const QR_PASS_RELEASE_TIMING = 'one week prior to the event';

export const ATTENDEE_CATEGORIES = [
  'Government',
  'Tech',
  'NGO',
  'Academia',
  'Media',
  'Student',
  'Other',
];

export const REGISTRATION_STATUSES = [
  'pending',
  'confirmed',
  'waitlisted',
  'rejected',
];
export const PASS_STATUSES = ['not_issued', 'issued', 'revoked'];
export const CHECK_IN_STATUSES = ['not_checked_in', 'checked_in'];

export const PRIORITY_TIERS = [
  'Speakers',
  'Government / Policy stakeholders',
  'International delegates',
  'Partners / Sponsors',
  'NGOs / Civil Society',
  'Industry (Trust & Safety, Tech)',
  'Academia / Researchers',
  'Students (limited seats)',
];

export const BADGE_COLOR_MAP = {
  speaker: { label: 'Gold', hex: '#C28B2C' },
  government: { label: 'Dark Blue', hex: '#173B7A' },
  tech: { label: 'Teal', hex: '#0C8A8A' },
  ngo: { label: 'Purple', hex: '#6D28D9' },
  academia: { label: 'Burgundy', hex: '#7C2038' },
  media: { label: 'Red', hex: '#C62828' },
  student: { label: 'Grey', hex: '#6B7280' },
  other: { label: 'Olive', hex: '#6B7A24' },
};

export const REGISTRATION_EMAIL_COPY = {
  submission_received: ({ firstName }) => ({
    subject: 'Mash Event 2026 registration received',
    text: `Hi ${firstName},

Thank you for your interest in the Mash Event 2026
We have received your registration, and our team is currently reviewing your application. We will be in touch shortly with an update on your status.
Warm regards,
Mash Team`,
  }),
  confirmed: ({ firstName }) => ({
    subject: 'Your Mash Event 2026 participation is confirmed',
    text: `Hi ${firstName},

We are pleased to confirm your participation in the Mash Event 2026.
We look forward to welcoming you to what promises to be an engaging and impactful gathering of leaders working towards safer digital spaces. Your QR-based entry pass and event details will be shared closer to the event date.
Warm regards,
Mash Team`,
  }),
  waitlisted: ({ firstName }) => ({
    subject: 'Mash Event 2026 waitlist update',
    text: `Hi ${firstName},

Thank you for your interest in the Mash Event 2026.
Due to limited capacity, your registration has currently been placed on our waitlist. We will inform you promptly should a spot become available.
We appreciate your understanding and continued interest.
Warm regards,
Mash Team`,
  }),
  rejected: ({ firstName }) => ({
    subject: 'Mash Event 2026 registration update',
    text: `Hi ${firstName},

Thank you for taking the time to apply for the Mash Event 2026.
We regret to inform you that, due to limited capacity and a high volume of applications, we are unable to accommodate your registration at this time.
We truly appreciate your interest in the festival and hope to stay connected for future initiatives.
Warm regards,
Mash Team`,
  }),
  qr_pass_issued: ({ firstName }) => ({
    subject: 'Your Mash Event 2026 QR entry pass',
    text: `Hi ${firstName},

We’re pleased to share your entry pass for the Mash Event 2026.
Please find your QR code attached below. Kindly present this, along with a valid ID, at the registration desk for a smooth check-in experience.
We look forward to welcoming you.
Warm regards,
Mash Team`,
  }),
};

export const EMAIL_TEMPLATE_BY_STATUS = {
  pending: 'submission_received',
  confirmed: 'confirmed',
  waitlisted: 'waitlisted',
  rejected: 'rejected',
};
