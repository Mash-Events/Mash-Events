const CHECK_IN_TIME_ZONE = 'Asia/Kolkata';

const CHECK_IN_DAYS = [
  {
    value: 'day_1',
    eventDay: 1,
    label: 'Day 1',
    shortLabel: 'Day 1 - Oct 14',
    date: '2026-10-14',
  },
  {
    value: 'day_2',
    eventDay: 2,
    label: 'Day 2',
    shortLabel: 'Day 2 - Oct 15',
    date: '2026-10-15',
  },
];

function formatDateInTimeZone(value, timeZone = CHECK_IN_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function shiftIsoDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Passes check people in from the day before the first event day to the day
// after the last (India time). Outside that window a scan is refused, so a
// QR pass stops working once the event is over. Update CHECK_IN_DAYS for the
// next edition and the window moves with it.
function isCheckInWindowOpen(now = new Date()) {
  const localDate = formatDateInTimeZone(now);
  if (!localDate) return false;
  const opens = shiftIsoDate(CHECK_IN_DAYS[0].date, -1);
  const closes = shiftIsoDate(CHECK_IN_DAYS[CHECK_IN_DAYS.length - 1].date, 1);
  return localDate >= opens && localDate <= closes;
}

function getDefaultCheckInDay(now = new Date()) {
  const localDate = formatDateInTimeZone(now);
  const exactDay = CHECK_IN_DAYS.find((day) => day.date === localDate);

  if (exactDay) {
    return exactDay.value;
  }

  if (localDate && localDate >= CHECK_IN_DAYS[1].date) {
    return CHECK_IN_DAYS[1].value;
  }

  return CHECK_IN_DAYS[0].value;
}

function normalizeCheckInDay(value, fallback = getDefaultCheckInDay()) {
  if (value && typeof value === 'object') {
    if (value.value) return normalizeCheckInDay(value.value, fallback);
    if (value.event_day) return normalizeCheckInDay(value.event_day, fallback);
    if (value.eventDay) return normalizeCheckInDay(value.eventDay, fallback);
  }

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (
    [
      '1',
      'day1',
      'day_1',
      'event_day_1',
      'eventday1',
      '2026_10_14',
      '2026_10_14t00:00:00_05:30',
    ].includes(normalized)
  ) {
    return 'day_1';
  }

  if (
    [
      '2',
      'day2',
      'day_2',
      'event_day_2',
      'eventday2',
      '2026_10_15',
      '2026_10_15t00:00:00_05:30',
    ].includes(normalized)
  ) {
    return 'day_2';
  }

  return CHECK_IN_DAYS.some((day) => day.value === fallback)
    ? fallback
    : CHECK_IN_DAYS[0].value;
}

function getCheckInDayConfig(value) {
  const normalized = normalizeCheckInDay(value);
  return (
    CHECK_IN_DAYS.find((day) => day.value === normalized) || CHECK_IN_DAYS[0]
  );
}

function getCheckInDayNumber(value) {
  return getCheckInDayConfig(value).eventDay;
}

function getCheckInDayLabel(value) {
  return getCheckInDayConfig(value).label;
}

function getCheckInDayShortLabel(value) {
  return getCheckInDayConfig(value).shortLabel;
}

function normalizeCheckIns(rows = [], legacyCheckedInAt = null) {
  const result = {};
  const safeRows = (Array.isArray(rows) ? rows : rows ? [rows] : []).filter(
    Boolean
  );
  const hasDailyRows = safeRows.length > 0;

  for (const row of safeRows) {
    const value = normalizeCheckInDay(row.event_day ?? row.eventDay ?? row.day);
    const config = getCheckInDayConfig(value);
    result[value] = {
      event_day: config.eventDay,
      checked_in_at: row.checked_in_at || row.checkedInAt || null,
      desk_label: row.desk_label || row.deskLabel || null,
      actor_email: row.actor_email || row.actorEmail || null,
      legacy: Boolean(row.legacy),
    };
  }

  if (legacyCheckedInAt && !hasDailyRows && !result.day_1) {
    result.day_1 = {
      event_day: 1,
      checked_in_at: legacyCheckedInAt,
      desk_label: null,
      actor_email: null,
      legacy: true,
    };
  }

  return result;
}

function getCheckInForDay(record, day) {
  if (!record) {
    return null;
  }

  const normalizedDay = normalizeCheckInDay(day);
  const direct = record.check_ins || record.checkIns;

  if (direct && !Array.isArray(direct) && direct[normalizedDay]) {
    return direct[normalizedDay];
  }

  const rows = direct || record.registration_daily_check_ins || [];
  const normalized = normalizeCheckIns(rows, record.checked_in_at);
  return normalized[normalizedDay] || null;
}

function isCheckedInForDay(record, day) {
  return Boolean(getCheckInForDay(record, day)?.checked_in_at);
}

module.exports = {
  CHECK_IN_DAYS,
  CHECK_IN_TIME_ZONE,
  formatDateInTimeZone,
  getCheckInDayConfig,
  getCheckInDayLabel,
  getCheckInDayNumber,
  getCheckInDayShortLabel,
  getDefaultCheckInDay,
  getCheckInForDay,
  isCheckInWindowOpen,
  isCheckedInForDay,
  normalizeCheckInDay,
  normalizeCheckIns,
};
