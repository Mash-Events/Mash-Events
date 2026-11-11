'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminApiError, eventApi } from '@core/admin/api-client';

// Scanner screen (docs/system-design.md §9.2, §12.7). The device secret is
// generated in the browser, hashed there, and kept in page memory only: it
// is never sent raw and never persisted.

type Device = { id: string; secret: string };

type ScanOutcome = {
  result: string;
  registration_code?: string | null;
  name?: string | null;
};

type FeedRow = {
  outcome: string;
  reason: string | null;
  created_at: string;
  code: string | null;
  name: string | null;
};

type Feed = { totalCheckIns: number; recent: FeedRow[] };

const GOOD = new Set(['checked_in', 'already_checked_in']);

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const input =
  'mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900';

export function CheckInScreen({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const [device, setDevice] = useState<Device | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ScanOutcome | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const loadFeed = useCallback(() => {
    eventApi<Feed>(eventId, '/check-in')
      .then((data) => setFeed(data))
      .catch(() => undefined);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    const secret = randomSecret();
    void sha256Hex(secret)
      .then((hash) =>
        eventApi<{ deviceId: string }>(eventId, '/check-in/device', {
          method: 'POST',
          body: {
            label: `Desk ${new Date().toLocaleDateString()}`,
            secret_hash: hash,
            expires_hours: 12,
          },
        })
      )
      .then(
        (created) => {
          if (active) setDevice({ id: created.deviceId, secret });
        },
        (e) => {
          if (active)
            setDeviceError(
              e instanceof AdminApiError
                ? e.message
                : 'Could not start the scanner.'
            );
        }
      );
    loadFeed();
    return () => {
      active = false;
    };
  }, [eventId, loadFeed]);

  async function submitScan(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const passToken = token.trim();
    if (!passToken || !device || busy) return;
    setBusy(true);
    try {
      const outcome = await eventApi<ScanOutcome>(eventId, '/check-in/scan', {
        method: 'POST',
        body: {
          device_id: device.id,
          device_secret: device.secret,
          pass_token: passToken,
        },
      });
      setLast(outcome);
      setToken('');
      loadFeed();
    } catch (e) {
      setLast({
        result: 'error',
        registration_code: null,
        name:
          e instanceof AdminApiError ? e.message : 'Scan failed — try again.',
      });
    } finally {
      setBusy(false);
      scanRef.current?.focus();
    }
  }

  async function submitManual(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (!code || busy) return;
    setBusy(true);
    try {
      const outcome = await eventApi<ScanOutcome>(eventId, '/check-in/manual', {
        method: 'POST',
        body: { code },
      });
      setLast(outcome);
      setManualCode('');
      loadFeed();
    } catch (e) {
      setLast({
        result: 'error',
        registration_code: null,
        name: e instanceof AdminApiError ? e.message : 'Could not check in.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Check-in</h1>
        <p className="text-sm text-stone-600">{eventName}</p>
      </div>

      {deviceError ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800"
        >
          {deviceError}
        </p>
      ) : !device ? (
        <p className="rounded-md bg-stone-100 p-3 text-sm text-stone-700">
          Starting scanner session…
        </p>
      ) : (
        <>
          <form onSubmit={submitScan} className="space-y-3">
            <label className="block text-sm font-medium text-stone-800">
              Scan a pass (QR token or paste it here)
              <input
                ref={scanRef}
                className={`${input} font-mono text-lg`}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                autoFocus
                placeholder="v1.…"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Check in'}
            </button>
          </form>

          {last ? (
            <p
              role="status"
              className={`rounded-lg p-4 text-sm ${
                GOOD.has(last.result)
                  ? 'bg-green-50 text-green-900'
                  : last.result === 'error'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-amber-50 text-amber-900'
              }`}
            >
              <strong className="capitalize">
                {last.result.replace(/_/g, ' ')}
              </strong>
              {last.name ? ` — ${last.name}` : ''}
              {last.registration_code ? ` · ${last.registration_code}` : ''}
            </p>
          ) : null}

          <form
            onSubmit={submitManual}
            className="flex flex-wrap items-end gap-3 border-t border-stone-200 pt-5"
          >
            <label className="block text-sm font-medium text-stone-800">
              Manual fallback: badge code
              <input
                className={`${input} w-44 font-mono uppercase`}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="AB12CD34"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !manualCode.trim()}
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              Check in by code
            </button>
          </form>

          <section className="border-t border-stone-200 pt-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                Today at the gate
              </h2>
              <span className="text-sm text-stone-700">
                {feed?.totalCheckIns ?? 0} checked in
              </span>
            </div>
            <ul className="mt-3 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white text-sm">
              {(feed?.recent ?? []).map((row, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <span>
                    <span
                      className={`mr-2 inline-block h-2 w-2 rounded-full ${
                        GOOD.has(row.outcome) ? 'bg-green-500' : 'bg-amber-400'
                      }`}
                    />
                    {row.name ?? 'Unknown pass'}
                    {row.code ? (
                      <span className="ml-2 font-mono text-xs text-stone-500">
                        {row.code}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs capitalize text-stone-500">
                    {row.outcome.replace(/_/g, ' ')}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </span>
                </li>
              ))}
              {feed && feed.recent.length === 0 ? (
                <li className="px-4 py-6 text-center text-stone-500">
                  No scans yet.
                </li>
              ) : null}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
