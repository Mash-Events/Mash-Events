import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Writes to the append-only admin_audit_events table. Throws on failure so a
// destructive action can refuse to run when it cannot be recorded.
export async function recordAdminAuditEvent(
  operator,
  { action, targetType = null, targetId = null, details = {} }
) {
  const { error } = await getSupabaseAdmin()
    .from('admin_audit_events')
    .insert({
      action,
      actor_email: operator?.primaryEmail || null,
      actor_user_id: operator?.userId || null,
      target_type: targetType,
      target_id: targetId === null ? null : String(targetId),
      details,
    });
  if (error) {
    throw new Error(`Unable to record audit event: ${error.message}`);
  }
}

// Exports should not fail because the audit write did, but the miss must be
// visible in the logs.
export async function recordExportAuditEvent(operator, dataset, details = {}) {
  try {
    await recordAdminAuditEvent(operator, {
      action: 'data.exported',
      targetType: 'dataset',
      targetId: dataset,
      details,
    });
  } catch (error) {
    console.error(`Export audit write failed for ${dataset}.`, error);
  }
}
