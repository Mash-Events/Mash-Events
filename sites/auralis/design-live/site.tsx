import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type {
  FormQuestion,
  PublicSpeaker,
  SiteModule,
  SitePageProps,
} from '@core/site/types';
import { formatDate, formatTime, timeZoneLabel } from '@core/ui/site/format';
import { RegistrationForm } from '@core/ui/site/registration-form';
import type { ReactNode } from 'react';

// Fake client event for local development, seeded by supabase/demo.sql and
// never served in production — the second demo org, to show one platform
// hosting several organisations' event sites at once. A real event copies
// this folder, writes its own markup and copy, and adds its registry entry
// (see sites/README.md).
//
// Design language: dark studio look — near-black canvas, Space Grotesk
// display type, JetBrains Mono labels, electric lime accent. A single page
// (a 90-minute webinar does not need an agenda page). Everything is
// server-rendered; the registration form is the only interactive island
// (docs/system-design.md §10.2).

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-auralis',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-auralis-mono',
  weight: ['400', '500'],
});

const TAGLINE =
  'Ninety minutes with three working designers: a live type teardown, a talk on designing for trust, and open critique of your screens.';

const questions: FormQuestion[] = [
  {
    key: 'role',
    label: 'What do you do?',
    type: 'select',
    options: ['Designer', 'Product manager', 'Engineer', 'Founder', 'Student'],
    required: true,
  },
  {
    key: 'critique',
    label: 'Want a screen critiqued live? Paste a link (optional)',
    type: 'text',
    maxLength: 300,
  },
];

const FORMAT = [
  {
    time: '19:00',
    title: 'Welcome + what to expect',
    body: 'Tara sets the format and takes the first questions into the queue.',
  },
  {
    time: '19:10',
    title: 'Type systems for interfaces',
    body: 'Eshan tears down three real products and rebuilds their type on screen.',
  },
  {
    time: '19:40',
    title: 'Designing for trust',
    body: 'Lin on what changes in a design when the product asks for money or data.',
  },
  {
    time: '20:10',
    title: 'Live critique',
    body: 'Screens from the audience, honest feedback, and the answers that survive it.',
  },
];

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={{
        fontFamily: 'var(--font-auralis), system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[11px] font-medium uppercase tracking-[0.25em] text-lime-300"
      style={{ fontFamily: 'var(--font-auralis-mono), monospace' }}
    >
      {children}
    </p>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function Nav({ basePath }: { basePath: string }) {
  return (
    <nav className="sticky top-0 z-20 border-b border-white/10 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
        <a
          href={basePath}
          className="font-semibold tracking-tight text-white hover:text-lime-300"
        >
          auralis<span className="text-lime-300">.</span>design
        </a>
        <a
          href={`${basePath}#register`}
          className="rounded-full bg-lime-300 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-lime-200"
        >
          Save a seat
        </a>
      </div>
    </nav>
  );
}

function Hero({ content, basePath }: SitePageProps) {
  const { event } = content;
  const when = event.starts_at
    ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(
        event.starts_at,
        event.timezone
      )}–${formatTime(event.ends_at, event.timezone)} ${timeZoneLabel(
        event.timezone,
        event.starts_at
      )}`
    : 'Date to be announced';
  return (
    <header className="relative overflow-hidden">
      {/* Studio-grid backdrop; pure CSS. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-20">
        <Label>{event.org.name} · online only</Label>
        <h1 className="mt-6 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl">
          {event.name}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
          {TAGLINE}
        </p>
        <p
          className="mt-6 text-sm text-lime-300/90"
          style={{ fontFamily: 'var(--font-auralis-mono), monospace' }}
        >
          {when}
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href={`${basePath}#register`}
            className="rounded-full bg-lime-300 px-7 py-3.5 text-sm font-semibold text-neutral-950 hover:bg-lime-200"
          >
            Save a seat — free
          </a>
          <a
            href="#format"
            className="rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white hover:border-lime-300 hover:text-lime-300"
          >
            The format
          </a>
        </div>
      </div>
    </header>
  );
}

function Speakers({ speakers }: { speakers: PublicSpeaker[] }) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <Label>Speakers</Label>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {speakers.map((speaker) => (
          <li
            key={speaker.id}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-lime-300/40 text-sm font-semibold text-lime-300">
              {initials(speaker.name)}
            </div>
            <p className="mt-5 font-semibold text-white">{speaker.name}</p>
            {speaker.title || speaker.affiliation ? (
              <p className="mt-1 text-sm text-white/50">
                {[speaker.title, speaker.affiliation]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            {speaker.bio ? (
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                {speaker.bio}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Format() {
  return (
    <section id="format" className="mx-auto max-w-5xl px-6 py-16">
      <Label>The format</Label>
      <ol className="mt-8 border-t border-white/10">
        {FORMAT.map((item) => (
          <li
            key={item.time}
            className="grid gap-2 border-b border-white/10 py-6 sm:grid-cols-[6rem_1fr] sm:gap-8"
          >
            <p
              className="text-sm font-medium text-lime-300"
              style={{ fontFamily: 'var(--font-auralis-mono), monospace' }}
            >
              {item.time} IST
            </p>
            <div>
              <p className="text-lg font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/60">
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Register({ content, basePath }: SitePageProps) {
  const { event } = content;
  return (
    <section id="register" className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <Label>Register</Label>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Be in the room
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-white/70">
            Seats are auto-confirmed — no waiting for review. You get your
            personal join link by email the moment you register. Bring a screen
            if you want it critiqued.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/60">
            <li className="flex gap-3">
              <span className="text-lime-300">→</span> Instant confirmation with
              join link
            </li>
            <li className="flex gap-3">
              <span className="text-lime-300">→</span> Reminders before we go
              live
            </li>
            <li className="flex gap-3">
              <span className="text-lime-300">→</span> Recording shared with
              everyone registered
            </li>
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-6 text-stone-900 sm:p-8">
          <RegistrationForm
            basePath={basePath}
            open={event.registration_open}
            questions={questions}
            closedMessage="This session is full — the next Design Live is announced on LinkedIn."
          />
        </div>
      </div>
    </section>
  );
}

function Footer({ content }: SitePageProps) {
  const { event } = content;
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-white/40">
        <span>{event.org.name} · Bengaluru</span>
        <span
          style={{ fontFamily: 'var(--font-auralis-mono), monospace' }}
        >{`auralis.design/live`}</span>
      </div>
    </footer>
  );
}

function Home({ content, basePath }: SitePageProps) {
  return (
    <Shell>
      <main className="bg-neutral-950 text-white">
        <Nav basePath={basePath} />
        <Hero content={content} basePath={basePath} />
        <Speakers speakers={content.speakers} />
        <Format />
        <Register content={content} basePath={basePath} />
        <Footer content={content} basePath={basePath} />
      </main>
    </Shell>
  );
}

const site: SiteModule = {
  pages: { '': Home },
  metadata: (content) => ({
    title: content.event.short_name ?? content.event.name,
    description: TAGLINE,
  }),
};

export default site;
