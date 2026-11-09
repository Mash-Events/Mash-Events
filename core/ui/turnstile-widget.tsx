'use client';

import Script from 'next/script';

// Cloudflare Turnstile for admin auth forms. With implicit rendering the
// widget adds a hidden `cf-turnstile-response` input to the surrounding form,
// which the auth server actions pass to Supabase as `captchaToken`
// (Supabase verifies it when Auth CAPTCHA protection is on). Renders nothing
// without a site key, e.g. in local development.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function TurnstileWidget({ action }: { action: string }) {
  if (!SITE_KEY) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile"
        data-sitekey={SITE_KEY}
        data-action={action}
        data-theme="light"
      />
    </>
  );
}
