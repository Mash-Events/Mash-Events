import 'server-only';
import { getPrivilegedClient } from './client';

// Admin-user helpers that need the Supabase Auth admin API (design §6.2).
// Callers must already have verified a super admin session.

/** Emails for a set of auth user ids (auth.users is not readable via RLS). */
export async function emailsForUsers(
  userIds: string[]
): Promise<Record<string, string>> {
  const wanted = new Set(userIds);
  const result: Record<string, string> = {};
  if (!wanted.size) return result;
  const admin = getPrivilegedClient().auth.admin;
  // Admin user base is small (internal team), so paging through is fine.
  for (
    let page = 1;
    page <= 20 && Object.keys(result).length < wanted.size;
    page += 1
  ) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const user of data.users) {
      if (wanted.has(user.id) && user.email) result[user.id] = user.email;
    }
    if (data.users.length < 200) break;
  }
  return result;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = getPrivilegedClient().auth.admin;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export type InviteOutcome = { userId: string; invited: boolean };

/**
 * Existing user → reuse (no email). New user → Supabase invite email
 * (sign-ups stay disabled; only the admin API can create users).
 */
export async function findOrInviteUser(
  email: string,
  redirectTo: string
): Promise<InviteOutcome> {
  const normalised = email.trim().toLowerCase();
  const existing = await findUserIdByEmail(normalised);
  if (existing) return { userId: existing, invited: false };

  const { data, error } =
    await getPrivilegedClient().auth.admin.inviteUserByEmail(normalised, {
      redirectTo,
    });
  if (error || !data.user) throw error ?? new Error('invite failed');
  return { userId: data.user.id, invited: true };
}

/** Compensating action when granting the membership fails after an invite. */
export async function deleteInvitedUser(userId: string) {
  await getPrivilegedClient().auth.admin.deleteUser(userId);
}

export async function recordInvite(row: {
  email: string;
  scope: string;
  role: string;
  orgId: string | null;
  eventId: string | null;
  invitedBy: string;
  userId: string;
  invited: boolean;
}) {
  const { error } = await getPrivilegedClient()
    .from('member_invites')
    .insert({
      email_lower: row.email.trim().toLowerCase(),
      scope: row.scope,
      role: row.role,
      org_id: row.orgId,
      event_id: row.eventId,
      invited_by: row.invitedBy,
      user_id: row.userId,
      status: row.invited ? 'sent' : 'accepted',
      accepted_at: row.invited ? null : new Date().toISOString(),
    });
  if (error) throw error;
}
