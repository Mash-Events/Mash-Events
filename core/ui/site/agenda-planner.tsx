'use client';

import { useEffect, useState } from 'react';
import type { PublicSession } from '../../site/types';

// Personal agenda builder (docs/system-design.md §10.2): star sessions and
// download your own agenda as an iCalendar file. Starred ids live in
// localStorage per event — no account, no server state, no PII. The list is
// server-rendered first; JS only adds the stars and the panel.

export type PlannerSession = PublicSession & { speakers: string[] };

function icsStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function downloadIcs(sessions: PlannerSession[], eventTitle: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mash Events//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const session of sessions) {
    if (!session.starts_at || !session.ends_at) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${session.id}@mash`,
      `DTSTAMP:${icsStamp(new Date().toISOString())}`,
      `DTSTART:${icsStamp(session.starts_at)}`,
      `DTEND:${icsStamp(session.ends_at)}`,
      `SUMMARY:${session.title.replace(/[,;\\]/g, ' ')} — ${eventTitle.replace(/[,;\\]/g, ' ')}`,
      session.room ? `LOCATION:${session.room.replace(/[,;\\]/g, ' ')}` : '',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.filter(Boolean).join('\r\n') + '\r\n'], {
    type: 'text/calendar',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'my-agenda.ics';
  link.click();
  URL.revokeObjectURL(url);
}

export function AgendaPlanner({
  sessions,
  eventTitle,
  storageKey,
  children,
}: {
  sessions: PlannerSession[];
  eventTitle: string;
  storageKey: string;
  /** The server-rendered list; stars are overlaid via data attributes. */
  children?: React.ReactNode;
}) {
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    // Deferred so no synchronous setState runs inside the effect (and the
    // first paint matches the server render before stars hydrate in).
    const timer = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(`mash-agenda:${storageKey}`);
        if (raw) setStarred(new Set(JSON.parse(raw) as string[]));
      } catch {
        /* first visit */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);

  function toggle(id: string) {
    setStarred((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(
          `mash-agenda:${storageKey}`,
          JSON.stringify([...next])
        );
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  const starredSessions = sessions
    .filter((s) => starred.has(s.id))
    .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));

  return (
    <div className="agenda-planner">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/60">
          Tap the star next to a session to build your own agenda. It stays on
          this device.
        </p>
        {starredSessions.length > 0 ? (
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-[#cb1977]"
          >
            My agenda ({starredSessions.length})
          </button>
        ) : null}
      </div>

      <ol className="agenda-list border-t-2 border-black">
        {sessions.map((session) => (
          <li
            key={session.id}
            data-session-id={session.id}
            className="flex items-start justify-between gap-4 border-b border-black/10 py-5"
          >
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-wide text-[#cb1977]">
                {session.starts_at
                  ? new Date(session.starts_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })
                  : 'TBA'}
                {session.room ? ` · ${session.room}` : ''}
                {session.track ? ` · ${session.track}` : ''}
              </p>
              <p className="mt-1 font-semibold text-black">{session.title}</p>
              {session.speakers.length ? (
                <p className="mt-1 text-sm text-black/60">
                  {session.speakers.join(', ')}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={
                starred.has(session.id)
                  ? 'Remove from my agenda'
                  : 'Add to my agenda'
              }
              aria-pressed={starred.has(session.id)}
              onClick={() => toggle(session.id)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-lg leading-none transition-colors ${
                starred.has(session.id)
                  ? 'border-[#cb1977] bg-[#cb1977] text-white'
                  : 'border-black/20 text-black/40 hover:border-[#cb1977] hover:text-[#cb1977]'
              }`}
            >
              ★
            </button>
          </li>
        ))}
      </ol>

      {panelOpen && starredSessions.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-[#f5f5f4] p-6">
          <h3 className="text-lg font-extrabold text-black">My agenda</h3>
          <ul className="mt-3 space-y-2">
            {starredSessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-mono text-xs text-[#cb1977]">
                    {session.starts_at
                      ? new Date(session.starts_at).toLocaleTimeString(
                          'en-IN',
                          { hour: '2-digit', minute: '2-digit', hour12: false }
                        )
                      : ''}
                  </span>{' '}
                  <span className="font-medium text-black">
                    {session.title}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => toggle(session.id)}
                  className="shrink-0 text-black/40 hover:text-[#cb1977]"
                  aria-label={`Remove ${session.title} from my agenda`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => downloadIcs(starredSessions, eventTitle)}
            className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#cb1977]"
          >
            Download my agenda (.ics)
          </button>
        </div>
      ) : null}
    </div>
  );
}
