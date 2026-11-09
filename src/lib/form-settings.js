import { getSupabaseAdmin } from '@/lib/supabase-admin';
import formSettings from '@/lib/form-settings.cjs';

const { FORM_CLOSED_MESSAGE, buildFormStatuses, isPublicFormKey } =
  formSettings;

// Fails open: if the settings can't be read (no Supabase env at build time,
// a network blip), forms behave as they did before this switch existed.
export async function getFormStatuses() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('form_settings')
      .select('form_key, is_open, updated_by_email, updated_at');
    if (error) throw error;
    return buildFormStatuses(data);
  } catch (error) {
    console.error('[form-settings] read failed, treating forms as open', {
      message: error?.message,
    });
    return buildFormStatuses([]);
  }
}

export async function isFormOpen(key) {
  const statuses = await getFormStatuses();
  return statuses.find((form) => form.key === key)?.open !== false;
}

export function formClosedResponse(headers) {
  return Response.json(
    { error: FORM_CLOSED_MESSAGE, code: 'form_closed' },
    { status: 403, headers }
  );
}

export async function setFormOpen(key, open, actorEmail) {
  if (!isPublicFormKey(key)) return false;
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from('form_settings').upsert(
    {
      form_key: key,
      is_open: open,
      updated_by_email: actorEmail,
      updated_at: now,
    },
    { onConflict: 'form_key' }
  );
  if (error) return false;

  const { error: historyError } = await supabase
    .from('form_setting_changes')
    .insert({ form_key: key, is_open: open, changed_by_email: actorEmail });
  if (historyError) {
    console.error('[form-settings] change saved but audit row failed', {
      key,
      message: historyError.message,
    });
  }
  return true;
}
