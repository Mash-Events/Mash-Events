import type {
  EventContent,
  PublicSession,
  PublicSpeaker,
} from '../../site/types';
import { formatDate, formatTime, timeZoneLabel } from './format';

// Server-rendered building blocks for event sites. No client JS; sites can
// use them as-is, wrap them, or write their own markup.

export function EventHero({
  content,
  tagline,
  cta,
}: {
  content: EventContent;
  tagline?: string;
  cta?: { href: string; label: string };
}) {
  const { event } = content;
  return (
    <header className="bg-stone-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <p className="text-sm font-medium uppercase tracking-widest text-white/60">
          {event.org.name} ·{' '}
          {event.kind === 'in_person' ? 'In person' : event.kind}
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">
          {event.name}
        </h1>
        {tagline ? (
          <p className="mt-5 max-w-2xl text-lg text-white/80">{tagline}</p>
        ) : null}
        {event.starts_at ? (
          <p className="mt-6 text-white/90">
            {formatDate(event.starts_at, event.timezone)} ·{' '}
            {formatTime(event.starts_at, event.timezone)}
            {event.ends_at
              ? `–${formatTime(event.ends_at, event.timezone)}`
              : ''}{' '}
            {timeZoneLabel(event.timezone, event.starts_at)}
          </p>
        ) : null}
        {cta ? (
          <a
            href={cta.href}
            className="mt-8 inline-block rounded-md bg-white px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-white/90"
          >
            {cta.label}
          </a>
        ) : null}
      </div>
    </header>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-5xl px-6 py-12">
      <h2 className="text-2xl font-semibold text-stone-900">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function SpeakerGrid({ speakers }: { speakers: PublicSpeaker[] }) {
  if (!speakers.length) return null;
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {speakers.map((speaker) => (
        <li key={speaker.id} className="rounded-lg border border-stone-200 p-5">
          <p className="font-semibold text-stone-900">{speaker.name}</p>
          {speaker.title || speaker.affiliation ? (
            <p className="text-sm text-stone-600">
              {[speaker.title, speaker.affiliation].filter(Boolean).join(', ')}
            </p>
          ) : null}
          {speaker.bio ? (
            <p className="mt-3 text-sm leading-relaxed text-stone-700">
              {speaker.bio}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Agenda({ content }: { content: EventContent }) {
  const { sessions, speakers, event } = content;
  if (!sessions.length) return null;
  const byId = new Map(speakers.map((s) => [s.id, s]));
  return (
    <ol className="divide-y divide-stone-200 rounded-lg border border-stone-200">
      {sessions.map((session: PublicSession) => (
        <li key={session.id} className="grid gap-2 p-5 sm:grid-cols-[9rem_1fr]">
          <p className="text-sm font-medium text-stone-500">
            {session.starts_at
              ? `${formatTime(session.starts_at, event.timezone)}${
                  session.ends_at
                    ? `–${formatTime(session.ends_at, event.timezone)}`
                    : ''
                }`
              : 'TBA'}
          </p>
          <div>
            <p className="font-semibold text-stone-900">{session.title}</p>
            {session.description ? (
              <p className="mt-1 text-sm text-stone-700">
                {session.description}
              </p>
            ) : null}
            {session.speaker_ids.length ? (
              <p className="mt-2 text-sm text-stone-600">
                {session.speaker_ids
                  .map((id) => byId.get(id)?.name)
                  .filter(Boolean)
                  .join(', ')}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Sponsors({ content }: { content: EventContent }) {
  if (!content.sponsors.length) return null;
  return (
    <ul className="flex flex-wrap gap-4">
      {content.sponsors.map((sponsor) => (
        <li key={sponsor.id}>
          {sponsor.url ? (
            <a
              href={sponsor.url}
              rel="noopener noreferrer sponsored"
              target="_blank"
              className="block rounded-md border border-stone-200 px-4 py-3 text-sm font-medium text-stone-800 hover:border-stone-400"
            >
              {sponsor.name}
            </a>
          ) : (
            <span className="block rounded-md border border-stone-200 px-4 py-3 text-sm font-medium text-stone-800">
              {sponsor.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SiteFooter({ content }: { content: EventContent }) {
  return (
    <footer className="border-t border-stone-200">
      <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-stone-500">
        {content.event.name} · organised by {content.event.org.name}
      </div>
    </footer>
  );
}
