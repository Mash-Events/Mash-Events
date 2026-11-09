// "Now and Next" for the festival days, worked out purely from the public
// programme. Everything is calculated in IST (+05:30) so a visitor whose
// device is set to another timezone still sees the right session.
//
// Only 14 and 15 October count as live days; on any other date
// getLiveProgramme() returns { state: 'inactive' } and the UI renders
// nothing. Off-site, invite-only evening receptions are left out.

const IST_OFFSET = '+05:30';

const FESTIVAL_DAYS = [
  { key: 'oct14', date: '2026-10-14', label: 'Day 1', weekday: 'Wed' },
  { key: 'oct15', date: '2026-10-15', label: 'Day 2', weekday: 'Thu' },
];

const ROOMS = ['Main Hall', 'Workshop Room', 'Roundtable Room'];
const SHARED_SPACE = 'Lobby';

const MINUTE = 60 * 1000;

function toTime(now) {
  return now instanceof Date ? now.getTime() : Number(now);
}

function istTimestamp(date, hhmm) {
  return Date.parse(`${date}T${hhmm}:00${IST_OFFSET}`);
}

function parseSlot(date, time) {
  const [start, end] = String(time)
    .split(/[–-]/)
    .map((part) => part.trim());
  if (!/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '')) {
    return null;
  }
  return { start: istTimestamp(date, start), end: istTimestamp(date, end) };
}

function festivalDayFor(time) {
  return (
    FESTIVAL_DAYS.find(
      (day) =>
        time >= istTimestamp(day.date, '00:00') &&
        time < istTimestamp(day.date, '00:00') + 24 * 60 * MINUTE
    ) || null
  );
}

function withSlot(session, day) {
  const slot = parseSlot(day.date, session.time);
  return slot ? { ...session, ...slot } : null;
}

function describeNow(session, time) {
  const duration = session.end - session.start;
  return {
    ...session,
    progress: duration > 0 ? (time - session.start) / duration : 0,
    minutesLeft: Math.max(1, Math.ceil((session.end - time) / MINUTE)),
  };
}

function describeNext(session, time) {
  return {
    ...session,
    minutesUntil: Math.max(1, Math.ceil((session.start - time) / MINUTE)),
  };
}

function nowAndNext(sessions, time) {
  const current = sessions.find(
    (session) => session.start <= time && time < session.end
  );
  const [upcoming, later] = sessions.filter((session) => session.start > time);
  return {
    now: current ? describeNow(current, time) : null,
    next: upcoming ? describeNext(upcoming, time) : null,
    later: later ? describeNext(later, time) : null,
  };
}

function getLiveProgramme(sessions = [], now = new Date()) {
  const time = toTime(now);
  const day = festivalDayFor(time);
  if (!day) return { state: 'inactive' };

  const todays = sessions
    .filter((session) => session.day === day.key)
    .map((session) => withSlot(session, day))
    .filter(Boolean)
    .filter(
      (session) =>
        ROOMS.includes(session.venue) || session.venue === SHARED_SPACE
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (todays.length === 0) return { state: 'inactive' };

  const firstStart = todays[0].start;
  const lastEnd = Math.max(...todays.map((session) => session.end));
  const nextDay = FESTIVAL_DAYS[FESTIVAL_DAYS.indexOf(day) + 1] || null;
  const nextDayStart = nextDay
    ? sessions
        .filter((session) => session.day === nextDay.key)
        .map(slotStart)
        .sort()[0] || null
    : null;

  let state = 'live';
  if (time < firstStart) state = 'before';
  else if (time >= lastEnd) state = nextDay ? 'after' : 'ended';

  const rooms = ROOMS.map((room) => ({
    room,
    ...nowAndNext(
      todays.filter((session) => session.venue === room),
      time
    ),
  }));

  return {
    state,
    day,
    nextDay,
    nextDayStart,
    firstSession: todays[0],
    rooms,
    lobby: nowAndNext(
      todays.filter((session) => session.venue === SHARED_SPACE),
      time
    ),
  };
}

// For the programme list: is this session on now, finished, or still to
// come? Returns null outside the live festival days.
function getSessionLiveStatus(session, now = new Date()) {
  const time = toTime(now);
  const day = festivalDayFor(time);
  if (!day || session.day !== day.key) {
    const sessionDay = FESTIVAL_DAYS.find((item) => item.key === session.day);
    if (!day || !sessionDay) return null;
    return FESTIVAL_DAYS.indexOf(sessionDay) < FESTIVAL_DAYS.indexOf(day)
      ? 'past'
      : 'upcoming';
  }

  const slot = parseSlot(day.date, session.time);
  if (!slot) return null;
  if (time >= slot.end) return 'past';
  if (time >= slot.start) return 'live';
  return 'upcoming';
}

function formatIstClock(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(toTime(now)));
}

function slotStart(session) {
  return String(session.time).split(/[–-]/)[0].trim();
}

module.exports = {
  FESTIVAL_DAYS,
  ROOMS,
  SHARED_SPACE,
  formatIstClock,
  getLiveProgramme,
  getSessionLiveStatus,
  slotStart,
};
