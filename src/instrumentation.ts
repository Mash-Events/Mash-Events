type SentryRequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type SentryErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
};

export async function register() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export async function onRequestError(
  error: unknown,
  request: SentryRequestInfo,
  errorContext: SentryErrorContext
) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(error, request, errorContext);
}
