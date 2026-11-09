import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildPassToken,
  getBadgeColor,
  isAfterBadgeFreeze,
} from '@/lib/registration-utils';
import passUtils from '@/lib/registration-pass-utils.cjs';
import reviewUpdate from '@/lib/registration-review-update.cjs';
import checkInDayUtils from '@/lib/check-in-day-utils.cjs';

const { normalizeRegistrationRecord, getIssuedEntryPass } = passUtils;
const { buildRegistrationReviewItems } = reviewUpdate;
const { getCheckInDayNumber, isCheckedInForDay, normalizeCheckInDay } =
  checkInDayUtils;

function getSupabase() {
  return getSupabaseAdmin();
}

function isUniqueViolation(error) {
  return error?.code === '23505' || /duplicate key/i.test(error?.message || '');
}

function baseRegistrationSelect() {
  return `
    id,
    registration_code,
    first_name,
    last_name,
    email,
    phone,
    organization,
    designation,
    attendee_category,
    city,
    country,
    linkedin_url,
    attendance_reason,
    priority_tier,
    source,
    status,
    speaker_flag,
    vip_flag,
    exception_badge_required,
    badge_color_label,
    badge_color_hex,
    profile_photo_path,
    profile_photo_size_bytes,
    profile_photo_width,
    profile_photo_height,
    qr_pass_issued_at,
    checked_in_at,
    created_at,
    updated_at,
    reviewed_at,
    reviewed_by_clerk_id,
    reviewed_by_email,
    review_notes,
    last_badge_export_batch_id,
    entry_passes (
      id,
      token,
      status,
      issued_at,
      revoked_at
    ),
    registration_daily_check_ins (
      event_day,
      checked_in_at,
      desk_label,
      actor_email
    )
  `;
}

export async function createRegistration({
  registration,
  profilePhoto,
  operator = null,
}) {
  const supabase = getSupabase();
  const badgeColor = getBadgeColor({
    attendeeCategory: registration.attendee_category,
    speakerFlag: registration.speaker_flag,
    vipFlag: registration.vip_flag,
  });

  const row = {
    ...registration,
    status: 'pending',
    badge_color_label: badgeColor.label,
    badge_color_hex: badgeColor.hex,
    source: registration.source,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('event_registrations')
    .insert(row)
    .select(baseRegistrationSelect())
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await appendStatusHistory({
    registrationId: data.id,
    previousStatus: null,
    nextStatus: 'pending',
    actorClerkId: operator?.userId || null,
    actorEmail: operator?.primaryEmail || null,
    actionType: 'registration_submitted',
    notes: 'Registration created from public form.',
  });

  if (profilePhoto) {
    await supabase.from('registration_assets').insert({
      registration_id: data.id,
      asset_type: 'profile_photo',
      storage_bucket: profilePhoto.bucket,
      storage_path: profilePhoto.path,
      original_filename: profilePhoto.originalFilename,
      mime_type: profilePhoto.mimeType,
      size_bytes: profilePhoto.sizeBytes,
      width: profilePhoto.width,
      height: profilePhoto.height,
      created_at: new Date().toISOString(),
    });
  }

  return normalizeRegistrationRecord(data);
}

export async function appendStatusHistory({
  registrationId,
  previousStatus,
  nextStatus,
  actorClerkId,
  actorEmail,
  actionType,
  notes,
}) {
  const supabase = getSupabase();
  const { error } = await supabase.from('registration_status_history').insert({
    registration_id: registrationId,
    previous_status: previousStatus,
    next_status: nextStatus,
    action_type: actionType,
    notes: notes || null,
    actor_clerk_id: actorClerkId || null,
    actor_email: actorEmail || null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function createNotification({
  registrationId,
  templateType,
  recipientEmail,
  recipientPhone = null,
  deliveryChannel = 'email',
  actorClerkId = null,
  actorEmail = null,
}) {
  const supabase = getSupabase();
  const notification = {
    registration_id: registrationId,
    template_type: templateType,
    recipient_email: recipientEmail,
    delivery_status: 'queued',
    actor_clerk_id: actorClerkId,
    actor_email: actorEmail,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (deliveryChannel !== 'email' || recipientPhone) {
    notification.delivery_channel = deliveryChannel;
    notification.recipient_phone = recipientPhone;
  }

  const { data, error } = await supabase
    .from('registration_notifications')
    .insert(notification)
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

export async function markNotificationDelivery(notificationId, fields) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('registration_notifications')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getRegistrationById(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('event_registrations')
    .select(baseRegistrationSelect())
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeRegistrationRecord(data);
}

export async function getRegistrationReviewSnapshots(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await getSupabase()
    .from('event_registrations')
    .select(
      'id,status,attendee_category,speaker_flag,vip_flag,review_notes,updated_at'
    )
    .in('id', ids);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((row) => [row.id, row]));
}

export async function listRegistrations(filters = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('event_registrations')
    .select(baseRegistrationSelect(), { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters.category && filters.category !== 'all') {
    query = query.eq('attendee_category', filters.category);
  }

  if (filters.priorityTier && filters.priorityTier !== 'all') {
    query = query.eq('priority_tier', filters.priorityTier);
  }

  if (filters.country) {
    query = query.ilike('country', `%${filters.country}%`);
  }

  if (filters.organization) {
    query = query.ilike('organization', `%${filters.organization}%`);
  }

  if (filters.lateConfirmation === 'yes') {
    query = query.eq('exception_badge_required', true);
  }

  if (filters.speakerFlag === 'yes') {
    query = query.eq('speaker_flag', true);
  }

  if (filters.search) {
    const sanitizedSearch = String(filters.search).trim();
    query = query.or(
      `first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%,registration_code.ilike.%${sanitizedSearch}%,organization.ilike.%${sanitizedSearch}%`
    );
  }

  const { data, count, error } = await query.limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const summary = {
    total: count || 0,
    pending: 0,
    confirmed: 0,
    waitlisted: 0,
    rejected: 0,
    qrIssued: 0,
    checkedIn: 0,
    exceptionBadges: 0,
  };

  const normalizedRegistrations = (data || []).map((registration) =>
    normalizeRegistrationRecord(registration)
  );

  for (const registration of normalizedRegistrations) {
    if (registration.status === 'pending') summary.pending += 1;
    if (registration.status === 'confirmed') summary.confirmed += 1;
    if (registration.status === 'waitlisted') summary.waitlisted += 1;
    if (registration.status === 'rejected') summary.rejected += 1;
    if (registration.qr_pass_issued_at) summary.qrIssued += 1;
    if (registration.checked_in_at) summary.checkedIn += 1;
    if (registration.exception_badge_required) summary.exceptionBadges += 1;
  }

  return {
    registrations: normalizedRegistrations,
    count: count || 0,
    summary,
  };
}

// One snapshot read plus one transactional RPC for a single or bulk review:
// status, history, notifications and the email job are written together.
export async function applyRegistrationReviews({
  updates,
  status,
  reviewNotes,
  speakerFlag,
  vipFlag,
  operator,
  maxEmailAttempts = 3,
}) {
  const ids = [
    ...new Set(
      updates
        .map((update) => String(update?.registrationId || '').trim())
        .filter(Boolean)
    ),
  ];
  const snapshots = await getRegistrationReviewSnapshots(ids);
  const { items, missingIds } = buildRegistrationReviewItems({
    updates,
    snapshots,
    reviewNotes,
    speakerFlag,
    vipFlag,
    getBadgeColor,
  });

  if (!items.length) {
    return {
      registrations: [],
      conflictIds: [],
      missingIds,
      jobId: null,
      emailCount: 0,
    };
  }

  const { data, error } = await getSupabase().rpc(
    'apply_registration_reviews',
    {
      p_items: items,
      p_status: status,
      p_exception_badge_required:
        status === 'confirmed' && isAfterBadgeFreeze(),
      p_history_notes:
        typeof reviewNotes === 'string' ? reviewNotes.trim() || null : null,
      p_actor_clerk_id: operator?.userId || null,
      p_actor_email: operator?.primaryEmail || null,
      p_max_attempts: maxEmailAttempts,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const previousStatuses = data?.previous_statuses || {};
  return {
    registrations: (data?.registrations || []).map((registration) => ({
      ...normalizeRegistrationRecord(registration),
      previousStatus: previousStatuses[registration.id] ?? null,
    })),
    conflictIds: data?.conflict_ids || [],
    missingIds,
    jobId: data?.job_id || null,
    emailCount: data?.email_count || 0,
  };
}

export async function getConfirmedRegistrationsForPassIssue() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('event_registrations')
    .select(baseRegistrationSelect())
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((registration) =>
    normalizeRegistrationRecord(registration)
  );
}

export async function issuePassForRegistration({
  registrationId,
  registration: loadedRegistration = null,
  operator,
}) {
  // Callers that already hold the full row (the QR worker) pass it in.
  const registration =
    loadedRegistration?.id === registrationId
      ? loadedRegistration
      : await getRegistrationById(registrationId);

  if (registration.status !== 'confirmed') {
    throw new Error('Only confirmed attendees can receive a QR pass.');
  }

  const existingPass = getIssuedEntryPass(registration.entry_passes);
  const supabase = getSupabase();

  if (existingPass) {
    return {
      registration: {
        ...registration,
        qr_token: existingPass.token,
      },
      created: false,
      passId: existingPass.id,
      token: existingPass.token,
    };
  }

  const token = buildPassToken();
  const { data: createdPass, error: passError } = await supabase
    .from('entry_passes')
    .insert({
      registration_id: registrationId,
      token,
      status: 'issued',
      issued_at: new Date().toISOString(),
      issued_by_clerk_id: operator.userId,
      issued_by_email: operator.primaryEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (passError) {
    throw new Error(passError.message);
  }

  const exceptionBadgeRequired = isAfterBadgeFreeze();
  const { data, error } = await supabase
    .from('event_registrations')
    .update({
      exception_badge_required:
        registration.exception_badge_required || exceptionBadgeRequired,
      updated_at: new Date().toISOString(),
    })
    .eq('id', registrationId)
    .select(baseRegistrationSelect())
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    registration: {
      ...normalizeRegistrationRecord(data),
      qr_token: token,
    },
    created: true,
    passId: createdPass?.id || null,
    token,
  };
}

export async function markQrPassIssued({ registrationId, operator }) {
  const supabase = getSupabase();
  const issuedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('event_registrations')
    .update({
      qr_pass_issued_at: issuedAt,
      updated_at: issuedAt,
    })
    .eq('id', registrationId)
    .is('qr_pass_issued_at', null)
    .select('id, status, qr_pass_issued_at')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return { updated: false, issuedAt: null };
  }

  await appendStatusHistory({
    registrationId,
    previousStatus: data.status,
    nextStatus: data.status,
    actorClerkId: operator.userId,
    actorEmail: operator.primaryEmail,
    actionType: 'qr_pass_issued',
    notes: 'QR pass issued and email accepted for delivery.',
  });

  return { updated: true, issuedAt: data.qr_pass_issued_at || issuedAt };
}

export async function listBadgeExportRegistrations() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('event_registrations')
    .select(baseRegistrationSelect())
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((registration) => {
    const normalizedRegistration = normalizeRegistrationRecord(registration);
    const issuedPass = getIssuedEntryPass(normalizedRegistration.entry_passes);

    return {
      ...normalizedRegistration,
      qr_token: issuedPass?.token || '',
    };
  });
}

export async function recordBadgeExport({
  operator,
  format,
  totalRegistrations,
  frozenAt,
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('badge_exports')
    .insert({
      export_format: format,
      total_registrations: totalRegistrations,
      frozen_at: frozenAt,
      created_by_clerk_id: operator.userId,
      created_by_email: operator.primaryEmail,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

// Each id goes into the request URL. The Supabase gateway answered a 25 KB
// URL (645 ids) with 400 Bad Request, so update in batches of ~4 KB each.
const BADGE_EXPORT_UPDATE_BATCH_SIZE = 100;

export async function setLastBadgeExportBatch(batchId, registrationIds) {
  if (!registrationIds.length) {
    return;
  }

  const supabase = getSupabase();
  const updatedAt = new Date().toISOString();
  for (
    let start = 0;
    start < registrationIds.length;
    start += BADGE_EXPORT_UPDATE_BATCH_SIZE
  ) {
    const { error } = await supabase
      .from('event_registrations')
      .update({
        last_badge_export_batch_id: batchId,
        updated_at: updatedAt,
      })
      .in(
        'id',
        registrationIds.slice(start, start + BADGE_EXPORT_UPDATE_BATCH_SIZE)
      );

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function searchCheckInCandidates(query) {
  const supabase = getSupabase();
  const sanitized = String(query || '').trim();

  if (!sanitized) {
    return [];
  }

  const { data, error } = await supabase
    .from('event_registrations')
    .select(baseRegistrationSelect())
    .or(
      `first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,registration_code.ilike.%${sanitized}%`
    )
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((registration) =>
    normalizeRegistrationRecord(registration)
  );
}

export async function getRegistrationByToken(token) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('entry_passes')
    .select(
      `id, token, status, issued_at, revoked_at, registration:event_registrations(${baseRegistrationSelect()})`
    )
    .eq('token', token)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        pass: null,
        registration: null,
      };
    }

    throw new Error(error.message);
  }

  const registration = Array.isArray(data.registration)
    ? data.registration[0]
    : data.registration;
  return {
    pass: data,
    registration: normalizeRegistrationRecord(registration),
  };
}

export async function getEntryPassById(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('entry_passes')
    .select(
      `id, token, status, issued_at, revoked_at, registration:event_registrations(${baseRegistrationSelect()})`
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        pass: null,
        registration: null,
      };
    }

    throw new Error(error.message);
  }

  const registration = Array.isArray(data.registration)
    ? data.registration[0]
    : data.registration;
  return {
    pass: data,
    registration: normalizeRegistrationRecord(registration),
  };
}

export async function recordScan({
  registrationId,
  passId = null,
  token = null,
  result,
  operator,
  deskLabel,
  notes,
  eventDay,
}) {
  const supabase = getSupabase();
  const { error } = await supabase.from('entry_scans').insert({
    registration_id: registrationId,
    entry_pass_id: passId,
    token,
    event_day: getCheckInDayNumber(eventDay),
    scan_result: result,
    desk_label: deskLabel || null,
    notes: notes || null,
    actor_clerk_id: operator.userId,
    actor_email: operator.primaryEmail,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function markCheckedIn({
  registrationId,
  operator,
  deskLabel,
  passId = null,
  token = null,
  eventDay,
}) {
  const registration = await getRegistrationById(registrationId);
  const supabase = getSupabase();
  const normalizedDay = normalizeCheckInDay(eventDay);
  const checkedInAt = new Date().toISOString();
  const alreadyCheckedInBeforeInsert = isCheckedInForDay(
    registration,
    normalizedDay
  );

  let alreadyCheckedIn = alreadyCheckedInBeforeInsert;

  if (!alreadyCheckedInBeforeInsert) {
    const { error: insertError } = await supabase
      .from('registration_daily_check_ins')
      .insert({
        registration_id: registrationId,
        event_day: getCheckInDayNumber(normalizedDay),
        checked_in_at: checkedInAt,
        entry_pass_id: passId,
        token,
        desk_label: deskLabel || null,
        actor_clerk_id: operator.userId,
        actor_email: operator.primaryEmail,
        notes: `Checked in for ${normalizedDay.replace('_', ' ')}.`,
        created_at: checkedInAt,
        updated_at: checkedInAt,
      })
      .select('id')
      .maybeSingle();

    if (insertError && !isUniqueViolation(insertError)) {
      throw new Error(insertError.message);
    }

    alreadyCheckedIn = Boolean(insertError);
  }

  if (!alreadyCheckedIn) {
    const { error } = await supabase
      .from('event_registrations')
      .update({
        checked_in_at: checkedInAt,
        updated_at: checkedInAt,
      })
      .eq('id', registrationId)
      .is('checked_in_at', null);

    if (error) {
      throw new Error(error.message);
    }
  }

  await recordScan({
    registrationId,
    passId,
    token,
    result: alreadyCheckedIn ? 'already_checked_in' : 'valid',
    operator,
    deskLabel,
    notes: alreadyCheckedIn
      ? `Duplicate ${normalizedDay.replace('_', ' ')} check-in attempt.`
      : `Checked in successfully for ${normalizedDay.replace('_', ' ')}.`,
    eventDay: normalizedDay,
  });

  return {
    registration: await getRegistrationById(registrationId),
    alreadyCheckedIn,
    eventDay: normalizedDay,
  };
}

export async function updateNotificationFromWebhook({
  providerMessageId,
  deliveryStatus,
  failureReason = null,
  providerPayload = null,
}) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('registration_notifications')
    .update({
      delivery_status: deliveryStatus,
      failure_reason: failureReason,
      provider_payload: providerPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('provider_message_id', providerMessageId);

  if (error) {
    throw new Error(error.message);
  }
}
