import { withSentryConfig } from '@sentry/nextjs/config';

// Adapted from the seed codebase's next.config.mjs, minus Clerk, Sanity and Mux origins.
// Admin pages get a stricter nonce-based CSP from proxy.ts (design §13).

const workspaceRoot = process.cwd();
const isDev = process.env.NODE_ENV !== 'production';

const sentryCspOrigins = [
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://*.supabase.co",
  `connect-src 'self' https://*.supabase.co ${sentryCspOrigins.join(' ')}`,
  'frame-src https://challenges.cloudflare.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  serverExternalPackages: ['@react-pdf/renderer'],
  allowedDevOrigins: ['127.0.0.1', 'localhost', '*.localhost'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
