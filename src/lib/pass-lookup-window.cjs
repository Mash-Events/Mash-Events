// "Find my pass" only exists in the run-up to and during the festival:
// 9-15 October 2026, IST. It opens on 9 October so the T-5 reminder email
// can point people to it.
// Outside this window the page 404s, the API refuses requests and no link
// is rendered, so the site looks exactly as it does the rest of the year.

const PASS_LOOKUP_OPENS_AT = Date.parse('2026-10-09T00:00:00+05:30');
const PASS_LOOKUP_CLOSES_AT = Date.parse('2026-10-16T00:00:00+05:30');

// The background drain keeps going a little after close so a request made
// at 23:59 on the 15th still gets its retries.
const PASS_LOOKUP_DRAIN_UNTIL = Date.parse('2026-10-16T06:00:00+05:30');

// Jobs created by the public page are tagged with this operator so the
// pass-lookup cron only touches its own jobs, never admin bulk sends.
const PASS_LOOKUP_OPERATOR = Object.freeze({
  userId: 'public-pass-lookup',
  primaryEmail: 'public-pass-lookup@local',
});

const PASS_LOOKUP_COOLDOWN_MS = 15 * 60 * 1000;
const PASS_LOOKUP_MAX_PER_DAY = 3;

function toTime(now) {
  return now instanceof Date ? now.getTime() : Number(now);
}

function isPassLookupOpen(now = new Date()) {
  const time = toTime(now);
  return time >= PASS_LOOKUP_OPENS_AT && time < PASS_LOOKUP_CLOSES_AT;
}

function isPassLookupDrainActive(now = new Date()) {
  const time = toTime(now);
  return time >= PASS_LOOKUP_OPENS_AT && time < PASS_LOOKUP_DRAIN_UNTIL;
}

// `recentRequestTimes` are the created_at values of this registration's
// public resend requests from the last 24 hours.
function canQueuePassLookup(recentRequestTimes = [], now = new Date()) {
  const time = toTime(now);
  const times = recentRequestTimes
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value <= time);

  if (times.length >= PASS_LOOKUP_MAX_PER_DAY) return false;
  return times.every((value) => time - value >= PASS_LOOKUP_COOLDOWN_MS);
}

module.exports = {
  PASS_LOOKUP_CLOSES_AT,
  PASS_LOOKUP_COOLDOWN_MS,
  PASS_LOOKUP_DRAIN_UNTIL,
  PASS_LOOKUP_MAX_PER_DAY,
  PASS_LOOKUP_OPENS_AT,
  PASS_LOOKUP_OPERATOR,
  canQueuePassLookup,
  isPassLookupDrainActive,
  isPassLookupOpen,
};
