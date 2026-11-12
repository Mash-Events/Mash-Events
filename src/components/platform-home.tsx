import { getDirectory, type DirectoryEvent } from '@core/platform/directory';
import { orgs as registryOrgs } from '@sites/registry';
import { formatDate } from '@core/ui/site/format';

// The public face of the platform (docs/system-design.md §16.4): what Mash
// Events is, plus the directory of listed events — upcoming first, then the
// archive. Rendered at the main domain's root and at /platform on every
// host, so the directory is reachable from any event domain too. Each card
// links to the event on its organisation's own host (resolved here from the
// site registry — core never imports sites/).

const KIND_LABEL: Record<string, string> = {
  in_person: 'In person',
  webinar: 'Online',
  hybrid: 'Hybrid',
};

/** The org's public host: prefer a real domain over *.localhost. */
function hostFor(orgId: string): string | null {
  const entry = registryOrgs.find((org) => org.id === orgId);
  if (!entry) return null;
  const host =
    entry.hosts.find((candidate) => !candidate.endsWith('.localhost')) ??
    entry.hosts[0];
  return host ?? null;
}

function withUrl(
  event: DirectoryEvent
): (DirectoryEvent & { url: string }) | null {
  const host = hostFor(event.org_id);
  if (!host) return null;
  const isLocal =
    host.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  return {
    ...event,
    url: `${isLocal ? 'http' : 'https'}://${host}/${event.slug}`,
  };
}

function EventCard({
  event,
  past = false,
}: {
  event: DirectoryEvent & { url: string };
  past?: boolean;
}) {
  const when = event.starts_at
    ? formatDate(event.starts_at, event.timezone)
    : 'Date to be announced';
  return (
    <a
      href={event.url}
      className={`group flex flex-col justify-between rounded-2xl border bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_-22px_rgba(0,0,0,0.3)] ${
        past
          ? 'border-stone-200 opacity-80 hover:opacity-100'
          : 'border-stone-200'
      }`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#cb1977]">
          {KIND_LABEL[event.kind] ?? event.kind}
        </p>
        <h3 className="mt-2 text-lg font-bold leading-snug text-stone-900 group-hover:underline">
          {event.name}
        </h3>
        <p className="mt-1 text-sm text-stone-500">{event.org_name}</p>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-stone-600">{when}</p>
        <span className="text-sm font-semibold text-stone-900 group-hover:text-[#cb1977]">
          Visit site →
        </span>
      </div>
    </a>
  );
}

export async function PlatformHomePage() {
  let directory: Awaited<ReturnType<typeof getDirectory>> | null = null;
  try {
    directory = await getDirectory();
  } catch {
    directory = null;
  }
  const upcoming = directory?.upcoming ?? [];
  const past = directory?.past ?? [];

  return (
    <main className="min-h-screen bg-[#fafaf9] text-stone-900">
      {/* Hero */}
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_-10%,#500724_0%,transparent_55%),radial-gradient(ellipse_at_10%_110%,#3f3f46_0%,transparent_45%)]"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f472b6]">
            Mash Events
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Every event gets a beautiful site,
            <span className="text-white/60"> one platform runs them all.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            Registration, review, QR passes, check-in, certificates and
            reminders — for conference series, communities and the teams who run
            twenty events a year, not one.
          </p>
          {upcoming.length > 0 ? (
            <a
              href="#events"
              className="mt-10 inline-block rounded-full bg-white px-6 py-3 text-sm font-bold text-stone-900 transition-colors hover:bg-[#cb1977] hover:text-white"
            >
              Browse upcoming events
            </a>
          ) : null}
        </div>
      </section>

      {/* Directory: upcoming */}
      {upcoming.length > 0 ? (
        <section
          id="events"
          className="mx-auto max-w-6xl scroll-mt-8 px-6 py-16"
        >
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">
                Upcoming events
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Hosted on Mash Events — visit any event on its own site.
              </p>
            </div>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming
              .map(withUrl)
              .map(
                (event) => event && <EventCard key={event.id} event={event} />
              )}
          </div>
        </section>
      ) : null}

      {/* Directory: past */}
      {past.length > 0 ? (
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="text-2xl font-extrabold tracking-tight">
            Past events
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            The archive stays live — sites, recaps and verifiable certificates.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {past
              .map(withUrl)
              .map(
                (event) =>
                  event && <EventCard key={event.id} event={event} past />
              )}
          </div>
        </section>
      ) : null}

      {/* Empty state */}
      {upcoming.length === 0 && past.length === 0 ? (
        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight">
            Events live on their organisation&apos;s subdomain
          </h2>
          <p className="mt-3 text-stone-600">
            Public listings appear here as soon as an organiser lists their
            event.
          </p>
        </section>
      ) : null}

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-stone-500">
          <p className="font-semibold text-stone-800">
            Mash Events — the multi-event platform
          </p>
          <p>
            Registration · Passes · Check-in · Certificates · Retention, by
            design
          </p>
        </div>
      </footer>
    </main>
  );
}
