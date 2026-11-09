'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function WorkspaceNav({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl gap-1 px-6">
        {links.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== links[0]?.href && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`border-b-2 px-3 py-3 text-sm font-medium ${
                active
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
