import Link from 'next/link';
import { createEventClient } from '@core/auth/server';
import { loadWorkspace } from '@core/admin/workspace';
import { REGISTRATION_STATUSES } from '@core/registration/transitions';

export default async function WorkspaceOverview({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);

  let counts: Record<string, number> = {};
  let joined: number | null = null;
  if (permissions.includes('registrations.read')) {
    const db = await createEventClient(event.id);
    const [{ data }, attendance] = await Promise.all([
      db.rpc('registration_summary', { p_event_id: event.id }),
      db
        .from('webinar_attendance')
        .select('registration_id', { count: 'exact', head: true }),
    ]);
    joined = attendance.count ?? 0;
    counts = Object.fromEntries(
      (data ?? []).map((row: { status: string; total: number }) => [
        row.status,
        Number(row.total),
      ])
    );
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-stone-900">Overview</h1>
        <p className="mt-1 text-sm text-stone-600">
          Registration status: {event.status.replace(/_/g, ' ')} · Timezone{' '}
          {event.timezone}
        </p>
      </section>

      {permissions.includes('registrations.read') ? (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              Registrations
            </h2>
            <Link
              href={`/admin/o/${org}/e/${eventSlug}/registrations`}
              className="text-sm text-stone-700 underline"
            >
              Review →
            </Link>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Stat label="Total" value={total} />
            {joined ? <Stat label="Joined webinar" value={joined} /> : null}
            {REGISTRATION_STATUSES.map((status) => (
              <Stat
                key={status}
                label={status}
                value={counts[status] ?? 0}
                href={`/admin/o/${org}/e/${eventSlug}/registrations?status=${status}`}
              />
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-xs capitalize text-stone-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
        {value}
      </dd>
    </>
  );
  const className =
    'block rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-300';
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
