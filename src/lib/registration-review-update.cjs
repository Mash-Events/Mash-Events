function resolveRegistrationReviewFields(
  existing,
  { reviewNotes, speakerFlag, vipFlag }
) {
  return {
    reviewNotes:
      typeof reviewNotes === 'string'
        ? reviewNotes.trim()
        : existing.review_notes || '',
    speakerFlag:
      typeof speakerFlag === 'boolean' ? speakerFlag : existing.speaker_flag,
    vipFlag: typeof vipFlag === 'boolean' ? vipFlag : existing.vip_flag,
  };
}

// Turns a review action into apply_registration_reviews RPC items. Each item
// carries the expected updated_at (the client's, or the snapshot's), so the
// database skips any row that changed after these fields were worked out.
function buildRegistrationReviewItems({
  updates,
  snapshots,
  reviewNotes,
  speakerFlag,
  vipFlag,
  getBadgeColor,
}) {
  const items = [];
  const missingIds = [];
  const seen = new Set();

  for (const update of updates) {
    const id = String(update?.registrationId || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const snapshot = snapshots.get(id);
    if (!snapshot) {
      missingIds.push(id);
      continue;
    }

    const fields = resolveRegistrationReviewFields(snapshot, {
      reviewNotes,
      speakerFlag,
      vipFlag,
    });
    const badgeColor = getBadgeColor({
      attendeeCategory: snapshot.attendee_category,
      speakerFlag: fields.speakerFlag,
      vipFlag: fields.vipFlag,
    });

    items.push({
      id,
      expected_updated_at:
        String(update.expectedUpdatedAt || '').trim() || snapshot.updated_at,
      review_notes: fields.reviewNotes || null,
      speaker_flag: Boolean(fields.speakerFlag),
      vip_flag: Boolean(fields.vipFlag),
      badge_color_label: badgeColor.label,
      badge_color_hex: badgeColor.hex,
    });
  }

  return { items, missingIds };
}

module.exports = {
  resolveRegistrationReviewFields,
  buildRegistrationReviewItems,
};
