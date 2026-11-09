const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAgendaIcs,
  findAgendaClashes,
  formatDayHeading,
  formatSelectedDateRange,
  getDaySubtitle,
  getEditionYear,
  getSessionSpeakerNames,
  parseTimeRange,
} = require('../src/lib/agenda-builder-utils.cjs');

const dayDateMap = { oct13: '20261013', oct14: '20261014', oct15: '20261015' };

test('parseTimeRange reads en-dash ranges and single times', () => {
  assert.deepEqual(parseTimeRange('18:00–20:00'), {
    start: 1080,
    end: 1200,
    hasExplicitEnd: true,
  });
  assert.deepEqual(parseTimeRange('9:00'), {
    start: 540,
    end: 570,
    hasExplicitEnd: false,
  });
  assert.equal(parseTimeRange('TBD'), null);
  assert.equal(parseTimeRange('All day'), null);
});

test('findAgendaClashes flags partial overlaps but not nested sessions', () => {
  const sessions = [
    { id: 'reception', day: 'oct13', time: '18:00–20:00' },
    { id: 'spotlight', day: 'oct13', time: '18:35–18:50' },
    { id: 'workshop', day: 'oct14', time: '10:30–11:30' },
    { id: 'roundtable', day: 'oct14', time: '10:00–11:00' },
    { id: 'later', day: 'oct14', time: '11:30–12:00' },
    { id: 'other-day', day: 'oct15', time: '10:30–11:30' },
  ];
  const clashes = findAgendaClashes(sessions);

  assert.equal(clashes.has('reception'), false);
  assert.equal(clashes.has('spotlight'), false);
  assert.deepEqual(
    clashes.get('workshop').map((s) => s.id),
    ['roundtable']
  );
  assert.deepEqual(
    clashes.get('roundtable').map((s) => s.id),
    ['workshop']
  );
  assert.equal(clashes.has('later'), false);
  assert.equal(clashes.has('other-day'), false);
});

test('findAgendaClashes flags identical slots in different rooms', () => {
  const clashes = findAgendaClashes([
    { id: 'a', day: 'oct14', time: '14:00–15:00' },
    { id: 'b', day: 'oct14', time: '14:00–15:00' },
  ]);
  assert.deepEqual(
    clashes.get('a').map((s) => s.id),
    ['b']
  );
});

test('formatSelectedDateRange describes the chosen days', () => {
  assert.equal(
    formatSelectedDateRange(['oct14'], dayDateMap),
    '14 October 2026'
  );
  assert.equal(
    formatSelectedDateRange(['oct15', 'oct14'], dayDateMap),
    '14–15 October 2026'
  );
  assert.equal(
    formatSelectedDateRange(['oct13', 'oct15'], dayDateMap),
    '13 & 15 October 2026'
  );
  assert.equal(formatSelectedDateRange([], dayDateMap), '');
});

test('day helpers build headings and subtitles', () => {
  assert.equal(formatDayHeading('oct13', dayDateMap), 'Tuesday, 13 October');
  assert.equal(formatDayHeading('missing', dayDateMap), '');
  assert.equal(
    getDaySubtitle('October 14 - Conference Day 1'),
    'Conference Day 1'
  );
  assert.equal(getDaySubtitle('Day 1'), 'Day 1');
  assert.equal(getEditionYear(dayDateMap), '2026');
  assert.equal(getEditionYear({}), '');
});

test('getSessionSpeakerNames ignores empty speaker lists', () => {
  assert.deepEqual(getSessionSpeakerNames({ speakers: [] }), []);
  assert.deepEqual(getSessionSpeakerNames({ speakers: ['A', ''] }), ['A']);
  assert.deepEqual(getSessionSpeakerNames({}), []);
});

test('buildAgendaIcs writes one IST event per timed session', () => {
  const ics = buildAgendaIcs({
    sessions: [
      {
        id: 'evt26-1',
        day: 'oct13',
        time: '18:00–20:00',
        title: 'Opening Reception',
        venue: 'German Embassy',
        description: 'Welcome, remarks; networking',
      },
      { id: 'tbd', day: 'oct14', time: 'TBD', title: 'Skipped' },
    ],
    dayDateMap,
    eventName: 'Mash Event 2026',
    now: new Date('2026-10-01T00:00:00Z'),
  });

  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /DTSTART;TZID=Asia\/Kolkata:20261013T180000/);
  assert.match(ics, /DTEND;TZID=Asia\/Kolkata:20261013T200000/);
  assert.match(ics, /SUMMARY:Mash Event 2026: Opening Reception/);
  assert.match(ics, /DESCRIPTION:Welcome\\, remarks\\; networking/);
  assert.match(ics, /LOCATION:German Embassy\\, New Delhi\\, India/);
  assert.match(ics, /DTSTAMP:20261001T000000Z/);
});

test('getSessionDescription hides the placeholder copy', () => {
  const {
    getSessionDescription,
  } = require('../src/lib/agenda-builder-utils.cjs');
  assert.equal(
    getSessionDescription({
      description: 'Further details about this session will be shared soon.',
    }),
    ''
  );
  assert.equal(
    getSessionDescription({ description: ' Real copy ' }),
    'Real copy'
  );
  assert.equal(getSessionDescription({ topic: 'From topic' }), 'From topic');
});
