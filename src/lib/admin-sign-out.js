'use client';

import { useCallback } from 'react';

// Replaces the seed codebase's Clerk `useClerk().signOut`. Admin auth is Supabase Auth with
// HttpOnly cookies and no browser Supabase client (docs/system-design.md §6.4),
// so the browser asks the server to end the session. The `/auth/sign-out`
// route is built in the core/auth step.
export function useAdminSignOut() {
  return useCallback(async ({ redirectUrl = '/' } = {}) => {
    try {
      await fetch('/auth/sign-out', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      window.location.assign(redirectUrl);
    }
  }, []);
}
