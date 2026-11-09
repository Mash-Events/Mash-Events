import Link from 'next/link';
import { eventColour, loadWorkspace } from '@core/admin/workspace';
import { WorkspaceNav } from './workspace-nav';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  const base = `/admin/o/${org}/e/${eventSlug}`;

  const links = [
    { href: base, label: 'Overview', show: true },
    {
      href: `${base}/registrations`,
      label: 'Registrations',
      show: permissions.includes('registrations.read'),
    },
    {
      href: `${base}/messages`,
      label: 'Messages',
      show: permissions.includes('messages.bulk'),
    },
    {
      href: `${base}/settings`,
      label: 'Settings',
      show: permissions.includes('events.manage'),
    },
  ].filter((link) => link.show);

  return (
    <div className="min-h-screen bg-stone-50">
      <header
        className="text-white"
        style={{ backgroundColor: eventColour(event.id) }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div>
            <Link
              href="/admin"
              className="text-xs font-medium text-white/80 hover:text-white"
            >
              ← All events
            </Link>
            <p className="text-lg font-semibold leading-tight">{event.name}</p>
            <p className="text-xs text-white/85">
              {event.orgName} · {event.status.replace(/_/g, ' ')}
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            You are in this event&apos;s workspace
          </span>
        </div>
      </header>
      <WorkspaceNav links={links.map(({ href, label }) => ({ href, label }))} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
