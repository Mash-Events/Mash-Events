import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { loadWorkspace } from '@core/admin/workspace';
import { RegistrationsScreen } from './registrations-screen';

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  if (!permissions.includes('registrations.read')) notFound();
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <RegistrationsScreen
        eventId={event.id}
        eventName={event.name}
        canReview={permissions.includes('registrations.review')}
        canExport={permissions.includes('exports.pii')}
      />
    </Suspense>
  );
}
