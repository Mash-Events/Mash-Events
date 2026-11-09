'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, platformApi } from '@core/admin/api-client';

type EventSummary = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  starts_at: string | null;
};
type Org = {
  id: string;
  slug: string;
  name: string;
  status: string;
  events: EventSummary[];
};
type Member = {
  id: string;
  email: string | null;
  scope: 'platform' | 'org' | 'event';
  role: string;
  org_id: string | null;
  event_id: string | null;
  organizations: { name: string } | null;
  events: { name: string } | null;
};

const input = 'rounded-md border border-stone-300 px-3 py-2 text-sm';
const button =
  'rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50';

const ROLES_BY_SCOPE = {
  platform: ['super_admin'],
  org: ['org_admin', 'reviewer'],
  event: ['reviewer', 'checkin_staff'],
} as const;

export function PlatformScreen() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (isActive: () => boolean = () => true) =>
      Promise.all([
        platformApi<{ organizations: Org[] }>('/orgs'),
        platformApi<{ members: Member[] }>('/members'),
      ]).then(
        ([o, m]) => {
          if (!isActive()) return;
          setOrgs(o.organizations);
          setMembers(m.members);
        },
        (e) => {
          if (!isActive()) return;
          setNotice({
            ok: false,
            text: e instanceof AdminApiError ? e.message : 'Could not load.',
          });
        }
      ),
    []
  );

  const load = useCallback(() => apply(), [apply]);

  useEffect(() => {
    let active = true;
    void apply(() => active);
    return () => {
      active = false;
    };
  }, [apply]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ ok: true, text: success });
      await load();
      return true;
    } catch (e) {
      setNotice({
        ok: false,
        text: e instanceof AdminApiError ? e.message : 'Something went wrong.',
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-10">
      {notice ? (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`rounded-md p-3 text-sm ${notice.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-900">
          Organisations and events
        </h2>
        <CreateOrg busy={busy} run={run} />
        <div className="space-y-4">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="rounded-lg border border-stone-200 bg-white p-4"
            >
              <p className="font-medium text-stone-900">
                {org.name}{' '}
                <span className="text-xs text-stone-500">({org.slug})</span>
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {org.events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/admin/o/${org.slug}/e/${event.slug}`}
                      className="text-stone-800 underline"
                    >
                      {event.name}
                    </Link>{' '}
                    <span className="text-stone-500">
                      · {event.kind.replace('_', ' ')} ·{' '}
                      {event.status.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
                {org.events.length === 0 ? (
                  <li className="text-stone-500">No events yet.</li>
                ) : null}
              </ul>
              <CreateEvent orgId={org.id} busy={busy} run={run} />
            </div>
          ))}
          {orgs.length === 0 ? (
            <p className="text-sm text-stone-500">No organisations yet.</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-900">Members</h2>
        <InviteMember orgs={orgs} busy={busy} run={run} />
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Access to</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2">{m.email ?? '—'}</td>
                  <td className="px-4 py-2">{m.role.replace('_', ' ')}</td>
                  <td className="px-4 py-2 text-stone-600">
                    {m.scope === 'platform'
                      ? 'Everything'
                      : m.scope === 'org'
                        ? `All events of ${m.organizations?.name ?? 'org'}`
                        : `${m.events?.name ?? 'event'}`}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${m.email}'s ${m.role} access?`
                          )
                        ) {
                          void run(
                            () =>
                              platformApi(`/members/${m.id}/revoke`, {
                                method: 'POST',
                              }),
                            'Access removed.'
                          );
                        }
                      }}
                      className="text-xs text-red-700 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type Run = (
  action: () => Promise<unknown>,
  success: string
) => Promise<boolean>;

function CreateOrg({ busy, run }: { busy: boolean; run: Run }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(
          () => platformApi('/orgs', { method: 'POST', body: { name, slug } }),
          `Organisation “${name}” created.`
        );
        if (ok) {
          setName('');
          setSlug('');
        }
      }}
    >
      <input
        className={input}
        placeholder="Organisation name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSlug(
            e.target.value
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          );
        }}
        required
      />
      <input
        className={input}
        placeholder="subdomain (slug)"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        required
      />
      <button className={button} disabled={busy}>
        Add organisation
      </button>
    </form>
  );
}

function CreateEvent({
  orgId,
  busy,
  run,
}: {
  orgId: string;
  busy: boolean;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState('webinar');
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-stone-700 underline"
      >
        + Add event
      </button>
    );
  }
  return (
    <form
      className="mt-3 flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(
          () =>
            platformApi('/events', {
              method: 'POST',
              body: { org_id: orgId, name, slug, kind },
            }),
          `Event “${name}” created as a draft. Add its site in sites/ and the registry.`
        );
        if (ok) setOpen(false);
      }}
    >
      <input
        className={input}
        placeholder="Event name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSlug(
            e.target.value
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          );
        }}
        required
      />
      <input
        className={input}
        placeholder="url slug"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        required
      />
      <select
        className={input}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        <option value="webinar">Webinar</option>
        <option value="in_person">In person</option>
        <option value="hybrid">Hybrid</option>
      </select>
      <button className={button} disabled={busy}>
        Create event
      </button>
    </form>
  );
}

function InviteMember({
  orgs,
  busy,
  run,
}: {
  orgs: Org[];
  busy: boolean;
  run: Run;
}) {
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState<'platform' | 'org' | 'event'>('event');
  const [role, setRole] = useState('reviewer');
  const [target, setTarget] = useState('');

  const events = orgs.flatMap((org) =>
    org.events.map((event) => ({ ...event, orgId: org.id, orgName: org.name }))
  );

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const event = events.find((ev) => ev.id === target);
        const body = {
          email,
          scope,
          role,
          org_id:
            scope === 'org' ? target : scope === 'event' ? event?.orgId : null,
          event_id: scope === 'event' ? target : null,
        };
        const ok = await run(
          () => platformApi('/members', { method: 'POST', body }),
          `Access granted to ${email}.`
        );
        if (ok) setEmail('');
      }}
    >
      <input
        type="email"
        className={input}
        placeholder="name@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <select
        className={input}
        value={scope}
        onChange={(e) => {
          const next = e.target.value as typeof scope;
          setScope(next);
          setRole(ROLES_BY_SCOPE[next][0]);
          setTarget('');
        }}
      >
        <option value="event">One event</option>
        <option value="org">All events of an org</option>
        <option value="platform">Platform (super admin)</option>
      </select>
      <select
        className={input}
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {ROLES_BY_SCOPE[scope].map((r) => (
          <option key={r} value={r}>
            {r.replace('_', ' ')}
          </option>
        ))}
      </select>
      {scope === 'event' ? (
        <select
          className={input}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
        >
          <option value="">Choose event…</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.orgName} · {ev.name}
            </option>
          ))}
        </select>
      ) : scope === 'org' ? (
        <select
          className={input}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
        >
          <option value="">Choose organisation…</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      ) : null}
      <button className={button} disabled={busy}>
        Give access
      </button>
    </form>
  );
}
