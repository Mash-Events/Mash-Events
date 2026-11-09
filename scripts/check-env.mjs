// Production environment check: lists missing or weak settings without ever
// printing a value. Run against the values you are about to put in Vercel:
//   node --env-file=.env.production.local scripts/check-env.mjs
// Exit code 1 when anything required is missing.

const checks = [
  // [name, required, validator, hint]
  ['MASH_ENV', true, (v) => v === 'production', 'must be "production"'],
  [
    'MASH_ADMIN_HOSTS',
    true,
    (v) => !/localhost/.test(v),
    'e.g. admin.<domain>',
  ],
  [
    'MASH_ROOT_HOSTS',
    true,
    (v) => !/localhost/.test(v),
    'e.g. <domain>,www.<domain>',
  ],
  ['SITE_URL', true, (v) => v.startsWith('https://'), 'https://admin.<domain>'],
  [
    'NEXT_PUBLIC_SUPABASE_URL',
    true,
    (v) => /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(v),
    'project URL',
  ],
  [
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    true,
    (v) => v.startsWith('sb_publishable_'),
    'publishable key',
  ],
  [
    'SUPABASE_SECRET_KEY',
    true,
    (v) => v.startsWith('sb_secret_'),
    'secret key (server only)',
  ],
  [
    'LINK_MASTER_SECRET',
    true,
    (v) => v.length >= 32,
    '32+ random characters; never change after launch',
  ],
  [
    'PASS_MASTER_SECRET',
    false,
    (v) => v.length >= 32,
    '32+ random characters (QR passes, later)',
  ],
  [
    'SESSION_ACTIVITY_SECRET',
    true,
    (v) => v.length >= 32,
    '32+ random characters',
  ],
  ['CRON_SECRET', true, (v) => v.length >= 32, '32+ random characters'],
  ['RESEND_API_KEY', true, (v) => v.startsWith('re_'), 'Resend API key'],
  [
    'RESEND_DEFAULT_FROM',
    true,
    (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && !v.endsWith('.example'),
    'events@<verified domain>',
  ],
  [
    'RESEND_WEBHOOK_SECRET',
    true,
    (v) => v.startsWith('whsec_'),
    'from the Resend webhook',
  ],
  [
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    true,
    (v) => v.length > 10,
    'Cloudflare Turnstile site key',
  ],
  [
    'TURNSTILE_SECRET_KEY',
    true,
    (v) => v.length > 10,
    'Cloudflare Turnstile secret',
  ],
  [
    'UPSTASH_REDIS_REST_URL',
    true,
    (v) => v.startsWith('https://'),
    'rate limits across instances',
  ],
  ['UPSTASH_REDIS_REST_TOKEN', true, (v) => v.length > 10, ''],
  [
    'NEXT_PUBLIC_SENTRY_DSN',
    false,
    (v) => v.startsWith('https://'),
    'optional error tracking',
  ],
  [
    'SENTRY_DSN',
    false,
    (v) => v.startsWith('https://'),
    'optional error tracking',
  ],
];

let failed = 0;
for (const [name, required, valid, hint] of checks) {
  const value = process.env[name]?.trim();
  let status;
  if (!value) status = required ? 'MISSING' : 'optional, not set';
  else if (!valid(value)) status = 'INVALID';
  else status = 'ok';
  if (status === 'MISSING' || status === 'INVALID') failed += 1;
  const mark =
    status === 'ok' ? '✓' : status.startsWith('optional') ? '·' : '✗';
  console.log(
    `${mark} ${name.padEnd(38)} ${status}${status === 'ok' ? '' : hint ? ` — ${hint}` : ''}`
  );
}

const distinct = [
  'LINK_MASTER_SECRET',
  'SESSION_ACTIVITY_SECRET',
  'CRON_SECRET',
  'PASS_MASTER_SECRET',
]
  .map((n) => process.env[n])
  .filter(Boolean);
if (new Set(distinct).size !== distinct.length) {
  console.log('✗ secrets must all be different');
  failed += 1;
}

console.log(
  failed
    ? `\n${failed} problem(s).`
    : '\nAll required production settings look right.'
);
process.exit(failed ? 1 : 0);
