// Allowed registration status transitions. Mirrors
// app.registration_transition_allowed() in the registration migration; a
// test keeps both identical (docs/system-design.md §7).

export const REGISTRATION_STATUSES = [
  'pending',
  'confirmed',
  'waitlisted',
  'rejected',
  'cancelled',
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  pending: ['confirmed', 'waitlisted', 'rejected', 'cancelled'],
  waitlisted: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['cancelled', 'waitlisted'],
  rejected: ['pending'],
  cancelled: ['pending'],
};

export function canTransition(
  from: RegistrationStatus,
  to: RegistrationStatus
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
