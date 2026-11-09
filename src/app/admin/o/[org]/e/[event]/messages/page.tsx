import { notFound } from 'next/navigation';
import { loadWorkspace } from '@core/admin/workspace';
import { MessagesScreen } from './messages-screen';

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  if (!permissions.includes('messages.bulk')) notFound();
  return (
    <MessagesScreen
      eventId={event.id}
      eventName={event.name}
      timezone={event.timezone}
    />
  );
}
