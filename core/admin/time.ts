// Wall-clock times in an event's timezone ↔ ISO instants (admin forms).

/** ISO instant ↔ "YYYY-MM-DDTHH:mm" in the event's timezone. */
export function toLocalInput(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function fromLocalInput(value: string, timeZone: string): string | null {
  if (!value) return null;
  // Interpret the wall-clock time in the event timezone.
  const guess = new Date(`${value}:00Z`);
  const shown = toLocalInput(guess.toISOString(), timeZone);
  const offsetMs = new Date(`${shown}:00Z`).getTime() - guess.getTime();
  return new Date(guess.getTime() - offsetMs).toISOString();
}
