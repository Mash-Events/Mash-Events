// Date/time formatting in the event's own timezone (pure, server-safe).

export function formatDate(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatTime(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function timeZoneLabel(timeZone: string, iso: string | null): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(iso ? new Date(iso) : new Date());
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}
