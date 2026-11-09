import { notFound } from 'next/navigation';
import { loadWorkspace } from '@core/admin/workspace';
import { SettingsForm } from './settings-form';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  if (!permissions.includes('events.manage')) notFound();
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-stone-900">Event settings</h1>
      <p className="mt-1 text-sm text-stone-600">
        Times are entered in {event.timezone}.
      </p>
      <SettingsForm eventId={event.id} timezone={event.timezone} />
    </div>
  );
}
