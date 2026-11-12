'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminApiError, eventApi } from '@core/admin/api-client';
import { fromLocalInput, toLocalInput } from '@core/admin/time';

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
  listed: boolean;
  settings?: { join_url?: string | null; join_window_minutes?: number };
  join_url?: string | null;
  join_window_minutes?: number;
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
      .then((res) =>
        setSettings({
          ...res.event,
          join_url: res.event.settings?.join_url ?? null,
          join_window_minutes: res.event.settings?.join_window_minutes ?? 30,
        })
      )
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
          listed: settings.listed,
          join_url: settings.join_url || null,
          join_window_minutes: settings.join_window_minutes ?? 30,
        },
      });
      setSettings({
        ...res.event,
        join_url: res.event.settings?.join_url ?? null,
        join_window_minutes: res.event.settings?.join_window_minutes ?? 30,
      });
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

      <fieldset className="space-y-4 rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-700">
          Webinar
        </legend>
        <label className="block text-sm font-medium text-stone-700">
          Platform link (Zoom, Teams, YouTube…)
          <input
            type="url"
            className={input}
            placeholder="https://"
            value={settings.join_url ?? ''}
            onChange={(e) => update({ join_url: e.target.value })}
          />
          <span className="mt-1 block text-xs font-normal text-stone-500">
            Never shown publicly. Confirmed registrants get a personal link that
            redirects here during the join window.
          </span>
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Join opens (minutes before start)
          <input
            type="number"
            min={0}
            max={240}
            className={input}
            value={settings.join_window_minutes ?? 30}
            onChange={(e) =>
              update({ join_window_minutes: Number(e.target.value) || 0 })
            }
          />
        </label>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={settings.waitlist_enabled}
          onChange={(e) => update({ waitlist_enabled: e.target.checked })}
        />
        Waitlist when full
      </label>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={settings.listed}
          onChange={(e) => update({ listed: e.target.checked })}
        />
        List on the platform directory (main domain homepage)
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
