const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALL_SPEAKERS_LABEL,
  buildSpeakerSlug,
  buildSpeakerCategories,
  filterSpeakers,
  getSpeakerInitials,
  getSpeakerLinkedInUrl,
  getSpeakerPhotoSrc,
  getSpeakerProfilePath,
  isVipSpeaker,
  paginateSpeakers,
} = require('../src/lib/speaker-directory-utils.cjs');

test('speaker directory helpers build categories, initials, links, and photos', () => {
  const speakers = [
    {
      name: 'Dr. Subrahmanyam Jaishankar',
      designation: 'External Affairs Minister',
      category: 'Government',
      photo: '/img/Speaker Highlights/Dr. Subrahmanyam Jaishankar.png',
    },
    {
      name: 'Example Speaker',
      designation: 'Example role',
      category: 'Other',
    },
    {
      name: 'Yoel Roth',
      designation: 'Trust and safety expert',
      category: 'International',
      photo: 'Yoel Roth.webp',
    },
  ];

  assert.deepEqual(buildSpeakerCategories(speakers), [
    ALL_SPEAKERS_LABEL,
    'Government',
    'International',
    'Other',
  ]);
  assert.equal(getSpeakerInitials('Yoel Roth'), 'YR');
  assert.equal(getSpeakerInitials(''), 'SP');
  assert.equal(getSpeakerPhotoSrc(speakers[0]), speakers[0].photo);
  assert.equal(getSpeakerPhotoSrc(speakers[2]), '/img/speakers/Yoel Roth.webp');
  assert.equal(buildSpeakerSlug('Dr. S Jaishankar'), 'dr-s-jaishankar');
  assert.equal(getSpeakerProfilePath(speakers[2]), '/speakers/yoel-roth');
  assert.equal(
    getSpeakerProfilePath({ name: 'Yoel Roth', edition: '2026' }),
    '/speakers/2026/yoel-roth'
  );
  assert.equal(isVipSpeaker(speakers[0]), true);
  assert.equal(isVipSpeaker('Jitin Prasada'), true);
  assert.equal(isVipSpeaker('Yoel Roth'), false);
  assert.match(
    getSpeakerLinkedInUrl(speakers[2]),
    /^https:\/\/www\.linkedin\.com\/search\/results\/all\/\?keywords=/
  );
});

test('speaker directory helpers filter and paginate speakers without mutating inputs', () => {
  const speakers = [
    {
      name: 'Abby Roberts',
      designation: 'Project Manager, INHOPE',
      category: 'International',
      bio: 'Child safety hotline governance',
    },
    {
      name: 'Karuna Nain',
      designation: 'Global Safety Policy',
      category: 'Civil Society',
      bio: 'Platform safety policy',
    },
    {
      name: 'Seema Jindal',
      designation: 'Policy leader',
      category: 'Technology',
      bio: 'Digital governance',
    },
  ];

  assert.deepEqual(
    filterSpeakers(speakers, {
      activeCategory: 'Civil Society',
      query: 'platform',
    }).map((speaker) => speaker.name),
    ['Karuna Nain']
  );

  const paginated = paginateSpeakers(speakers, 2, 2);

  assert.equal(paginated.currentPageSafe, 2);
  assert.equal(paginated.totalPages, 2);
  assert.deepEqual(
    paginated.pageItems.map((speaker) => speaker.name),
    ['Seema Jindal']
  );
  assert.equal(speakers.length, 3);
});
