import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@core/auth/server';
import { getSupabaseConfig } from '@core/auth/config';
import AdminAccessFallback from '@/components/admin/admin-access-fallback';

export const metadata: Metadata = {
  title: 'Admin · Mash Events',
  robots: { index: false, follow: false },
};

// Second check behind the proxy (docs/system-design.md §6.3): no admin page
// renders without a verified session at aal2. Permission per event is checked
// by each workspace page.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!getSupabaseConfig().configured) {
    return <AdminAccessFallback operator={{ reason: 'auth_unavailable' }} />;
  }
  const session = await getAdminSession();
  if (!session) redirect('/auth/sign-in');
  if (session.aal !== 'aal2') redirect('/auth/mfa');
  return <>{children}</>;
}
