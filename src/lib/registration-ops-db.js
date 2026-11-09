import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getRegistrationById } from '@/lib/registration-db';
import passUtils from '@/lib/registration-pass-utils.cjs';
import registrationJobUtils from '@/lib/registration-job-utils.cjs';

const { normalizeRegistrationRecord } = passUtils;
const { planStaleJobItemRecovery } = registrationJobUtils;

function getSupabase() {
  return getSupabaseAdmin();
}

function normalizeString(value) {
  return String(value || '').trim();
}

function applyRegistrationFilters(query, filters = {}) {
  let nextQuery = query;
  const search = normalizeString(filters.search);
  const status = normalizeString(filters.status);
  const category = normalizeString(filters.category);
  const priorityTier = normalizeString(filters.priorityTier);
  const country = normalizeString(filters.country);
  const organization = normalizeString(filters.organization);
  const speakerFlag = normalizeString(filters.speakerFlag);
  const lateConfirmation = normalizeString(filters.lateConfirmation);

  if (status && status !== 'all') {
    nextQuery = nextQuery.eq('status', status);
  }

  if (category && category !== 'all') {
    nextQuery = nextQuery.eq('attendee_category', category);
  }

  if (priorityTier && priorityTier !== 'all') {
    nextQuery = nextQuery.eq('priority_tier', priorityTier);
  }

  if (country) {
    nextQuery = nextQuery.ilike('country', `%${country}%`);
  }

  const city = normalizeString(filters.city);
  if (city) {
    nextQuery = nextQuery.ilike('city', `%${city}%`);
  }

  if (organization) {
    nextQuery = nextQuery.ilike('organization', `%${organization}%`);
  }

  if (speakerFlag === 'yes') {
    nextQuery = nextQuery.eq('speaker_flag', true);
  }

  if (lateConfirmation === 'yes') {
    nextQuery = nextQuery.eq('exception_badge_required', true);
  }

  if (search) {
    nextQuery = nextQuery.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,registration_code.ilike.%${search}%,organization.ilike.%${search}%`
    );
  }

  return nextQuery;
}

function buildQueueBaseQuery(selectStatement, options = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('event_registrations')
    .select(selectStatement, options)
    .order('created_at', { ascending: false });

  return query;
}

export async function listRegistrationQueue({
  filters = {},
  page = 1,
  pageSize = 50,
} = {}) {
  const normalizedPage = Math.max(Number(page || 1), 1);
  const normalizedPageSize = Math.min(
    Math.max(Number(pageSize || 50), 10),
    100
  );
  const from = (normalizedPage - 1) * normalizedPageSize;
  const to = from + normalizedPageSize - 1;

  const queueFields = `
    id,
    registration_code,
    first_name,
    last_name,
    email,
    organization,
    designation,
    attendee_category,
    city,
    country,
    linkedin_url,
    priority_tier,
    status,
    review_notes,
    speaker_flag,
    vip_flag,
    exception_badge_required,
    badge_color_label,
    badge_color_hex,
    qr_pass_issued_at,
    checked_in_at,
    registration_daily_check_ins (
      event_day,
      checked_in_at,
      desk_label,
      actor_email
    ),
    created_at,
    updated_at,
    reviewed_at
  `;

  const dataQuery = applyRegistrationFilters(
    buildQueueBaseQuery(queueFields),
    filters
  ).range(from, to);

  const [dataResult, summary] = await Promise.all([
    dataQuery,
    getRegistrationQueueSummary(filters),
  ]);

  const errors = [dataResult.error].filter(Boolean);

  if (errors.length) {
    throw new Error(errors[0].message);
  }

  const totalCount = summary.total || 0;

  return {
    registrations: (dataResult.data || []).map((record) => {
      const { review_notes: reviewNotes, ...registration } =
        normalizeRegistrationRecord(record);
      return {
        ...registration,
        has_review_note: Boolean(reviewNotes?.trim()),
      };
    }),
    count: totalCount,
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages: Math.max(Math.ceil(totalCount / normalizedPageSize), 1),
    },
    summary,
  };
}

function normalizeSummaryRow(row = {}) {
  return {
    total: Number(row.total || 0),
    pending: Number(row.pending || 0),
    confirmed: Number(row.confirmed || 0),
    waitlisted: Number(row.waitlisted || 0),
    rejected: Number(row.rejected || 0),
    qrIssued: Number(row.qr_issued || row.qrIssued || 0),
    checkedIn: Number(row.checked_in || row.checkedIn || 0),
    exceptionBadges: Number(row.exception_badges || row.exceptionBadges || 0),
  };
}

function buildSummaryRpcArgs(filters = {}) {
  return {
    p_search: normalizeString(filters.search),
    p_status: normalizeString(filters.status) || 'all',
    p_category: normalizeString(filters.category) || 'all',
    p_priority_tier: normalizeString(filters.priorityTier) || 'all',
    p_country: normalizeString(filters.country),
    p_city: normalizeString(filters.city),
    p_organization: normalizeString(filters.organization),
    p_speaker_flag: normalizeString(filters.speakerFlag),
    p_late_confirmation: normalizeString(filters.lateConfirmation),
  };
}

async function getRegistrationQueueSummaryFallback(filters = {}) {
  const countQuery = applyRegistrationFilters(
    buildQueueBaseQuery('id', { count: 'exact', head: true }),
    filters
  );

  const makeCountQuery = (status) =>
    applyRegistrationFilters(
      buildQueueBaseQuery('id', { count: 'exact', head: true }),
      { ...filters, status }
    );

  const qrIssuedQuery = applyRegistrationFilters(
    buildQueueBaseQuery('id', { count: 'exact', head: true }),
    filters
  ).not('qr_pass_issued_at', 'is', null);

  const exceptionQuery = applyRegistrationFilters(
    buildQueueBaseQuery('id', { count: 'exact', head: true }),
    filters
  ).eq('exception_badge_required', true);

  const checkedInQuery = applyRegistrationFilters(
    buildQueueBaseQuery('id', { count: 'exact', head: true }),
    filters
  ).not('checked_in_at', 'is', null);

  const [
    countResult,
    pendingResult,
    confirmedResult,
    waitlistedResult,
    rejectedResult,
    qrIssuedResult,
    exceptionResult,
    checkedInResult,
  ] = await Promise.all([
    countQuery,
    makeCountQuery('pending'),
    makeCountQuery('confirmed'),
    makeCountQuery('waitlisted'),
    makeCountQuery('rejected'),
    qrIssuedQuery,
    exceptionQuery,
    checkedInQuery,
  ]);

  const errors = [
    countResult.error,
    pendingResult.error,
    confirmedResult.error,
    waitlistedResult.error,
    rejectedResult.error,
    qrIssuedResult.error,
    exceptionResult.error,
    checkedInResult.error,
  ].filter(Boolean);

  if (errors.length) {
    throw new Error(errors[0].message);
  }

  return {
    total: countResult.count || 0,
    pending: pendingResult.count || 0,
    confirmed: confirmedResult.count || 0,
    waitlisted: waitlistedResult.count || 0,
    rejected: rejectedResult.count || 0,
    qrIssued: qrIssuedResult.count || 0,
    checkedIn: checkedInResult.count || 0,
    exceptionBadges: exceptionResult.count || 0,
  };
}

export async function getRegistrationQueueSummary(filters = {}) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(
    'get_registration_queue_summary',
    buildSummaryRpcArgs(filters)
  );

  if (!error) {
    return normalizeSummaryRow(Array.isArray(data) ? data[0] : data);
  }

  const message = String(error.message || '');
  const isMissingRpc =
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    message.includes('get_registration_queue_summary');

  if (!isMissingRpc) {
    throw new Error(error.message);
  }

  return getRegistrationQueueSummaryFallback(filters);
}

export async function getRegistrationDetail(registrationId) {
  const supabase = getSupabase();
  // All three only need the id, so they run together.
  const [registration, historyResult, notificationsResult] = await Promise.all([
    getRegistrationById(registrationId),
    supabase
      .from('registration_status_history')
      .select(
        'id, previous_status, next_status, action_type, notes, actor_email, created_at'
      )
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('registration_notifications')
      .select(
        'id, template_type, delivery_status, failure_reason, recipient_email, created_at, updated_at'
      )
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  if (historyResult.error) {
    throw new Error(historyResult.error.message);
  }

  if (notificationsResult.error) {
    throw new Error(notificationsResult.error.message);
  }

  return {
    registration,
    history: historyResult.data || [],
    notifications: notificationsResult.data || [],
  };
}

export async function listRegistrationsForPassJob({
  filters = {},
  registrationIds = [],
} = {}) {
  const supabase = getSupabase();
  const selectStatement = `
    id,
    registration_code,
    email,
    status,
    qr_pass_issued_at,
    created_at
  `;

  let query = buildQueueBaseQuery(selectStatement);

  if (registrationIds.length) {
    query = query.in('id', registrationIds);
  } else {
    query = applyRegistrationFilters(query, filters);
  }

  query = query.eq('status', 'confirmed');

  const { data, error } = await query.limit(2000);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

// One transaction writes the job, an item per still-confirmed registration
// and the counters (see create_pass_issue_email_job).
export async function createPassIssueEmailJobWithItems({
  selection,
  registrationIds,
  operator,
  maxAttempts = 3,
}) {
  const { data, error } = await getSupabase()
    .rpc('create_pass_issue_email_job', {
      p_registration_ids: registrationIds,
      p_selection_mode: selection.selectionMode,
      p_filters: selection.filters,
      p_resend_existing: selection.resendExisting,
      p_actor_clerk_id: operator?.userId || null,
      p_actor_email: operator?.primaryEmail || null,
      p_max_attempts: maxAttempts,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function refreshPassIssueEmailJob(jobId) {
  const { data, error } = await getSupabase()
    .rpc('refresh_pass_issue_email_job', { p_job_id: jobId })
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listPassIssueEmailJobs({
  limit = 8,
  createdAfter,
  includeCompletedBefore = false,
} = {}) {
  const supabase = getSupabase();
  let query = supabase.from('pass_issue_email_jobs').select(
    `
      *,
      recipient_preview:pass_issue_email_job_items (
        registration:event_registrations (first_name, last_name)
      )
    `
  );
  if (createdAfter && includeCompletedBefore) {
    query = query.or(`created_at.gte.${createdAfter},status.eq.completed`);
  } else if (createdAfter) {
    query = query.gte('created_at', createdAfter);
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('created_at', {
      ascending: true,
      referencedTable: 'recipient_preview',
    })
    .limit(limit)
    .limit(1, { referencedTable: 'recipient_preview' });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

const JOB_COUNTER_COLUMNS =
  'id, status, created_at, total_items, queued_items, processing_items, sent_items, failed_items, retrying_items';

function scopeJobQuery(query, { createdAfter, includeCompletedBefore }) {
  if (createdAfter && includeCompletedBefore) {
    return query.or(`created_at.gte.${createdAfter},status.eq.completed`);
  }
  if (createdAfter) return query.gte('created_at', createdAfter);
  return query;
}

// One page of email jobs (newest first) with a recipient name for the title,
// plus the total number of jobs for the pager.
async function listEmailJobsPage({
  table,
  itemsTable,
  page = 1,
  pageSize = 15,
  createdAfter,
  includeCompletedBefore = false,
}) {
  const from = (Math.max(1, page) - 1) * pageSize;
  const query = scopeJobQuery(
    getSupabase()
      .from(table)
      .select(
        `
          *,
          recipient_preview:${itemsTable} (
            registration:event_registrations (first_name, last_name)
          )
        `,
        { count: 'exact' }
      ),
    { createdAfter, includeCompletedBefore }
  );
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('created_at', {
      ascending: true,
      referencedTable: 'recipient_preview',
    })
    .range(from, from + pageSize - 1)
    .limit(1, { referencedTable: 'recipient_preview' });

  if (error) {
    throw new Error(error.message);
  }

  return { jobs: data || [], total: count || 0 };
}

// Counters for every job in scope, for the summary strip.
async function listEmailJobCounters({
  table,
  columns = JOB_COUNTER_COLUMNS,
  createdAfter,
  includeCompletedBefore = false,
}) {
  const { data, error } = await scopeJobQuery(
    getSupabase().from(table).select(columns),
    { createdAfter, includeCompletedBefore }
  ).limit(2000);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export function listPassIssueEmailJobsPage(options = {}) {
  return listEmailJobsPage({
    ...options,
    table: 'pass_issue_email_jobs',
    itemsTable: 'pass_issue_email_job_items',
  });
}

export function listPassIssueEmailJobCounters(options = {}) {
  return listEmailJobCounters({
    ...options,
    table: 'pass_issue_email_jobs',
    // QR jobs also count people skipped because they already had a pass.
    columns: `${JOB_COUNTER_COLUMNS}, skipped_items`,
  });
}

export function listRegistrationEmailJobsPage(options = {}) {
  return listEmailJobsPage({
    ...options,
    table: 'registration_email_jobs',
    itemsTable: 'registration_email_job_items',
  });
}

export function listRegistrationEmailJobCounters(options = {}) {
  return listEmailJobCounters({
    ...options,
    table: 'registration_email_jobs',
  });
}

// How far the QR mail-out has got: confirmed delegates, and how many of them
// have been sent a pass.
export async function getPassCoverage() {
  const supabase = getSupabase();
  const [confirmed, issued] = await Promise.all([
    supabase
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed'),
    supabase
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .not('qr_pass_issued_at', 'is', null),
  ]);

  if (confirmed.error) throw new Error(confirmed.error.message);
  if (issued.error) throw new Error(issued.error.message);

  return {
    confirmed: confirmed.count || 0,
    issued: issued.count || 0,
  };
}

// Automatic workers only take jobs created after the pre-event backlog review.
// Older jobs remain visible and can be inspected without being restarted.
export const AUTOMATIC_EMAIL_JOB_CUTOFF = '2026-09-27T18:30:00.000Z';

export async function getNextPassIssueEmailJob() {
  const { data, error } = await getSupabase()
    .from('pass_issue_email_jobs')
    .select('*')
    .in('status', ['queued', 'processing'])
    .gte('created_at', AUTOMATIC_EMAIL_JOB_CUTOFF)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPassIssueEmailJob(jobId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pass_issue_email_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listPassIssueEmailJobItems({ jobId, limit = 50 } = {}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pass_issue_email_job_items')
    .select(
      `
      id,
      job_id,
      registration_id,
      status,
      attempt_count,
      max_attempts,
      failure_reason,
      notification_id,
      pass_id,
      token,
      sent_at,
      last_attempt_at,
      created_at,
      updated_at,
      registration:event_registrations (
        registration_code,
        first_name,
        last_name,
        email,
        organization
      )
    `
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

// Moves pass items stuck in "processing" after an interrupted request back
// into the queue (or to failed when out of attempts). Each update only
// applies if the item is still exactly as read, so a send that is genuinely
// in progress is never touched.
export async function releaseStalePassIssueEmailJobItems(jobId) {
  const supabase = getSupabase();
  const { data: items, error } = await supabase
    .from('pass_issue_email_job_items')
    .select('id, status, attempt_count, max_attempts, last_attempt_at')
    .eq('job_id', jobId)
    .eq('status', 'processing');

  if (error) {
    throw new Error(error.message);
  }

  const { retry, fail } = planStaleJobItemRecovery(items || []);
  const release = async (item, update) => {
    const { error: updateError } = await supabase
      .from('pass_issue_email_job_items')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('status', 'processing')
      .eq('last_attempt_at', item.last_attempt_at);
    if (updateError) {
      throw new Error(updateError.message);
    }
  };

  for (const item of retry) {
    await release(item, {
      status: 'retrying',
      failure_reason: 'Recovered after an interrupted send.',
    });
  }
  for (const item of fail) {
    await release(item, {
      status: 'failed',
      failure_reason: 'Interrupted while sending and out of attempts.',
    });
  }

  return { retried: retry.length, failed: fail.length };
}

export async function claimPassIssueEmailJobItems({ jobId, limit = 20 } = {}) {
  await releaseStalePassIssueEmailJobItems(jobId);
  return claimJobItems('claim_pass_issue_email_job_items', jobId, limit);
}

// One statement claims the whole chunk (see the claim_*_job_items RPCs);
// rows come back unordered, so restore queue order.
async function claimJobItems(rpcName, jobId, limit) {
  const { data, error } = await getSupabase().rpc(rpcName, {
    p_job_id: jobId,
    p_limit: limit,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data || []).sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );
}

export async function updatePassIssueEmailJobItem(itemId, fields) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pass_issue_email_job_items')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function retryFailedPassIssueEmailJobItems(jobId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pass_issue_email_job_items')
    .update({
      status: 'queued',
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('job_id', jobId)
    .eq('status', 'failed')
    .select('id');

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from('pass_issue_email_jobs')
    .update({
      status: 'queued',
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  return data || [];
}

export async function createRegistrationEmailJobRecord({
  templateType,
  operator = null,
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('registration_email_jobs')
    .insert({
      status: 'queued',
      template_type: templateType,
      created_by_clerk_id: operator?.userId || null,
      created_by_email: operator?.primaryEmail || null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function insertRegistrationEmailJobItems({
  jobId,
  items = [],
  maxAttempts = 3,
}) {
  if (!items.length) {
    return [];
  }

  const supabase = getSupabase();
  const payload = items.map((item) => ({
    job_id: jobId,
    registration_id: item.registrationId,
    notification_id: item.notificationId || null,
    template_type: item.templateType,
    status: 'queued',
    max_attempts: maxAttempts,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('registration_email_job_items')
    .insert(payload)
    .select(
      'id, registration_id, notification_id, template_type, status, attempt_count, max_attempts'
    );

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function refreshRegistrationEmailJob(jobId) {
  const { data, error } = await getSupabase()
    .rpc('refresh_registration_email_job', { p_job_id: jobId })
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listRegistrationEmailJobs({
  limit = 20,
  createdAfter,
} = {}) {
  const supabase = getSupabase();
  let query = supabase.from('registration_email_jobs').select(
    `
      *,
      recipient_preview:registration_email_job_items (
        registration:event_registrations (first_name, last_name)
      )
    `
  );
  if (createdAfter) query = query.gte('created_at', createdAfter);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('created_at', {
      ascending: true,
      referencedTable: 'recipient_preview',
    })
    .limit(limit)
    .limit(1, { referencedTable: 'recipient_preview' });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function getNextRegistrationEmailJob() {
  const { data, error } = await getSupabase()
    .rpc('get_next_registration_email_job', {
      p_created_after: AUTOMATIC_EMAIL_JOB_CUTOFF,
    })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getRegistrationEmailJob(jobId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('registration_email_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function claimRegistrationEmailJobItems({
  jobId,
  limit = 20,
} = {}) {
  return claimJobItems('claim_registration_email_job_items', jobId, limit);
}

export async function listRegistrationEmailJobItems({
  jobId,
  limit = 50,
} = {}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('registration_email_job_items')
    .select(
      `
      id,
      job_id,
      registration_id,
      notification_id,
      template_type,
      status,
      attempt_count,
      max_attempts,
      failure_reason,
      sent_at,
      last_attempt_at,
      created_at,
      updated_at,
      registration:event_registrations (
        registration_code,
        first_name,
        last_name,
        email,
        organization
      )
    `
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function retryFailedRegistrationEmailJobItems(jobId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('registration_email_job_items')
    .update({
      status: 'queued',
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('job_id', jobId)
    .eq('status', 'failed')
    .select('id');

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function updateRegistrationEmailJobItem(itemId, fields) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('registration_email_job_items')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// Deleting a registration cascades away its status history, so the audit
// event keeps enough to say who and what was removed.
export async function getRegistrationAuditSnapshot(id) {
  const { data, error } = await getSupabase()
    .from('event_registrations')
    .select(
      'id, registration_code, first_name, last_name, email, organization, status, attendee_category, created_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRegistration(id) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('event_registrations')
    .delete()
    .eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}

// --- Find my pass (public, 13-15 Oct only) ---------------------------------

export async function findRegistrationForPassLookup(email) {
  const { data, error } = await getSupabase()
    .from('event_registrations')
    .select('id, status, entry_passes(id, status)')
    .eq('email', email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listRecentPassLookupRequests({
  registrationId,
  operatorId,
  since,
}) {
  const { data, error } = await getSupabase()
    .from('pass_issue_email_job_items')
    .select('created_at, pass_issue_email_jobs!inner(created_by_clerk_id)')
    .eq('registration_id', registrationId)
    .eq('pass_issue_email_jobs.created_by_clerk_id', operatorId)
    .gte('created_at', since);
  if (error) throw new Error(error.message);
  return (data || []).map((item) => item.created_at);
}

export async function listPendingPassLookupJobs({ operatorId, limit = 20 }) {
  const { data, error } = await getSupabase()
    .from('pass_issue_email_jobs')
    .select('id')
    .eq('created_by_clerk_id', operatorId)
    .in('status', ['queued', 'processing'])
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}
