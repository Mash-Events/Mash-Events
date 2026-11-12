// "Happening now" programme logic (docs/system-design.md §16.3, adapted
// from the seed site's live-programme.cjs). Pure functions, no framework:
// given a event's public sessions (ISO times) and the event's timezone, it
// computes the Now/Next board state. Unlike the seed, nothing is hardcoded —
// live days come from the sessions themselves, and "now" is evaluated in the
// event's timezone so a visitor's device clock setting can't break it.

export type LiveSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  track: string | null;
  speakers: string[];
};

export type LiveSlot = {
  session: LiveSession;
  /** 0..1 through the session (now only). */
  progress: number;
  /** Whole minutes remaining (now) or until start (next/later). */
  minutes: number;
  /** Session-local HH:MM labels in the event timezone. */
  startLabel: string;
  endLabel: string;
};

export type LiveColumn = {
  key: string;
  label: string;
  now: LiveSlot | null;
  next: LiveSlot | null;
  later: LiveSlot | null;
};

export type LiveProgramme =
  | { state: 'inactive' }
  | { state: 'ended' }
  | {
      state: 'before' | 'live' | 'after';
      dayLabel: string;
      clockLabel: string;
      timeZoneLabel: string;
      columns: LiveColumn[];
      firstSlot: LiveSlot;
      nextDay: { dayLabel: string; startLabel: string } | null;
    };

const MINUTE = 60_000;

function localDayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function localClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function localDayName(dayKey: string): string {
  // dayKey is YYYY-MM-DD; the weekday is only cosmetic so deriving it from
  // the key keeps it timezone-stable.
  const date = new Date(`${dayKey}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function minutesBetween(from: number, to: number): number {
  return Math.max(1, Math.ceil(Math.abs(to - from) / MINUTE));
}

function toSlot(
  session: LiveSession,
  timeZone: string,
  time: number,
  now: boolean
): LiveSlot {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  return {
    session,
    progress: now
      ? Math.min(1, Math.max(0, (time - start) / Math.max(1, end - start)))
      : 0,
    minutes: minutesBetween(time, now ? end : start),
    startLabel: localClock(session.startsAt, timeZone),
    endLabel: localClock(session.endsAt, timeZone),
  };
}

function columnKey(session: LiveSession): string {
  return session.room ?? session.track ?? 'Sessions';
}

/**
 * Now/Next for one event. Sessions without parseable times are ignored.
 * Outside the event's own days: { state: 'inactive' } (before the first day
 * or between days) or { state: 'ended' } once the last session is over.
 */
export function getLiveProgramme(
  sessions: LiveSession[],
  timeZone: string,
  now: Date = new Date()
): LiveProgramme {
  const time = now.getTime();
  const timed = sessions
    .filter((s) => !Number.isNaN(Date.parse(s.startsAt)))
    .filter((s) => !Number.isNaN(Date.parse(s.endsAt)))
    .sort(
      (a, b) =>
        Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
        Date.parse(a.endsAt) - Date.parse(b.endsAt)
    );
  if (timed.length === 0) return { state: 'inactive' };

  // Live days, derived from the programme itself.
  const dayKeys = [
    ...new Set(timed.map((s) => localDayKey(s.startsAt, timeZone))),
  ].sort();
  const todayKey = localDayKey(new Date(time).toISOString(), timeZone);
  const dayIndex = dayKeys.indexOf(todayKey);
  if (dayIndex === -1) {
    return time >= Date.parse(`${dayKeys[dayKeys.length - 1]}T23:59:59Z`)
      ? { state: 'ended' }
      : { state: 'inactive' };
  }

  const todays = timed.filter(
    (s) => localDayKey(s.startsAt, timeZone) === todayKey
  );
  const nextDayKey = dayKeys[dayIndex + 1] ?? null;
  const nextDaySessions = nextDayKey
    ? timed.filter((s) => localDayKey(s.startsAt, timeZone) === nextDayKey)
    : [];

  const columns: LiveColumn[] = [];
  for (const key of [...new Set(todays.map(columnKey))]) {
    const inColumn = todays.filter((s) => columnKey(s) === key);
    const current = inColumn.find(
      (s) => Date.parse(s.startsAt) <= time && time < Date.parse(s.endsAt)
    );
    const upcoming = inColumn.filter((s) => Date.parse(s.startsAt) > time);
    columns.push({
      key,
      label: key,
      now: current ? toSlot(current, timeZone, time, true) : null,
      next: upcoming[0] ? toSlot(upcoming[0], timeZone, time, false) : null,
      later: upcoming[1] ? toSlot(upcoming[1], timeZone, time, false) : null,
    });
  }

  const firstSlot = toSlot(todays[0], timeZone, time, false);
  const lastEnd = Math.max(...todays.map((s) => Date.parse(s.endsAt)));
  let state: 'before' | 'live' | 'after' = 'live';
  if (time < Date.parse(todays[0].startsAt)) state = 'before';
  else if (time >= lastEnd) state = 'after';

  const nextDay = nextDaySessions.length
    ? {
        dayLabel: localDayName(nextDayKey!),
        startLabel: localClock(nextDaySessions[0].startsAt, timeZone),
      }
    : null;

  if (state === 'after' && !nextDay) return { state: 'ended' };

  return {
    state,
    dayLabel: localDayName(todayKey),
    clockLabel: localClock(new Date(time).toISOString(), timeZone),
    timeZoneLabel: timeZone,
    columns,
    firstSlot,
    nextDay,
  };
}
