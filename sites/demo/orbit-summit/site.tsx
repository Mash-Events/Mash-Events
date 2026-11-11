import { Inter } from 'next/font/google';
import Image from 'next/image';
import type {
  EventContent,
  FormQuestion,
  PublicSpeaker,
  SiteModule,
  SitePageProps,
} from '@core/site/types';
import { formatDate, formatTime, timeZoneLabel } from '@core/ui/site/format';
import { RegistrationForm } from '@core/ui/site/registration-form';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

// Fake client event for local development, seeded by supabase/demo.sql and
// never served in production. A real event copies this folder, writes its own
// markup and copy, and adds its registry entry (see sites/README.md).
//
// Design language: Web Summit (websummit.com) — white editorial canvas,
// black type in Inter at large scale, signature pink accent, photography-led
// bands and stats. Everything is server-rendered; the registration form is the
// only interactive island (docs/system-design.md §10.2).

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ws',
});

const TAGLINE =
  'A one-day, two-track gathering on building software that survives contact with the real world — in person in Bengaluru and live online.';

// Demo photography from Unsplash (real events use Supabase Storage).
const PHOTOS = {
  hero: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?q=80&w=2400&auto=format&fit=crop',
  why: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?q=80&w=2400&auto=format&fit=crop',
  agenda:
    'https://images.unsplash.com/photo-1523580494863-6f3031224c94?q=80&w=2400&auto=format&fit=crop',
  speakers:
    'https://images.unsplash.com/photo-1591115765373-5207764f72e7?q=80&w=2400&auto=format&fit=crop',
};

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

const HIGHLIGHTS = [
  {
    title: 'Two tracks, zero fluff',
    body: 'Build for craft and design; Scale for data, infrastructure and running things in production.',
  },
  {
    title: 'Real Q&A, not read-off-card panels',
    body: 'Every session leaves at least fifteen minutes for questions from the room and the stream.',
  },
  {
    title: 'Closing demo night',
    body: 'Five-minute live demos from the community, judged by the speakers, prizes included.',
  },
  {
    title: 'Hybrid by design',
    body: 'The Grand Hall in Bengaluru, plus a live stream with its own moderators. One event, two rooms.',
  },
];

const QUOTES = [
  {
    quote:
      'The hallway track alone was worth the day — I shipped two fixes before the closing keynote.',
    name: 'Devika Raman',
    role: 'Staff Engineer, Example Cloud',
  },
  {
    quote:
      'Finally a conference where the speakers run systems, not slideware.',
    name: 'Nikhil Varma',
    role: 'CTO, Sample Co',
  },
  {
    quote:
      'My team came back with a shared vocabulary and an actual to-do list.',
    name: 'Ananya Pillai',
    role: 'Engineering Manager, Northwind Labs',
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

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className={inter.variable}
      style={{ fontFamily: 'var(--font-ws), Inter, system-ui, sans-serif' }}
    >
      {children}
    </div>
  );
}

function Nav({ basePath }: { basePath: string }) {
  return (
    <nav className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <a
          href={basePath}
          className="text-lg font-extrabold tracking-tight text-black"
        >
          Orbit Summit <span className="text-[#cb1977]">2026</span>
        </a>
        <div className="flex items-center gap-6 text-sm font-medium text-black">
          <a className="hover:text-[#cb1977]" href={`${basePath}/agenda`}>
            Agenda
          </a>
          <a className="hover:text-[#cb1977]" href={`${basePath}/speakers`}>
            Speakers
          </a>
          <a
            href={`${basePath}#register`}
            className="rounded-full bg-black px-5 py-2.5 font-semibold text-white hover:bg-[#cb1977]"
          >
            Register free
          </a>
        </div>
      </div>
    </nav>
  );
}

function Eyebrow({
  children,
  light,
}: {
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.2em] ${
        light ? 'text-white/50' : 'text-black/50'
      }`}
    >
      {children}
    </p>
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

function More({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-sm font-bold text-[#cb1977] hover:text-black"
    >
      {label}
      <ArrowRight size={16} aria-hidden />
    </a>
  );
}

function PhotoBand({ content }: { content: EventContent }) {
  const { speakers, sessions } = content;
  const tracks = new Set(
    sessions.map((s) => s.track).filter((t): t is string => Boolean(t))
  ).size;
  const stats = [
    { value: String(speakers.length), label: 'Speakers' },
    { value: String(sessions.length), label: 'Sessions' },
    { value: String(tracks || 1), label: 'Tracks' },
    { value: '300', label: 'Seats' },
  ];
  return (
    <div className="relative h-[440px] w-full sm:h-[500px]">
      <Image
        src={PHOTOS.hero}
        alt="Attendees at a technology conference"
        fill
        priority
        className="object-cover"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <h2 className="max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Why will 300 builders gather in Bengaluru?
          </h2>
          <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-l-2 border-[#cb1977] pl-4"
              >
                <dt className="text-xs font-semibold uppercase tracking-widest text-white/60">
                  {stat.label}
                </dt>
                <dd className="text-3xl font-extrabold tabular-nums text-white sm:text-4xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
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
    : 'Dates to be announced';
  return (
    <header className="bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-16 sm:pt-24">
        <Eyebrow>{event.org.name} · Grand Hall, Bengaluru</Eyebrow>
        <h1 className="mt-6 max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
          {event.name}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-black/70">
          {TAGLINE}
        </p>
        <p className="mt-4 text-sm font-medium text-black/50">
          “The most useful day of the year for builders.” — The Bengaluru
          Builder Report
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {event.registration_open ? (
            <a
              href={`${basePath}#register`}
              className="rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white hover:bg-[#cb1977]"
            >
              Register free
            </a>
          ) : null}
          <a
            href={`${basePath}/agenda`}
            className="rounded-full border border-black px-7 py-3.5 text-sm font-semibold text-black hover:border-[#cb1977] hover:text-[#cb1977]"
          >
            View the agenda
          </a>
          <span className="text-sm text-black/40">{when}</span>
        </div>
      </div>
      <PhotoBand content={content} />
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
    <section id={id} className="bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-black pb-6">
          <div>
            {kicker ? <Eyebrow>{kicker}</Eyebrow> : null}
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">
              {title}
            </h2>
          </div>
          {action}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function SpeakerTile({ speaker }: { speaker: PublicSpeaker }) {
  const role = [speaker.title, speaker.affiliation].filter(Boolean).join(' · ');
  return (
    <li className="group bg-black p-6 transition-colors hover:bg-[#cb1977]">
      <p className="text-4xl font-extrabold tracking-tight text-white/25 group-hover:text-white/40">
        {initials(speaker.name)}
      </p>
      <p className="mt-8 font-bold text-white">{speaker.name}</p>
      {role ? (
        <p className="text-sm text-white/60 group-hover:text-white/80">
          {role}
        </p>
      ) : null}
      {speaker.bio ? (
        <p className="mt-3 hidden text-sm leading-relaxed text-white/70 lg:block">
          {speaker.bio}
        </p>
      ) : null}
    </li>
  );
}

function TrackChip({ track }: { track: string | null }) {
  const [label, cls] =
    track === 'Build'
      ? ['Build', 'bg-[#cb1977] text-white']
      : track === 'Scale'
        ? ['Scale', 'bg-white text-black border border-black']
        : track
          ? [track, 'bg-black text-white']
          : ['Break', 'bg-black/5 text-black/60'];
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function Agenda({ content, limit }: { content: EventContent; limit?: number }) {
  const map = new Map(content.speakers.map((s) => [s.id, s]));
  const shown = limit ? content.sessions.slice(0, limit) : content.sessions;
  return (
    <ol className="border-t-2 border-black">
      {shown.map((session) => {
        const names = session.speaker_ids
          .map((id) => map.get(id)?.name)
          .filter(Boolean)
          .join(', ');
        return (
          <li
            key={session.id}
            className="grid gap-3 border-b border-black/10 py-6 sm:grid-cols-[10rem_1fr] sm:gap-8"
          >
            <p className="text-sm font-extrabold tabular-nums text-black">
              {session.starts_at
                ? formatTime(session.starts_at, content.event.timezone)
                : 'TBA'}
              {session.ends_at ? (
                <span className="block font-medium text-black/40">
                  {formatTime(session.ends_at, content.event.timezone)}
                </span>
              ) : null}
            </p>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <TrackChip track={session.track} />
                {session.room ? (
                  <span className="text-xs font-semibold uppercase tracking-widest text-black/40">
                    {session.room}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xl font-bold tracking-tight text-black">
                {session.title}
              </p>
              {session.description ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-black/60">
                  {session.description}
                </p>
              ) : null}
              {names ? (
                <p className="mt-2 text-sm font-semibold text-[#cb1977]">
                  {names}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Why({ content }: { content: EventContent }) {
  return (
    <section className="bg-white text-black">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
        <div className="relative h-72 w-full sm:h-96">
          <Image
            src={PHOTOS.why}
            alt="A workshop session at a technology conference"
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        </div>
        <div>
          <Eyebrow>Why come</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            A day built for builders
          </h2>
          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#cb1977]" />
                <div>
                  <p className="font-bold text-black">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-black/60">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
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
    <section className="bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Eyebrow>Partners</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Backed by
        </h2>
        <div className="mt-10 space-y-10">
          {groups.map((group) => (
            <div key={group.tier}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/40">
                {group.tier}
              </p>
              <ul className="mt-4 flex flex-wrap gap-3">
                {group.list.map((sponsor) => (
                  <li key={sponsor.id}>
                    {sponsor.url ? (
                      <a
                        href={sponsor.url}
                        rel="noopener noreferrer sponsored"
                        target="_blank"
                        className="inline-block rounded-full border border-black/15 px-6 py-3 text-sm font-bold text-black hover:border-[#cb1977] hover:text-[#cb1977]"
                      >
                        {sponsor.name}
                      </a>
                    ) : (
                      <span className="inline-block rounded-full border border-black/15 px-6 py-3 text-sm font-bold text-black">
                        {sponsor.name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Quotes() {
  return (
    <section className="bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Eyebrow light>What attendees say</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Word of mouth
        </h2>
        <ul className="mt-10 grid gap-10 md:grid-cols-3">
          {QUOTES.map((quote) => (
            <li key={quote.name} className="border-l-2 border-[#cb1977] pl-5">
              <p className="text-lg font-semibold leading-snug text-white">
                “{quote.quote}”
              </p>
              <p className="mt-4 text-sm font-bold text-white">{quote.name}</p>
              <p className="text-sm text-white/50">{quote.role}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Register({ content, basePath }: SitePageProps) {
  const { event } = content;
  const closes = event.registration_closes_at
    ? `Registration closes ${formatDate(
        event.registration_closes_at,
        event.timezone
      )}.`
    : '';
  return (
    <section id="register" className="bg-white text-black">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2">
        <div>
          <Eyebrow>Register</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Save your seat
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-black/70">
            Seats are limited and every registration is reviewed by a person —
            this is not first-come-first-served. Here is what happens after you
            submit:
          </p>
          <ol className="mt-8 space-y-4">
            {[
              'Acknowledgement email within minutes.',
              'Reviewed by the team, usually within a day.',
              'Personal join link on confirmation.',
            ].map((step, index) => (
              <li key={step} className="flex gap-4">
                <span className="text-2xl font-extrabold text-[#cb1977]">
                  0{index + 1}
                </span>
                <span className="pt-1 text-sm text-black/70">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-black/50">
            {closes} Free admission — seats are confirmed by review, not by
            speed. Questions?{' '}
            <a
              href="mailto:hello@example.org"
              className="font-semibold text-[#cb1977] hover:text-black"
            >
              hello@example.org
            </a>
          </p>
        </div>
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-[0_25px_60px_-30px_rgba(0,0,0,0.35)] sm:p-8">
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

function Faq() {
  return (
    <section className="bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">
          Good to know
        </h2>
        <div className="mt-10 max-w-3xl">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group border-b border-black/10 py-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-bold text-black">
                {item.q}
                <span className="text-2xl leading-none text-[#cb1977] transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-black/60">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ content, basePath }: SitePageProps) {
  const { event } = content;
  return (
    <footer className="bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-4xl font-extrabold tracking-tight sm:text-6xl">
          {event.short_name ?? event.name}
        </p>
        <div className="mt-10 flex flex-wrap gap-x-10 gap-y-3 text-sm font-semibold">
          <a
            className="text-white/70 hover:text-[#cb1977]"
            href={`${basePath}/agenda`}
          >
            Agenda
          </a>
          <a
            className="text-white/70 hover:text-[#cb1977]"
            href={`${basePath}/speakers`}
          >
            Speakers
          </a>
          <a
            className="text-white/70 hover:text-[#cb1977]"
            href={`${basePath}#register`}
          >
            Register
          </a>
          <a
            className="text-white/70 hover:text-[#cb1977]"
            href="mailto:hello@example.org"
          >
            hello@example.org
          </a>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-xs text-white/40">
          {event.name} · organised by {event.org.name} · a demo event for the
          Mash Events engine
        </p>
      </div>
    </footer>
  );
}

function PageHeader({
  title,
  lead,
  photo,
}: {
  title: string;
  lead: string;
  photo: string;
}) {
  return (
    <header className="bg-black text-white">
      <div className="relative h-56 sm:h-72">
        <Image
          src={photo}
          alt="Attendees at a technology conference"
          fill
          className="object-cover opacity-60"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-8">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-white/70">{lead}</p>
      </div>
    </header>
  );
}

function Home({ content, basePath }: SitePageProps) {
  return (
    <Shell>
      <main>
        <Nav basePath={basePath} />
        <Hero content={content} basePath={basePath} />
        <Section
          kicker="On the stages"
          title="Meet the speakers"
          action={<More href={`${basePath}/speakers`} label="All speakers" />}
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.speakers.slice(0, 4).map((speaker) => (
              <SpeakerTile key={speaker.id} speaker={speaker} />
            ))}
          </ul>
        </Section>
        <Why content={content} />
        <Section
          kicker="Schedule"
          title="The day at a glance"
          action={<More href={`${basePath}/agenda`} label="Full agenda" />}
        >
          <Agenda content={content} limit={4} />
        </Section>
        {content.sponsors.length ? <Sponsors content={content} /> : null}
        <Quotes />
        <Register content={content} basePath={basePath} />
        <Faq />
        <Footer content={content} basePath={basePath} />
      </main>
    </Shell>
  );
}

function AgendaPage({ content, basePath }: SitePageProps) {
  return (
    <Shell>
      <main>
        <Nav basePath={basePath} />
        <PageHeader
          title="Agenda"
          lead="Two tracks — Build and Scale — around a shared main stage. Track talks are in person only; everything on the main stage streams live. All times India Standard Time."
          photo={PHOTOS.agenda}
        />
        <section className="bg-white text-black">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <Agenda content={content} />
          </div>
        </section>
        <Register content={content} basePath={basePath} />
        <Footer content={content} basePath={basePath} />
      </main>
    </Shell>
  );
}

function SpeakersPage({ content, basePath }: SitePageProps) {
  return (
    <Shell>
      <main>
        <Nav basePath={basePath} />
        <PageHeader
          title="Speakers"
          lead="Eight practitioners from product, engineering, design and research — all speaking from scar tissue, not slides."
          photo={PHOTOS.speakers}
        />
        <section className="bg-white text-black">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {content.speakers.map((speaker) => (
                <SpeakerTile key={speaker.id} speaker={speaker} />
              ))}
            </ul>
          </div>
        </section>
        <Register content={content} basePath={basePath} />
        <Footer content={content} basePath={basePath} />
      </main>
    </Shell>
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
