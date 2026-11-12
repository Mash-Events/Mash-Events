import { notFound } from 'next/navigation';
import { loadWorkspace } from '@core/admin/workspace';
import { CertificatesScreen } from './certificates-screen';

// Certificates tab (docs/system-design.md §9.1 phase 3): issue to the
// attended or confirmed audience, browse, revoke. Shown to staff holding
// certificates.manage for this event.

export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ org: string; event: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { event, permissions } = await loadWorkspace(org, eventSlug);
  if (!permissions.includes('certificates.manage')) notFound();

  return <CertificatesScreen eventId={event.id} eventName={event.name} />;
}
