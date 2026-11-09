import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in · Mash Events',
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-black/5 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Mash Events admin
        </p>
        {children}
      </div>
    </main>
  );
}
