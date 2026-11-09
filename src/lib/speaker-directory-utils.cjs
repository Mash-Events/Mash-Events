const ALL_SPEAKERS_LABEL = 'All Speakers';
const VIP_LABEL = 'Keynote Speaker';
const SPEAKERS_PER_PAGE = 9;
const VIP_SPEAKERS = new Set(['Dr. Subrahmanyam Jaishankar', 'Jitin Prasada']);

function getSpeakerInitials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'SP';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function getSpeakerLinkedInUrl(speaker = {}) {
  if (speaker.linkedinUrl) {
    return speaker.linkedinUrl;
  }

  const query = encodeURIComponent(
    `${speaker.name || ''} ${speaker.designation || ''}`.trim()
  );

  return `https://www.linkedin.com/search/results/all/?keywords=${query}`;
}

function getSpeakerPhotoSrc(speaker = {}) {
  if (!speaker.photo) {
    return '';
  }

  return speaker.photo.startsWith('/')
    ? speaker.photo
    : `/img/speakers/${speaker.photo}`;
}

function buildSpeakerSlug(name = '') {
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSpeakerProfilePath(speaker = {}) {
  const slug = buildSpeakerSlug(speaker.name);
  if (!slug) return '/speakers';
  return speaker.edition === '2026'
    ? `/speakers/2026/${slug}`
    : `/speakers/${slug}`;
}

function findSpeakerBySlug(speakers = [], slug = '') {
  return speakers.find((speaker) => buildSpeakerSlug(speaker.name) === slug);
}

function isVipSpeaker(speakerOrName) {
  const name =
    typeof speakerOrName === 'string' ? speakerOrName : speakerOrName?.name;

  return VIP_SPEAKERS.has(name);
}

function buildSpeakerCategories(speakers = []) {
  const categories = new Set(
    speakers.map((speaker) => speaker.category).filter(Boolean)
  );
  const hasOther = categories.delete('Other');
  return [ALL_SPEAKERS_LABEL, ...categories, ...(hasOther ? ['Other'] : [])];
}

function speakerMatchesQuery(speaker = {}, query = '') {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [speaker.name, speaker.designation, speaker.bio]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function filterSpeakers(
  speakers = [],
  { activeCategory = ALL_SPEAKERS_LABEL, query = '' } = {}
) {
  return speakers.filter((speaker) => {
    const matchesCategory =
      activeCategory === ALL_SPEAKERS_LABEL ||
      speaker.category === activeCategory;

    return matchesCategory && speakerMatchesQuery(speaker, query);
  });
}

function paginateSpeakers(
  speakers = [],
  currentPage = 1,
  pageSize = SPEAKERS_PER_PAGE
) {
  const totalPages = Math.max(1, Math.ceil(speakers.length / pageSize));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (currentPageSafe - 1) * pageSize;

  return {
    currentPageSafe,
    totalPages,
    pageItems: speakers.slice(startIndex, startIndex + pageSize),
  };
}

module.exports = {
  ALL_SPEAKERS_LABEL,
  SPEAKERS_PER_PAGE,
  VIP_LABEL,
  VIP_SPEAKERS,
  buildSpeakerCategories,
  filterSpeakers,
  buildSpeakerSlug,
  findSpeakerBySlug,
  getSpeakerInitials,
  getSpeakerLinkedInUrl,
  getSpeakerPhotoSrc,
  getSpeakerProfilePath,
  isVipSpeaker,
  paginateSpeakers,
  speakerMatchesQuery,
};
