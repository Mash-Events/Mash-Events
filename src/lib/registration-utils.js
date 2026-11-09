import { randomBytes, randomUUID } from 'node:crypto';
import {
  sanitizeEmail,
  sanitizeMessage,
  sanitizePhone,
  sanitizeShortText,
  sanitizeUrl,
} from '@/lib/input-sanitizers';
import {
  ATTENDEE_CATEGORIES,
  BADGE_COLOR_MAP,
  EVENT_CONFIG,
  REGISTRATION_STATUSES,
} from '@/lib/registration-constants';

export const PROFILE_BUCKET = 'registration-profile-photos';
export const PASS_IMAGE_BUCKET = 'registration-pass-images';

export function buildRegistrationCode() {
  return `EVT26-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function buildPassToken() {
  return randomBytes(24).toString('hex');
}

export function normalizeCategory(value) {
  const sanitized = sanitizeShortText(value, {
    maxLength: 40,
    fieldName: 'Attendee category',
  });

  if (!ATTENDEE_CATEGORIES.includes(sanitized)) {
    throw new Error('Please select a valid attendee category.');
  }

  return sanitized;
}

export function normalizePriorityTier(value) {
  const sanitized = sanitizeShortText(value, {
    maxLength: 80,
    fieldName: 'Priority tier',
    required: false,
  });

  return sanitized || '';
}

function derivePriorityTierFromCategory(category) {
  if (category === 'Government') {
    return 'Government / Policy stakeholders';
  }

  if (category === 'NGO') {
    return 'NGOs / Civil Society';
  }

  if (category === 'Academia') {
    return 'Academia / Researchers';
  }

  if (category === 'Student') {
    return 'Students (limited seats)';
  }

  return 'Industry (Trust & Safety, Tech)';
}

export function normalizeRegistrationStatus(value) {
  if (!REGISTRATION_STATUSES.includes(value)) {
    throw new Error('Invalid registration status.');
  }

  return value;
}

export function normalizeRegistrationPayload(input) {
  const firstName = sanitizeShortText(input?.first_name, {
    maxLength: 80,
    fieldName: 'First name',
  });
  const lastName = sanitizeShortText(input?.last_name, {
    maxLength: 80,
    fieldName: 'Last name',
  });
  const email = sanitizeEmail(input?.email);
  const phone = sanitizePhone(input?.phone);
  const organization = sanitizeShortText(input?.organization, {
    maxLength: 180,
    fieldName: 'Organization',
  });
  const designation = sanitizeShortText(input?.designation, {
    maxLength: 180,
    fieldName: 'Designation',
  });
  const attendeeCategory = normalizeCategory(input?.attendee_category);
  const city = sanitizeShortText(input?.city, {
    maxLength: 120,
    fieldName: 'City',
  });
  const country = sanitizeShortText(input?.country, {
    maxLength: 120,
    fieldName: 'Country',
  });
  const linkedinUrl = sanitizeUrl(input?.linkedin_url);
  const attendanceReason = sanitizeMessage(input?.attendance_reason);
  const priorityTier =
    normalizePriorityTier(input?.priority_tier) ||
    derivePriorityTierFromCategory(attendeeCategory);

  if (!phone || phone.length < 7 || phone.length > 32) {
    throw new Error('Please enter a valid phone number.');
  }

  if (!linkedinUrl) {
    throw new Error('LinkedIn profile is required.');
  }

  let parsedLinkedinUrl;
  try {
    parsedLinkedinUrl = new URL(
      /^https?:\/\//i.test(linkedinUrl) ? linkedinUrl : `https://${linkedinUrl}`
    );
  } catch {
    throw new Error('Please enter a valid LinkedIn profile URL.');
  }

  const linkedinHostname = parsedLinkedinUrl.hostname.toLowerCase();
  const isLinkedinHost =
    linkedinHostname === 'linkedin.com' ||
    linkedinHostname.endsWith('.linkedin.com');
  if (
    !['http:', 'https:'].includes(parsedLinkedinUrl.protocol) ||
    !isLinkedinHost
  ) {
    throw new Error('LinkedIn profile must be a linkedin.com URL.');
  }

  if (attendanceReason && attendanceReason.length > 2000) {
    throw new Error(
      'Why do you want to attend? must be 2000 characters or less.'
    );
  }

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    organization,
    designation,
    attendee_category: attendeeCategory,
    city,
    country,
    linkedin_url: parsedLinkedinUrl.toString(),
    attendance_reason: attendanceReason || null,
    priority_tier:
      priorityTier || derivePriorityTierFromCategory(attendeeCategory),
  };
}

export function getBadgeColor({
  attendeeCategory,
  speakerFlag = false,
  vipFlag = false,
}) {
  if (speakerFlag) {
    return BADGE_COLOR_MAP.speaker;
  }

  if (vipFlag || attendeeCategory === 'Government') {
    return BADGE_COLOR_MAP.government;
  }

  if (attendeeCategory === 'NGO') {
    return BADGE_COLOR_MAP.ngo;
  }

  if (attendeeCategory === 'Academia') {
    return BADGE_COLOR_MAP.academia;
  }

  if (attendeeCategory === 'Media') {
    return BADGE_COLOR_MAP.media;
  }

  if (attendeeCategory === 'Student') {
    return BADGE_COLOR_MAP.student;
  }

  if (attendeeCategory === 'Other') {
    return BADGE_COLOR_MAP.other;
  }

  return BADGE_COLOR_MAP.tech;
}

export function getBadgeFreezeDate() {
  return new Date(`${EVENT_CONFIG.badgeFreezeDate}T23:59:59+05:30`);
}

export function getQrIssueDate() {
  return new Date(`${EVENT_CONFIG.qrIssueDate}T00:00:00+05:30`);
}

export function isAfterBadgeFreeze(date = new Date()) {
  return date.getTime() > getBadgeFreezeDate().getTime();
}

export function buildStoragePath({ extension = 'jpg', registrationId }) {
  return `${registrationId}/${randomUUID()}.${extension.toLowerCase()}`;
}

export function buildBadgeDisplayName(registration) {
  return `${registration.first_name} ${registration.last_name}`.trim();
}
