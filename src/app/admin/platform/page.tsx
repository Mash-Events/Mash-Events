import Link from 'next/link';
import { notFound } from 'next/navigation';
import { checkPlatformAdmin } from '@core/auth/server';
import { PlatformScreen } from './platform-screen';

export const dynamic = 'force-dynamic';

// Super admin: organisations, events and members (docs/system-design.md §14).
export default async function PlatformPage() {
  const access = await checkPlatformAdmin();
  if (!access.ok) notFound();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/admin"
        className="text-sm text-stone-500 hover:text-stone-900"
      >
        ← All events
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-stone-900">Platform</h1>
      <p className="mt-1 text-sm text-stone-600">
        Organisations, events and who can access them. Super admins only.
      </p>
      <PlatformScreen />
    </main>
  );
}
