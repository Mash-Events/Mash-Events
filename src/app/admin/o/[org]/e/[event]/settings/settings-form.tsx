'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminApiError, eventApi } from '@core/admin/api-client';

type EventSettings = {
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
  waitlist_enabled: boolean;
  review_mode: 'manual' | 'auto_confirm';
};

const STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'live',
  'completed',
  'archived',
];

const DATE_FIELDS = [
  ['starts_at', 'Event starts'],
  ['ends_at', 'Event ends'],
  ['registration_opens_at', 'Registration opens'],
  ['registration_closes_at', 'Registration closes'],
] as const;

/** ISO instant ↔ "YYYY-MM-DDTHH:mm" in the event's timezone. */
function toLocalInput(iso: string | null, timeZone: string): string {
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

function fromLocalInput(value: string, timeZone: string): string | null {
  if (!value) return null;
  // Interpret the wall-clock time in the event timezone.
  const guess = new Date(`${value}:00Z`);
  const shown = toLocalInput(guess.toISOString(), timeZone);
  const offsetMs = new Date(`${shown}:00Z`).getTime() - guess.getTime();
  return new Date(guess.getTime() - offsetMs).toISOString();
}

export function SettingsForm({
  eventId,
  timezone,
}: {
  eventId: string;
  timezone: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    eventApi<{ event: EventSettings }>(eventId, '')
      .then((res) => setSettings(res.event))
      .catch((error: AdminApiError) =>
        setMessage({ kind: 'error', text: error.message })
      );
  }, [eventId]);

  if (!settings) {
    return (
      <p className="mt-6 text-sm text-stone-500">
        {message?.text ?? 'Loading…'}
      </p>
    );
  }

  const update = (patch: Partial<EventSettings>) =>
    setSettings({ ...settings, ...patch });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    if (
      settings.status === 'archived' &&
      !window.confirm('Archiving makes this event read-only. Continue?')
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await eventApi<{ event: EventSettings }>(eventId, '', {
        method: 'PATCH',
        body: {
          name: settings.name,
          status: settings.status,
          starts_at: settings.starts_at,
          ends_at: settings.ends_at,
          registration_opens_at: settings.registration_opens_at,
          registration_closes_at: settings.registration_closes_at,
          capacity: settings.capacity,
          waitlist_enabled: settings.waitlist_enabled,
          review_mode: settings.review_mode,
        },
      });
      setSettings(res.event);
      setMessage({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Could not save.',
      });
    } finally {
      setSaving(false);
    }
  }

  const input =
    'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm';

  return (
    <form
      onSubmit={save}
      className="mt-6 space-y-5 rounded-lg border border-stone-200 bg-white p-6"
    >
      <label className="block text-sm font-medium text-stone-700">
        Name
        <input
          className={input}
          value={settings.name}
          onChange={(e) => update({ name: e.target.value })}
          required
        />
      </label>

      <label className="block text-sm font-medium text-stone-700">
        Status
        <select
          className={input}
          value={settings.status}
          onChange={(e) => update({ status: e.target.value })}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {DATE_FIELDS.map(([field, label]) => (
          <label
            key={field}
            className="block text-sm font-medium text-stone-700"
          >
            {label}
            <input
              type="datetime-local"
              className={input}
              value={toLocalInput(settings[field], timezone)}
              onChange={(e) =>
                update({ [field]: fromLocalInput(e.target.value, timezone) })
              }
            />
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700">
          Review
          <select
            className={input}
            value={settings.review_mode}
            onChange={(e) =>
              update({
                review_mode: e.target.value as EventSettings['review_mode'],
              })
            }
          >
            <option value="manual">Manual review (pending first)</option>
            <option value="auto_confirm">Confirm automatically</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Capacity
          <input
            type="number"
            min={1}
            className={input}
            placeholder="No limit"
            value={settings.capacity ?? ''}
            onChange={(e) =>
              update({
                capacity: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={settings.waitlist_enabled}
          onChange={(e) => update({ waitlist_enabled: e.target.checked })}
        />
        Waitlist when full
      </label>

      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm ${message.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}
        >
          {message.text}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
