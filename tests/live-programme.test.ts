import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLiveProgramme,
  type LiveSession,
} from '../core/ui/site/live-programme.ts';

// "Happening now" logic (docs/system-design.md §16.3). All fixtures run in
// Asia/Kolkata (+05:30) like the demo event; times are ISO with explicit
// offsets so the tests don't depend on the host clock.

const TZ = 'Asia/Kolkata';

function session(
  partial: Partial<LiveSession> & { startsAt: string; endsAt: string }
): LiveSession {
  return {
    id: partial.id ?? partial.startsAt,
    title: partial.title ?? 'A session',
    room: partial.room ?? null,
    track: partial.track ?? null,
    speakers: partial.speakers ?? [],
    ...partial,
  };
}

// A two-day programme (like Orbit Summit, 10:00–16:00 IST each day).
const PROGRAMME: LiveSession[] = [
  session({
    id: 'd1-open',
    title: 'Doors open',
    startsAt: '2026-12-18T10:00:00+05:30',
    endsAt: '2026-12-18T10:30:00+05:30',
    room: 'Main stage',
  }),
  session({
    id: 'd1-keynote',
    title: 'Opening keynote',
    startsAt: '2026-12-18T10:30:00+05:30',
    endsAt: '2026-12-18T11:30:00+05:30',
    room: 'Main stage',
    speakers: ['Ada Lovelace'],
  }),
  session({
    id: 'd1-build',
    title: 'Shipping under load',
    startsAt: '2026-12-18T11:30:00+05:30',
    endsAt: '2026-12-18T12:30:00+05:30',
    room: 'Build track',
  }),
  session({
    id: 'd2-keynote',
    title: 'Day two keynote',
    startsAt: '2026-12-19T10:00:00+05:30',
    endsAt: '2026-12-19T11:00:00+05:30',
    room: 'Main stage',
  }),
];

test('inactive before the event and on unrelated days', () => {
  assert.equal(
    getLiveProgramme(PROGRAMME, TZ, new Date('2026-12-01T12:00:00Z')).state,
    'inactive'
  );
  // The day AFTER the last day is "ended", the day between days is live.
  assert.equal(
    getLiveProgramme(PROGRAMME, TZ, new Date('2026-12-20T12:00:00Z')).state,
    'ended'
  );
});

test('before state on the event morning', () => {
  const live = getLiveProgramme(
    PROGRAMME,
    TZ,
    new Date('2026-12-18T02:00:00Z')
  ); // 07:30 IST on day 1
  assert.equal(live.state, 'before');
  if (live.state === 'before') {
    assert.equal(live.firstSlot.startLabel, '10:00');
    assert.equal(live.firstSlot.session.title, 'Doors open');
  }
});

test('live state reports the running session with progress', () => {
  const live = getLiveProgramme(
    PROGRAMME,
    TZ,
    new Date('2026-12-18T05:30:00Z')
  ); // 11:00 IST: keynote half through
  assert.equal(live.state, 'live');
  if (live.state !== 'live') return;

  const main = live.columns.find((c) => c.label === 'Main stage');
  assert.ok(main, 'main stage column exists');
  assert.equal(main?.now?.session.id, 'd1-keynote');
  assert.ok(Math.abs((main?.now?.progress ?? 0) - 0.5) < 0.01);
  assert.equal(main?.now?.minutes, 30); // keynote ends 11:30 IST
  assert.equal(main?.next, null); // nothing after the keynote on main day 1

  const build = live.columns.find((c) => c.label === 'Build track');
  assert.equal(build?.now, null);
  assert.equal(build?.next?.session.id, 'd1-build'); // starts 11:30 IST
});

test('columns fall back to track when there is no room', () => {
  const noRoom = [
    session({
      title: 'Track talk',
      startsAt: '2026-12-18T10:00:00+05:30',
      endsAt: '2026-12-18T11:00:00+05:30',
      track: 'Build',
      room: null,
    }),
  ];
  const live = getLiveProgramme(noRoom, TZ, new Date('2026-12-18T05:00:00Z'));
  if (live.state === 'live' || live.state === 'before') {
    assert.equal(live.columns[0]?.label, 'Build');
  } else {
    assert.fail('expected a live-day state');
  }
});

test('after state points at the next day', () => {
  const live = getLiveProgramme(
    PROGRAMME,
    TZ,
    new Date('2026-12-18T11:30:00Z')
  ); // 17:00 IST: day 1 done
  assert.equal(live.state, 'after');
  if (live.state === 'after') {
    assert.ok(live.nextDay?.dayLabel.includes('19'));
    assert.equal(live.nextDay?.startLabel, '10:00');
  }
});

test('the clock label is event-local, not device-local', () => {
  const live = getLiveProgramme(
    PROGRAMME,
    TZ,
    new Date('2026-12-18T06:00:00Z')
  ); // 11:30 IST
  if (live.state !== 'live' && live.state !== 'before') {
    assert.fail('expected a live-day state');
  } else {
    assert.equal(live.clockLabel, '11:30');
    assert.equal(live.dayLabel.includes('18'), true);
  }
});

test('sessions without times are ignored, empty programme is inactive', () => {
  assert.equal(getLiveProgramme([], TZ).state, 'inactive');
  const untimed: LiveSession[] = [
    {
      id: 'x',
      title: 'TBD',
      startsAt: '',
      endsAt: '',
      room: null,
      track: null,
      speakers: [],
    },
  ];
  assert.equal(getLiveProgramme(untimed, TZ).state, 'inactive');
});

test('next and later slots are filled per column', () => {
  const live = getLiveProgramme(
    PROGRAMME,
    TZ,
    new Date('2026-12-18T04:15:00Z')
  ); // 09:45 IST: nothing running yet
  if (live.state !== 'before' && live.state !== 'live') {
    assert.fail('expected a live-day state');
    return;
  }
  const main = live.columns.find((c) => c.label === 'Main stage');
  assert.equal(main?.now, null);
  assert.equal(main?.next?.session.id, 'd1-open');
  assert.equal(main?.later?.session.id, 'd1-keynote');
});
