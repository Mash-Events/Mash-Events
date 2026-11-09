'use client';

import { useAdminSignOut } from '@/lib/admin-sign-out';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import adminExitUtils from '@/lib/admin-exit-utils.cjs';

const { normalizeAdminExitTarget, shouldAutoSignOutAdminNavigation } =
  adminExitUtils;

function AdminExitGuardInner({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const signOut = useAdminSignOut();

  useEffect(() => {
    function findNavigableAnchor(target) {
      if (!(target instanceof Element)) {
        return null;
      }

      return target.closest('a[href]');
    }

    async function handleDocumentClick(event) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = findNavigableAnchor(event.target);

      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href');

      if (
        !href ||
        href.startsWith('#') ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.origin);

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      const destination = normalizeAdminExitTarget(
        `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
      );

      if (!shouldAutoSignOutAdminNavigation(pathname, destination)) {
        return;
      }

      event.preventDefault();

      try {
        await signOut({ redirectUrl: destination });
      } catch {
        router.push(destination);
      }
    }

    document.addEventListener('click', handleDocumentClick);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [pathname, router, signOut]);

  return children;
}

export default function AdminExitGuard({ children }) {
  return <AdminExitGuardInner>{children}</AdminExitGuardInner>;
}
