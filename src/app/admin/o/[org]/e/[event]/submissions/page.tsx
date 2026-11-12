import { notFound } from 'next/navigation';
import { loadWorkspace } from '@core/admin/workspace';
import { SubmissionsScreen } from './submissions-screen';

// Submissions tab (docs/system-design.md §16.4 phase 3): the per-event
// inbox for contact, speaker, volunteer and media-accreditation forms.
// Shown to staff holding submissions.review for this event.

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  if (!permissions.includes('submissions.review')) notFound();

  return <SubmissionsScreen eventId={event.id} eventName={event.name} />;
}
