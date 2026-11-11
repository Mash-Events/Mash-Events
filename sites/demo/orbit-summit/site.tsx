import type {
  EventContent,
  FormQuestion,
  PublicSession,
  PublicSpeaker,
  SiteModule,
  SitePageProps,
} from '@core/site/types';
import { formatDate, formatTime, timeZoneLabel } from '@core/ui/site/format';
import { RegistrationForm } from '@core/ui/site/registration-form';
import { SiteFooter } from '@core/ui/site/sections';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  CalendarDays,
  Globe2,
  GraduationCap,
  MapPin,
  MessageSquare,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

// Fake client event for local development, seeded by supabase/demo.sql and
// never served in production. A real event copies this folder, writes its own
// markup and copy, and adds its registry entry (see sites/README.md).
//
// Everything here is server-rendered; the registration form is the only
// interactive island, so the page ships almost no JavaScript
// (docs/system-design.md §10.2).

const TAGLINE =
  'A one-day, two-track gathering on building software that survives contact with the real world — in person in Bengaluru and live online.';

const questions: FormQuestion[] = [
  {
    key: 'track',
    label: 'Which track are you most excited about?',
    type: 'select',
    options: ['Build', 'Scale', 'Both equally'],
    required: true,
  },
  {
    key: 'team',
    label: 'How big is your team?',
    type: 'select',
    options: ['Just me', '2–10', '11–50', '50+'],
  },
  {
    key: 'question',
    label: 'A question for the speakers (optional)',
    type: 'textarea',
    maxLength: 500,
  },
];

const HIGHLIGHTS: {
  icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: Zap,
    title: 'Two tracks, zero fluff',
    body: 'Build for craft and design; Scale for data, infrastructure and running things in production.',
  },
  {
    icon: MessageSquare,
    title: 'Real Q&A, not panels read off cards',
    body: 'Every session leaves at least fifteen minutes for questions from the room and the stream.',
  },
  {
    icon: GraduationCap,
    title: 'Closing demo night',
    body: 'Five-minute live demos from the community, judged by the speakers, prizes included.',
  },
  {
    icon: Globe2,
    title: 'Hybrid by design',
    body: 'The Grand Hall in Bengaluru, plus a live stream with its own moderators. One event, two rooms.',
  },
];

const FAQS = [
  {
    q: 'Do I need to pay to attend?',
    a: 'No. Orbit Summit is free, but seats are limited and every registration is reviewed by the team, so sign up early and tell us a little about yourself.',
  },
  {
    q: 'Is it in person or online?',
    a: 'Both. The main stage and both tracks happen in the Grand Hall in Bengaluru, and everything on the main stage streams live online.',
  },
  {
    q: 'How do I get my join link?',
    a: 'Once your registration is confirmed you receive a personal join link by email. Keep it: it is your entry to the stream on the day.',
  },
  {
    q: 'Will sessions be recorded?',
    a: 'Yes, main-stage talks are recorded and shared with registered attendees afterwards. Track rooms are in person only.',
  },
];

function Nav({ basePath }: { basePath: string }) {
  return (
    <nav className="sticky top-0 z-10 border-b border-white/10 bg-stone-950/90 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <a
          href={basePath}
          className="font-semibold tracking-tight hover:text-amber-300"
        >
          Orbit Summit <span className="text-amber-400">2026</span>
        </a>
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <a
            href={`${basePath}/agenda`}
            className="text-white/75 hover:text-white"
          >
            Agenda
          </a>
          <a
            href={`${basePath}/speakers`}
            className="text-white/75 hover:text-white"
          >
            Speakers
          </a>
          <a
            href={`${basePath}#register`}
            className="rounded-md bg-amber-400 px-4 py-2 font-semibold text-stone-950 hover:bg-amber-300"
          >
            Register free
          </a>
        </div>
      </div>
    </nav>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-300">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-relaxed text-white/85">{children}</dd>
    </div>
  );
}

function Hero({ content, basePath }: SitePageProps) {
  const { event } = content;
  return (
    <header className="bg-stone-950 text-white">
      <div className="relative overflow-hidden">
        {/* Decorative orbit rings; pure CSS, no images, no JS. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 top-16 h-64 w-64 rounded-full border border-amber-400/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-24 top-40 h-3 w-3 rounded-full bg-amber-400"
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pb-24 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-300">
            <Sparkles size={14} aria-hidden />
            {event.org.name} presents
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            {event.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            {TAGLINE}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {event.registration_open ? (
              <a
                href={`${basePath}#register`}
                className="rounded-md bg-amber-400 px-6 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300"
              >
                Register free
              </a>
            ) : null}
            <a
              href={`${basePath}/agenda`}
              className="rounded-md border border-white/25 px-6 py-3 text-sm font-semibold text-white hover:border-white/50"
            >
              View the agenda
            </a>
          </div>
          <dl className="mt-14 grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-3">
            <Fact icon={<CalendarDays size={18} aria-hidden />} label="When">
              {event.starts_at
                ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(
                    event.starts_at,
                    event.timezone
                  )}–${formatTime(event.ends_at, event.timezone)}`
                : 'Date to be announced'}
              <span className="mt-1 block text-xs text-white/50">
                {event.starts_at
                  ? timeZoneLabel(event.timezone, event.starts_at)
                  : ''}
              </span>
            </Fact>
            <Fact icon={<MapPin size={18} aria-hidden />} label="Where">
              Grand Hall, Bengaluru · live online
              <span className="mt-1 block text-xs text-white/50">
                Hybrid event
              </span>
            </Fact>
            <Fact icon={<Users size={18} aria-hidden />} label="Admission">
              Free · 300 seats · registrations reviewed
              <span className="mt-1 block text-xs text-white/50">
                Waitlist opens after
              </span>
            </Fact>
          </dl>
        </div>
      </div>
    </header>
  );
}

function Section({
  id,
  kicker,
  title,
  action,
  children,
}: {
  id?: string;
  kicker?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {kicker ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
              {kicker}
            </p>
          ) : null}
          <h2 className="mt-1 text-2xl font-semibold text-stone-900 sm:text-3xl">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function More({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-800"
    >
      {label}
      <ArrowRight size={16} aria-hidden />
    </a>
  );
}

function initials(name: string): string {
  return name
    .replace(/^Dr\.\s+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function SpeakerCard({ speaker }: { speaker: PublicSpeaker }) {
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-amber-300">
        {initials(speaker.name)}
      </div>
      <p className="mt-4 font-semibold text-stone-900">{speaker.name}</p>
      {speaker.title || speaker.affiliation ? (
        <p className="mt-1 text-sm text-amber-700">
          {[speaker.title, speaker.affiliation].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {speaker.bio ? (
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          {speaker.bio}
        </p>
      ) : null}
    </li>
  );
}

function TrackBadge({ track }: { track: string | null }) {
  const style =
    track === 'Build'
      ? 'bg-amber-100 text-amber-900'
      : track === 'Scale'
        ? 'bg-sky-100 text-sky-900'
        : 'bg-stone-200 text-stone-700';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {track ?? 'Session'}
    </span>
  );
}

function SessionCard({
  session,
  speakers,
}: {
  session: PublicSession;
  speakers: Map<string, PublicSpeaker>;
}) {
  const names = session.speaker_ids
    .map((id) => speakers.get(id)?.name)
    .filter(Boolean)
    .join(', ');
  return (
    <li className="h-full rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <TrackBadge track={session.track} />
        {session.room ? (
          <span className="text-xs text-stone-500">{session.room}</span>
        ) : null}
      </div>
      <p className="mt-3 font-semibold text-stone-900">{session.title}</p>
      {session.description ? (
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          {session.description}
        </p>
      ) : null}
      {names ? (
        <p className="mt-3 text-sm font-medium text-amber-700">{names}</p>
      ) : null}
    </li>
  );
}

/** Consecutive sessions with the same start and end time share a row. */
function slots(sessions: PublicSession[]) {
  const grouped: { key: string; sessions: PublicSession[] }[] = [];
  for (const session of sessions) {
    const key = `${session.starts_at ?? ''}/${session.ends_at ?? ''}`;
    const last = grouped[grouped.length - 1];
    if (last && last.key === key) last.sessions.push(session);
    else grouped.push({ key, sessions: [session] });
  }
  return grouped;
}

function Agenda({ content, limit }: { content: EventContent; limit?: number }) {
  const map = new Map(content.speakers.map((s) => [s.id, s]));
  const shown = limit ? content.sessions.slice(0, limit) : content.sessions;
  return (
    <ol className="space-y-6">
      {slots(shown).map((slot) => {
        const first = slot.sessions[0];
        return (
          <li
            key={slot.key}
            className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:gap-6"
          >
            <div className="sm:text-right">
              <p className="text-sm font-semibold text-stone-900">
                {first.starts_at
                  ? formatTime(first.starts_at, content.event.timezone)
                  : 'TBA'}
              </p>
              <p className="text-xs text-stone-500">
                {first.ends_at
                  ? `until ${formatTime(first.ends_at, content.event.timezone)}`
                  : ''}
              </p>
            </div>
            <ul
              className={`grid gap-3 ${slot.sessions.length > 1 ? 'md:grid-cols-2' : ''}`}
            >
              {slot.sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  speakers={map}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function Sponsors({ content }: { content: EventContent }) {
  const tiers = ['Title', 'Platinum', 'Gold', 'Community'];
  const groups = [
    ...tiers.map((tier) => ({
      tier,
      list: content.sponsors.filter((s) => s.tier === tier),
    })),
    {
      tier: 'Partners',
      list: content.sponsors.filter((s) => !s.tier || !tiers.includes(s.tier)),
    },
  ].filter((group) => group.list.length);
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.tier}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            {group.tier}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-4">
            {group.list.map((sponsor) => (
              <li key={sponsor.id}>
                {sponsor.url ? (
                  <a
                    href={sponsor.url}
                    rel="noopener noreferrer sponsored"
                    target="_blank"
                    className="block rounded-lg border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-800 hover:border-amber-400 hover:text-amber-800"
                  >
                    {sponsor.name}
                  </a>
                ) : (
                  <span className="block rounded-lg border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-800">
                    {sponsor.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FaqSection() {
  return (
    <Section kicker="FAQ" title="Good to know">
      <div className="max-w-3xl space-y-3">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="rounded-xl border border-stone-200 bg-white p-5 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="cursor-pointer font-semibold text-stone-900">
              {item.q}
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Register({ content, basePath }: SitePageProps) {
  const { event } = content;
  const closes = event.registration_closes_at
    ? `Registration closes ${formatDate(event.registration_closes_at, event.timezone)}.`
    : '';
  return (
    <section id="register" className="bg-stone-950 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
            Register
          </p>
          <h2 className="mt-2 text-3xl font-semibold">Save your seat</h2>
          <p className="mt-4 leading-relaxed text-white/75">
            Seats are limited and every registration is reviewed by a person —
            this is not first-come-first-served. Here is what happens after you
            submit:
          </p>
          <ol className="mt-6 space-y-3 text-sm text-white/80">
            <li className="flex gap-3">
              <span className="font-semibold text-amber-300">1.</span>
              You get an acknowledgement email within minutes.
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-amber-300">2.</span>
              The team reviews your registration (usually within a day).
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-amber-300">3.</span>
              On confirmation you receive your personal join link by email.
            </li>
          </ol>
          <p className="mt-6 text-xs text-white/50">
            {closes} Free admission. Contact the team at{' '}
            <a
              href="mailto:hello@example.org"
              className="underline hover:text-white/70"
            >
              hello@example.org
            </a>
            .
          </p>
        </div>
        <div className="rounded-xl bg-white p-6 text-stone-900 sm:p-8">
          <RegistrationForm
            basePath={basePath}
            open={event.registration_open}
            questions={questions}
            closedMessage="Registration is closed. Write to hello@example.org to join the waiting list."
          />
        </div>
      </div>
    </section>
  );
}

function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="bg-stone-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        {lead ? (
          <p className="mt-3 max-w-2xl leading-relaxed text-white/70">{lead}</p>
        ) : null}
      </div>
    </header>
  );
}

function Home({ content, basePath }: SitePageProps) {
  return (
    <main>
      <Nav basePath={basePath} />
      <Hero content={content} basePath={basePath} />
      <Section kicker="Why come" title="A day built for builders">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.title}
                className="rounded-xl border border-stone-200 bg-white p-5"
              >
                <Icon size={20} className="text-amber-600" aria-hidden />
                <p className="mt-3 font-semibold text-stone-900">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">
                  {item.body}
                </p>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section
        kicker="Speakers"
        title="People worth listening to"
        action={<More href={`${basePath}/speakers`} label="All speakers" />}
      >
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {content.speakers.slice(0, 4).map((speaker) => (
            <SpeakerCard key={speaker.id} speaker={speaker} />
          ))}
        </ul>
      </Section>
      <Section
        kicker="Agenda"
        title="The day at a glance"
        action={<More href={`${basePath}/agenda`} label="Full agenda" />}
      >
        <Agenda content={content} limit={5} />
      </Section>
      {content.sponsors.length ? (
        <Section kicker="Partners" title="Backed by">
          <Sponsors content={content} />
        </Section>
      ) : null}
      <Register content={content} basePath={basePath} />
      <FaqSection />
      <SiteFooter content={content} />
    </main>
  );
}

function AgendaPage({ content, basePath }: SitePageProps) {
  return (
    <main>
      <Nav basePath={basePath} />
      <PageHeader
        title="Agenda"
        lead="Two tracks — Build and Scale — around a shared main stage. Track talks are in person only; everything on the main stage streams live. All times India Standard Time."
      />
      <div className="mx-auto max-w-6xl px-6 py-14">
        <Agenda content={content} />
      </div>
      <Register content={content} basePath={basePath} />
      <SiteFooter content={content} />
    </main>
  );
}

function SpeakersPage({ content, basePath }: SitePageProps) {
  return (
    <main>
      <Nav basePath={basePath} />
      <PageHeader
        title="Speakers"
        lead="Eight practitioners from product, engineering, design and research — all speaking from scar tissue, not slides."
      />
      <div className="mx-auto max-w-6xl px-6 py-14">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {content.speakers.map((speaker) => (
            <SpeakerCard key={speaker.id} speaker={speaker} />
          ))}
        </ul>
      </div>
      <Register content={content} basePath={basePath} />
      <SiteFooter content={content} />
    </main>
  );
}

const site: SiteModule = {
  pages: { '': Home, agenda: AgendaPage, speakers: SpeakersPage },
  metadata: (content, path) => {
    const name = content.event.short_name ?? content.event.name;
    const title =
      path === ''
        ? name
        : `${path === 'agenda' ? 'Agenda' : 'Speakers'} · ${name}`;
    return { title, description: TAGLINE };
  },
};

export default site;
