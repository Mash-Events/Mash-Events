import { signOut } from '@core/auth/actions';
import {
  createAuthClient,
  getAdminSession,
  getMyMemberships,
} from '@core/auth/server';
import { isPlatformAdmin } from '@core/auth/permissions';

export const dynamic = 'force-dynamic';

type EventRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  starts_at: string | null;
  organizations: { slug: string; name: string } | null;
};

// Event picker: the admin always works inside one event's workspace (§12.4).
// RLS on `events` returns only events the user's memberships cover.
export default async function AdminHome() {
  const session = await getAdminSession();
  const memberships = await getMyMemberships();
  const supabase = await createAuthClient();
  const { data: events, error } = await supabase
    .from('events')
    .select('id, slug, name, status, starts_at, organizations(slug, name)')
    .order('starts_at', { ascending: false })
    .returns<EventRow[]>();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Mash Events admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">
            Choose an event
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Signed in as {session?.email ?? 'admin'}
            {isPlatformAdmin(memberships) ? ' · super admin' : ''}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-sm text-stone-600 underline">
            Sign out
          </button>
        </form>
      </header>

      {error ? (
        <p className="mt-8 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
          Events could not be loaded. The database may not be set up yet.
        </p>
      ) : memberships.length === 0 ? (
        <p className="mt-8 rounded-md bg-stone-100 p-4 text-sm text-stone-700">
          You have no access yet. Ask a super admin to add you to an event.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {(events ?? []).map((event) => (
            <li key={event.id}>
              <a
                href={`/admin/o/${event.organizations?.slug}/e/${event.slug}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
              >
                <span>
                  <span className="block font-medium text-stone-900">
                    {event.name}
                  </span>
                  <span className="text-xs text-stone-500">
                    {event.organizations?.name} · {event.status}
                  </span>
                </span>
                <span aria-hidden className="text-stone-400">
                  →
                </span>
              </a>
            </li>
          ))}
          {events?.length === 0 ? (
            <li className="px-4 py-3 text-sm text-stone-600">No events yet.</li>
          ) : null}
        </ul>
      )}
    </main>
  );
}
