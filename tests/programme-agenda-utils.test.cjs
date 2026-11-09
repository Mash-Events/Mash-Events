const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProgrammeSessionViewModels,
  buildProgrammeSessionSlug,
  getProgrammeSessionPath,
  normalizePersonName,
  resolveMappedPersonValue,
  shouldShowProgrammeSession,
  sortProgrammeSessionsForAgenda,
} = require('../src/lib/programme-agenda-utils.cjs');

test('sortProgrammeSessionsForAgenda returns sessions in agenda day and time order', () => {
  const sorted = sortProgrammeSessionsForAgenda([
    {
      id: 'dome-late',
      day: 'oct7',
      time: '10:20',
      venue: 'Dome',
      title: 'Keynote Speech',
    },
    {
      id: 'oct6-opening',
      day: 'oct6',
      time: '17:00',
      venue: 'Dome',
      title: 'Opening remarks',
    },
    {
      id: 'tango-early',
      day: 'oct7',
      time: '9:00',
      venue: 'Tango',
      title: 'Child Safety',
    },
    {
      id: 'dome-early',
      day: 'oct7',
      time: '9:00',
      venue: 'Dome',
      title: 'Welcome remarks',
    },
    {
      id: 'oct6-tbd',
      day: 'oct6',
      time: 'TBD',
      venue: 'Dome',
      title: 'Spotlight',
    },
  ]);

  assert.deepEqual(
    sorted.map((session) => session.id),
    ['oct6-tbd', 'oct6-opening', 'tango-early', 'dome-early', 'dome-late']
  );
});

test('programme helpers build crawlable session slugs and paths', () => {
  const session = {
    id: 'evt25-12',
    title: 'Platform Accountability',
  };

  assert.equal(
    buildProgrammeSessionSlug(session),
    'evt25-12-platform-accountability'
  );
  assert.equal(
    getProgrammeSessionPath(session),
    '/programme/session/evt25-12-platform-accountability'
  );
});

test('sortProgrammeSessionsForAgenda does not mutate the original sessions array', () => {
  const sessions = [
    { id: 'later', day: 'oct8', time: '15:15', venue: 'Dome' },
    { id: 'earlier', day: 'oct8', time: '9:15', venue: 'Dome' },
  ];

  const result = sortProgrammeSessionsForAgenda(sessions);

  assert.notEqual(result, sessions);
  assert.deepEqual(
    sessions.map((session) => session.id),
    ['later', 'earlier']
  );
});

test('programme helper normalizes speaker names for shared page and client lookups', () => {
  assert.equal(
    normalizePersonName('Moderator: Dr. Yoel Roth, PhD'),
    'yoel roth'
  );
  assert.equal(
    resolveMappedPersonValue('Prof. Julie Inman Grant', {
      julieinmangrant: '/img/speakers/Julie_Inman_Grant.webp',
    }),
    '/img/speakers/Julie_Inman_Grant.webp'
  );
});

test('buildProgrammeSessionViewModels removes non-agenda rows and enriches speakers', () => {
  const sessions = [
    {
      id: 'skip-registration',
      title: 'Registration + Tea/Coffee',
      speakers: [],
    },
    {
      id: 'main-session',
      title: 'Main Session',
      description: 'Trust and safety discussion',
      speakers: ['Dr. Ranjana Kumari'],
    },
  ];

  assert.equal(shouldShowProgrammeSession(sessions[0]), false);

  const viewModels = buildProgrammeSessionViewModels({
    sessions,
    speakerDesignationMap: {
      'ranjana kumari': 'Director, Example Organisation',
    },
    speakerPhotoMap: {
      'ranjana kumari': '/img/speakers/Ranjana Kumari.webp',
    },
  });

  assert.deepEqual(viewModels, [
    {
      id: 'main-session',
      title: 'Main Session',
      description: 'Trust and safety discussion',
      topic: 'Trust and safety discussion',
      speakers: ['Dr. Ranjana Kumari'],
      speakersDetailed: [
        {
          name: 'Dr. Ranjana Kumari',
          title: 'Director, Example Organisation',
          photo: '/img/speakers/Ranjana Kumari.webp',
          mod: false,
        },
      ],
    },
  ]);
});
