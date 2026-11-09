// Browser-side Sentry, for the admin console only (docs/system-design.md
// §10.2): public event pages must stay light, so the SDK is a lazily loaded
// chunk that public pages never request. Server-side errors on public pages
// are still reported by the server SDK (instrumentation.ts).

type SentryModule = typeof import('@sentry/nextjs');

let sentry: SentryModule | null = null;

const isAdminHost =
  typeof window !== 'undefined' &&
  window.location.hostname.startsWith('admin.');

if (
  isAdminHost &&
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PUBLIC_SENTRY_DSN
) {
  void import('@sentry/nextjs').then((module) => {
    module.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      // No session replay: it can capture personal data.
      sendDefaultPii: false,
      enableLogs: true,
    });
    sentry = module;
  });
}

export function onRouterTransitionStart(
  ...args: Parameters<SentryModule['captureRouterTransitionStart']>
) {
  sentry?.captureRouterTransitionStart(...args);
}
