import { notFound } from 'next/navigation';
import { loadWorkspace } from '@core/admin/workspace';
import { CheckInScreen } from './check-in-screen';

// Scanner workspace (docs/system-design.md §9.2): staff with checkin.scan
// for this event get a device session; its secret lives in page memory only.

export const dynamic = 'force-dynamic';

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  if (!permissions.includes('checkin.scan')) notFound();

  return (
    <CheckInScreen
      eventId={event.id}
      eventName={event.name}
      canSpot={permissions.includes('registrations.review')}
      canExport={permissions.includes('exports.pii')}
    />
  );
}
