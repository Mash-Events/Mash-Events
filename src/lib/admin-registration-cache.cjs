const DEFAULT_LIST_TTL_MS = 60 * 1000;
const DEFAULT_DETAIL_TTL_MS = 2 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function createMemoryCache({ ttlMs, getNow = nowMs } = {}) {
  const entries = new Map();
  const ttl = Number(ttlMs || 0);

  function set(key, value) {
    entries.set(String(key), {
      value,
      cachedAt: getNow(),
    });
  }

  function get(key, { maxAgeMs = ttl } = {}) {
    const entry = entries.get(String(key));
    if (!entry) return null;

    if (Number(maxAgeMs) > 0 && getNow() - entry.cachedAt > maxAgeMs) {
      entries.delete(String(key));
      return null;
    }

    return entry.value;
  }

  function deleteEntry(key) {
    entries.delete(String(key));
  }

  function clear() {
    entries.clear();
  }

  return {
    set,
    get,
    delete: deleteEntry,
    clear,
    size: () => entries.size,
  };
}

function applyRegistrationListCache(cache, key, value) {
  cache.set(key, value);
}

function readRegistrationListCache(cache, key) {
  return cache.get(key);
}

function applySavedRegistrationsToList(state, savedRegistrations = []) {
  const savedById = new Map(
    savedRegistrations
      .filter((registration) => registration?.id)
      .map((registration) => [registration.id, registration])
  );
  if (!state?.registrations?.length || !savedById.size) return state;

  let changed = false;
  const registrations = state.registrations.map((registration) => {
    const saved = savedById.get(registration.id);
    if (!saved) return registration;
    changed = true;
    return {
      ...registration,
      status: saved.status,
      updated_at: saved.updated_at,
      reviewed_at: saved.reviewed_at,
      speaker_flag: saved.speaker_flag,
      vip_flag: saved.vip_flag,
      exception_badge_required: saved.exception_badge_required,
      badge_color_label: saved.badge_color_label,
      badge_color_hex: saved.badge_color_hex,
      has_review_note: Boolean(saved.review_notes?.trim()),
    };
  });

  return changed ? { ...state, registrations } : state;
}

function applyRegistrationDetailCache(cache, registrationId, value) {
  cache.set(registrationId, value);
}

function readRegistrationDetailCache(cache, registrationId) {
  return cache.get(registrationId);
}

function invalidateRegistrationCaches({
  listCache,
  detailCache,
  registrationIds = [],
} = {}) {
  if (listCache) listCache.clear();

  if (detailCache) {
    for (const registrationId of registrationIds) {
      detailCache.delete(registrationId);
    }
  }
}

module.exports = {
  DEFAULT_LIST_TTL_MS,
  DEFAULT_DETAIL_TTL_MS,
  createMemoryCache,
  applyRegistrationListCache,
  readRegistrationListCache,
  applySavedRegistrationsToList,
  applyRegistrationDetailCache,
  readRegistrationDetailCache,
  invalidateRegistrationCaches,
};
