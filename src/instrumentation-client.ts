// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // No session replay: it adds client JS to public pages and can capture PII.
  sendDefaultPii: false,
  enableLogs: true,
  enabled: process.env.NODE_ENV === 'production',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
