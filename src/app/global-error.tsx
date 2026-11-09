'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            Something went wrong
          </h1>
          <p className="mt-4 text-gray-600">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="mt-8 rounded-lg bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
