import { notFound } from 'next/navigation';
import { loadWorkspace } from '@core/admin/workspace';
import { FeedbackScreen } from './feedback-screen';

// Feedback tab (docs/system-design.md §16.4). The list needs
// registrations.read; the editor (content.edit) and the request email
// (messages.bulk) buttons appear only for those who hold them.

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  if (!permissions.includes('registrations.read')) notFound();

  return (
    <FeedbackScreen
      eventId={event.id}
      canEdit={permissions.includes('content.edit')}
      canRequest={permissions.includes('messages.bulk')}
      canExport={permissions.includes('exports.pii')}
    />
  );
}
