'use client';

import { useEffect, useState } from 'react';
import {
  getLiveProgramme,
  type LiveProgramme,
  type LiveSlot,
  type LiveSession,
} from './live-programme';

// "Happening now" board (docs/system-design.md §16.3), adapted from the
// seed site's live-now board: shown only on the event's own days, at the top
// of the agenda. All time math happens in the event's timezone; the clock
// ticks every 30 seconds.

type Props = {
  sessions: LiveSession[];
  timeZone: string;
  /** Renders nothing on non-event days — pass a test time for stories. */
  now?: Date;
};

function useClock(intervalMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // First tick deferred to a timer (not a synchronous setState in the
    // effect), then a steady tick. Rendering only starts client-side, so
    // there is no SSR/hydration time mismatch.
    const tick = () => setNow(new Date());
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

function LivePulse() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#cb1977] opacity-75 motion-reduce:hidden" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#cb1977]" />
    </span>
  );
}

function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function NowBlock({ slot }: { slot: LiveSlot }) {
  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <p className="text-lg font-extrabold leading-snug text-white md:text-xl">
        {slot.session.title}
      </p>
      <div>
        {slot.session.speakers.length ? (
          <p className="mb-3 text-sm leading-snug text-white/60">
            with {slot.session.speakers.join(', ')}
          </p>
        ) : null}
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#cb1977,#f472b6)]"
            style={{ width: `${Math.round(slot.progress * 100)}%` }}
          />
        </div>
        <div className="mt-2.5 flex justify-between font-mono text-[11px] uppercase tracking-wider">
          <span className="text-white/50">
            {slot.startLabel}–{slot.endLabel}
          </span>
          <span className="text-[#cb1977]">{slot.minutes} min left</span>
        </div>
      </div>
    </div>
  );
}

function NextBlock({ slot, word }: { slot: LiveSlot; word: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-white/50">
        {word} · <span className="text-[#cb1977]">{slot.startLabel}</span> · in{' '}
        {formatWait(slot.minutes)}
      </p>
      <p className="mt-2 text-lg font-extrabold leading-snug text-white/90 md:text-xl">
        {slot.session.title}
      </p>
    </div>
  );
}

function Column({
  label,
  now,
  next,
  later,
}: {
  label: string;
  now: LiveSlot | null;
  next: LiveSlot | null;
  later: LiveSlot | null;
}) {
  const featured = now ?? next;
  const following = now ? next : later;
  return (
    <div className="flex flex-col p-6 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">
          {label}
        </p>
        {now ? (
          <span className="rounded-full bg-[#cb1977] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
            On now
          </span>
        ) : (
          <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/50">
            {next ? 'Free' : 'Done'}
          </span>
        )}
      </div>
      <div className="mt-5 flex flex-1 flex-col">
        {now ? <NowBlock slot={now} /> : null}
        {!now && featured ? <NextBlock slot={featured} word="Up next" /> : null}
        {!featured ? (
          <p className="text-sm leading-relaxed text-white/50">
            Sessions in this room are done for the day.
          </p>
        ) : null}
      </div>
      <div className="mt-5 border-t border-dashed border-white/15 pt-4">
        {following ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#cb1977]">
              {now ? 'Next' : 'Then'} · {following.startLabel}
            </p>
            <p className="mt-1.5 text-sm font-semibold leading-snug text-white/85">
              {following.session.title}
            </p>
          </>
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/35">
            Nothing after this
          </p>
        )}
      </div>
    </div>
  );
}

export function HappeningNow({ sessions, timeZone, now: fixedNow }: Props) {
  const clock = useClock(30_000);
  const now = fixedNow ?? clock;
  if (!now) return null;

  const live: LiveProgramme = getLiveProgramme(sessions, timeZone, now);
  if (live.state === 'inactive' || live.state === 'ended') return null;

  return (
    <section
      id="live-now"
      aria-live="polite"
      className="bg-[radial-gradient(ellipse_at_85%_0%,#500724_0%,transparent_55%),linear-gradient(180deg,#0c0a09_0%,#1c1917_100%)] px-4 py-12 text-white md:px-8 md:py-14"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.2em] text-[#f472b6]">
              <LivePulse />
              Happening now
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
              {live.dayLabel}
            </h2>
          </div>
          <div className="flex items-baseline gap-3 md:flex-col md:items-end md:gap-1">
            <p className="font-mono text-5xl font-medium leading-none tracking-tight md:text-6xl">
              {live.clockLabel}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
              {live.timeZoneLabel} · local event time
            </p>
          </div>
        </div>

        {live.state === 'before' ? (
          <p className="mt-6 text-base text-white/75">
            Doors open at{' '}
            <span className="font-mono text-[#f472b6]">
              {live.firstSlot.startLabel}
            </span>{' '}
            with {live.firstSlot.session.title}.
          </p>
        ) : null}

        {live.state === 'after' && live.nextDay ? (
          <p className="mt-7 text-xl font-bold md:text-2xl">
            That&apos;s a wrap for today.
            <span className="text-white/55">
              {' '}
              {live.nextDay.dayLabel} starts at{' '}
              <span className="font-mono">{live.nextDay.startLabel}</span>.
            </span>
          </p>
        ) : (
          <div className="mt-8 grid overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.03] md:grid-cols-2 lg:grid-cols-3 md:divide-x md:divide-white/10 max-md:divide-y max-md:divide-white/10">
            {live.columns.map((column) => (
              <Column
                key={column.key}
                label={column.label}
                now={column.now}
                next={column.next}
                later={column.later}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
