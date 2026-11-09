// Pure helpers for the "Build My Agenda" planner: time parsing, clash
// detection, date labels for the PDF and the .ics export.

const DEFAULT_DURATION_MINUTES = 30;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function parseClock(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// "18:00–20:00" -> { start: 1080, end: 1200 }. A single time gets a default
// duration; unparseable values ("TBD", "All day") return null.
function parseTimeRange(time, defaultDuration = DEFAULT_DURATION_MINUTES) {
  const [startPart, endPart] = String(time || '')
    .replace(/[–—]/g, '-')
    .split('-');
  const start = parseClock(startPart);
  if (start === null) return null;
  const end = parseClock(endPart);
  return {
    start,
    end: end !== null && end > start ? end : start + defaultDuration,
    hasExplicitEnd: end !== null && end > start,
  };
}

function formatClock(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Two sessions clash when they overlap on the same day and neither sits
// inside the other. Nested sessions (a spotlight inside a reception block)
// are part of the same slot, so they are not flagged.
function findAgendaClashes(sessions = []) {
  const clashes = new Map();
  const timed = sessions
    .map((session) => ({ session, range: parseTimeRange(session.time) }))
    .filter(({ range }) => range);

  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (a.session.day !== b.session.day) continue;

      const overlaps =
        a.range.start < b.range.end && b.range.start < a.range.end;
      if (!overlaps) continue;

      const aContainsB =
        a.range.start <= b.range.start && a.range.end >= b.range.end;
      const bContainsA =
        b.range.start <= a.range.start && b.range.end >= a.range.end;
      const identical =
        a.range.start === b.range.start && a.range.end === b.range.end;
      if ((aContainsB || bContainsA) && !identical) continue;

      if (!clashes.has(a.session.id)) clashes.set(a.session.id, []);
      if (!clashes.has(b.session.id)) clashes.set(b.session.id, []);
      clashes.get(a.session.id).push(b.session);
      clashes.get(b.session.id).push(a.session);
    }
  }

  return clashes;
}

function parseDayDate(yyyymmdd) {
  const match = String(yyyymmdd || '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

function getWeekday({ year, month, day }) {
  return WEEKDAYS[new Date(Date.UTC(year, month, day)).getUTCDay()];
}

// "Tuesday, 13 October"
function formatDayHeading(dayKey, dayDateMap = {}) {
  const parts = parseDayDate(dayDateMap[dayKey]);
  if (!parts) return '';
  return `${getWeekday(parts)}, ${parts.day} ${MONTHS[parts.month]}`;
}

// "October 13 - Opening Reception" -> "Opening Reception"
function getDaySubtitle(label = '') {
  const [, ...rest] = String(label).split(' - ');
  return rest.join(' - ').trim() || String(label).trim();
}

// ["oct13","oct15"] -> "13 & 15 October 2026", consecutive -> "14–15 October 2026"
function formatSelectedDateRange(dayKeys = [], dayDateMap = {}) {
  const dates = [...new Set(dayKeys)]
    .map((key) => parseDayDate(dayDateMap[key]))
    .filter(Boolean)
    .sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
  if (dates.length === 0) return '';

  const first = dates[0];
  const last = dates[dates.length - 1];
  const sameMonth = dates.every(
    (d) => d.month === first.month && d.year === first.year
  );
  if (!sameMonth) {
    return dates.map((d) => `${d.day} ${MONTHS[d.month]} ${d.year}`).join(', ');
  }

  const tail = `${MONTHS[first.month]} ${first.year}`;
  if (dates.length === 1) return `${first.day} ${tail}`;

  const consecutive = dates.every(
    (d, i) => i === 0 || d.day === dates[i - 1].day + 1
  );
  if (consecutive) return `${first.day}–${last.day} ${tail}`;

  const days = dates.map((d) => d.day);
  return `${days.slice(0, -1).join(', ')} & ${days[days.length - 1]} ${tail}`;
}

function getEditionYear(dayDateMap = {}) {
  const first = Object.values(dayDateMap)[0];
  const parts = parseDayDate(first);
  return parts ? String(parts.year) : '';
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcsDateTime(yyyymmdd, minutes) {
  return `${yyyymmdd}T${formatClock(minutes).replace(':', '')}00`;
}

// Builds an iCalendar file with one event per session, in India time.
function buildAgendaIcs({
  sessions = [],
  dayDateMap = {},
  location = 'New Delhi, India',
  eventName = 'Mash',
  now = new Date(),
} = {}) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mash Events//My Agenda//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (const session of sessions) {
    const date = dayDateMap[session.day];
    const range = parseTimeRange(session.time);
    if (!date || !range) continue;

    const venue = session.venue || session.track || '';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${session.id}@mash.example`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Kolkata:${formatIcsDateTime(date, range.start)}`,
      `DTEND;TZID=Asia/Kolkata:${formatIcsDateTime(date, range.end)}`,
      `SUMMARY:${escapeIcsText(`${eventName}: ${session.title}`)}`,
      `DESCRIPTION:${escapeIcsText(getSessionDescription(session))}`,
      `LOCATION:${escapeIcsText([venue, location].filter(Boolean).join(', '))}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function getSessionSpeakerNames(session = {}) {
  if (Array.isArray(session.speakers)) return session.speakers.filter(Boolean);
  return session.speakers ? [String(session.speakers)] : [];
}

// The 2026 data fills missing descriptions with a placeholder; repeating it on
// every row of a printed agenda is noise.
const PLACEHOLDER_DESCRIPTION =
  /^further details about this session will be shared soon\.?$/i;

function getSessionDescription(session = {}) {
  const text = String(session.description || session.topic || '').trim();
  return PLACEHOLDER_DESCRIPTION.test(text) ? '' : text;
}

module.exports = {
  buildAgendaIcs,
  findAgendaClashes,
  formatClock,
  formatDayHeading,
  formatSelectedDateRange,
  getDaySubtitle,
  getEditionYear,
  getSessionDescription,
  getSessionSpeakerNames,
  parseTimeRange,
};
