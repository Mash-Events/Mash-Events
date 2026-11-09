import type { FormQuestion, SiteModule, SitePageProps } from '@core/site/types';
import {
  Agenda,
  EventHero,
  Section,
  SiteFooter,
  SpeakerGrid,
  Sponsors,
} from '@core/ui/site/sections';
import { RegistrationForm } from '@core/ui/site/registration-form';

// Demo event: shows how a custom-coded site uses the engine. A real event
// copies this folder and writes its own markup and copy (no CMS).

const questions: FormQuestion[] = [
  {
    key: 'role',
    label: 'Which best describes you?',
    type: 'select',
    options: [
      'Product',
      'Engineering',
      'Design',
      'Research',
      'Student',
      'Other',
    ],
    required: true,
  },
  {
    key: 'question',
    label: 'A question for the speakers (optional)',
    type: 'textarea',
    maxLength: 500,
  },
];

function Nav({ basePath }: { basePath: string }) {
  return (
    <nav className="bg-stone-950 text-sm text-white/80">
      <div className="mx-auto flex max-w-5xl gap-5 px-6 pt-5">
        <a href={basePath} className="hover:text-white">
          Home
        </a>
        <a href={`${basePath}/agenda`} className="hover:text-white">
          Agenda
        </a>
        <a href={`${basePath}#register`} className="hover:text-white">
          Register
        </a>
      </div>
    </nav>
  );
}

function Home({ content, basePath }: SitePageProps) {
  return (
    <main>
      <Nav basePath={basePath} />
      <EventHero
        content={content}
        tagline="A one-hour online session on shipping products people trust."
        cta={
          content.event.registration_open
            ? { href: '#register', label: 'Register free' }
            : undefined
        }
      />
      <Section title="Speakers">
        <SpeakerGrid speakers={content.speakers} />
      </Section>
      <Section title="Agenda">
        <Agenda content={content} />
      </Section>
      <Section id="register" title="Register">
        <div className="max-w-xl">
          <RegistrationForm
            basePath={basePath}
            open={content.event.registration_open}
            questions={questions}
          />
        </div>
      </Section>
      {content.sponsors.length ? (
        <Section title="Partners">
          <Sponsors content={content} />
        </Section>
      ) : null}
      <SiteFooter content={content} />
    </main>
  );
}

function AgendaPage({ content, basePath }: SitePageProps) {
  return (
    <main>
      <Nav basePath={basePath} />
      <EventHero content={content} />
      <Section title="Agenda">
        <Agenda content={content} />
      </Section>
      <SiteFooter content={content} />
    </main>
  );
}

const site: SiteModule = {
  pages: { '': Home, agenda: AgendaPage },
  metadata: (content, path) => ({
    title:
      path === 'agenda' ? `Agenda · ${content.event.name}` : content.event.name,
    description: 'A one-hour online session on shipping products people trust.',
  }),
};

export default site;
