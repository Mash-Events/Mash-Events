const DAY_ORDER = {
  oct6: 0,
  oct7: 1,
  oct8: 2,
  oct13: 3,
  oct14: 4,
  oct15: 5,
  'oct15-reception': 6,
};

function normalizePersonName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(dr|mr|mrs|ms|smt|shri|professor|prof|phd)\.?\b/g, ' ')
    .replace(/^moderator:\s*/i, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveMappedPersonValue(name, valueMap = {}) {
  const normalized = normalizePersonName(name);
  if (valueMap[normalized]) {
    return valueMap[normalized];
  }

  const compressed = normalized.replace(/\s+/g, '');
  const fallbackKey = Object.keys(valueMap).find(
    (key) => key.replace(/\s+/g, '') === compressed
  );

  return fallbackKey ? valueMap[fallbackKey] : '';
}

function shouldShowProgrammeSession(session) {
  const title = String(session?.title || '')
    .trim()
    .toLowerCase();

  return title !== 'emcee' && title !== 'registration + tea/coffee';
}

function timeSortValue(time) {
  const normalized = String(time || '').replace(/[\u2013\u2014]/g, '-');
  const match = normalized.trim().match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return 0;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function compareProgrammeSessions(left = {}, right = {}) {
  const dayDelta =
    (DAY_ORDER[left.day] ?? Number.MAX_SAFE_INTEGER) -
    (DAY_ORDER[right.day] ?? Number.MAX_SAFE_INTEGER);

  if (dayDelta !== 0) {
    return dayDelta;
  }

  const timeDelta = timeSortValue(left.time) - timeSortValue(right.time);
  if (timeDelta !== 0) {
    return timeDelta;
  }

  return String(left.title || '').localeCompare(String(right.title || ''));
}

function sortProgrammeSessionsForAgenda(sessions = []) {
  return [...sessions].sort(compareProgrammeSessions);
}

function buildProgrammeSessionSlug(session = {}) {
  const titleSlug = String(session.title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const idSlug = String(session.id || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return [idSlug, titleSlug].filter(Boolean).join('-');
}

function getProgrammeSessionPath(session = {}) {
  const slug = buildProgrammeSessionSlug(session);
  return slug ? `/programme/session/${slug}` : '/programme';
}

function findProgrammeSessionBySlug(sessions = [], slug) {
  return sessions.find(
    (session) => buildProgrammeSessionSlug(session) === slug
  );
}

// Session URLs are "<id>-<title>". When a title changes, links shared with
// the old title still carry the id, so match on the id part alone. The id
// must be followed by "-" or end the slug, so "evt26-2" never matches a
// "evt26-25-..." link.
function findProgrammeSessionByLegacySlug(sessions = [], slug = '') {
  const value = String(slug).toLowerCase();
  let best = null;
  let bestLength = 0;

  for (const session of sessions) {
    const idSlug = buildProgrammeSessionSlug({ id: session.id });
    if (!idSlug) continue;
    const matches = value === idSlug || value.startsWith(`${idSlug}-`);
    if (matches && idSlug.length > bestLength) {
      best = session;
      bestLength = idSlug.length;
    }
  }

  return best;
}

function buildProgrammeSessionViewModels({
  sessions = [],
  speakerDesignationMap = {},
  speakerPhotoMap = {},
  speakerEdition,
} = {}) {
  return sessions.filter(shouldShowProgrammeSession).map((session) => ({
    ...session,
    topic: session.description || '',
    speakersDetailed: (session.speakers || []).map((speakerName) => {
      // Speakers without a profile for this edition: details come from the
      // session. A Mash 2025 profile links to /speakers/<name>; otherwise
      // there is no link.
      const guest = session.guestSpeakers?.[speakerName];
      if (guest) {
        return {
          name: speakerName,
          title: guest.title,
          photo: guest.photo || '',
          mod: false,
          ...(guest.profile === '2025' ? {} : { hasProfile: false }),
        };
      }
      return {
        name: speakerName,
        title: resolveMappedPersonValue(speakerName, speakerDesignationMap),
        photo: resolveMappedPersonValue(speakerName, speakerPhotoMap),
        mod: false,
        // Lets getSpeakerProfilePath() link 2026 speakers to /speakers/2026/.
        ...(speakerEdition ? { edition: speakerEdition } : {}),
      };
    }),
  }));
}

module.exports = {
  DAY_ORDER,
  buildProgrammeSessionViewModels,
  buildProgrammeSessionSlug,
  findProgrammeSessionByLegacySlug,
  timeSortValue,
  compareProgrammeSessions,
  findProgrammeSessionBySlug,
  getProgrammeSessionPath,
  normalizePersonName,
  resolveMappedPersonValue,
  shouldShowProgrammeSession,
  sortProgrammeSessionsForAgenda,
};
