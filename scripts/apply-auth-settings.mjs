// Applies the Mash Supabase Auth settings (docs/runbooks/auth-settings.md)
// through the Management API. Dry run by default; --apply to change them.
//
//   node --env-file=.env.local scripts/apply-auth-settings.mjs            # preview
//   node --env-file=.env.local scripts/apply-auth-settings.mjs --apply    # apply
//
// Inputs (env): SUPABASE_ACCESS_TOKEN (required), SUPABASE_PROJECT_REF (or
// supabase/.temp/project-ref), ADMIN_URL (e.g. https://admin.<domain>).
// Optional groups, applied only when all their values are present:
//   SMTP:    RESEND_API_KEY, AUTH_SENDER_EMAIL, AUTH_SENDER_NAME
//   Google:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   CAPTCHA: TURNSTILE_SECRET_KEY
// Secret values are never printed.
import { existsSync, readFileSync } from 'node:fs';

const env = process.env;
const apply = process.argv.includes('--apply');

const token = env.SUPABASE_ACCESS_TOKEN?.trim();
const ref =
  env.SUPABASE_PROJECT_REF?.trim() ||
  (existsSync('supabase/.temp/project-ref')
    ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    : '');
const adminUrl = env.ADMIN_URL?.trim().replace(/\/$/, '');

if (!token || !ref || !adminUrl?.startsWith('https://')) {
  console.error(
    'Need SUPABASE_ACCESS_TOKEN, a project ref and ADMIN_URL=https://admin.<domain>.'
  );
  process.exit(1);
}

const linkButton = (heading, text, label, type) =>
  `<h2>${heading}</h2>\n<p>${text}</p>\n<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}">${label}</a></p>\n<p>If you did not expect this email, you can ignore it.</p>`;

const settings = {
  disable_signup: true,
  site_url: adminUrl,
  uri_allow_list: `${adminUrl}/auth/**`,
  password_min_length: 12,
  password_required_characters:
    String.raw`abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_+-=[]{};'\\:"|<>?,./` +
    '`~',
  jwt_exp: 600,
  refresh_token_rotation_enabled: true,
  security_refresh_token_reuse_interval: 10,
  external_anonymous_users_enabled: false,
  external_phone_enabled: false,
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  mfa_phone_enroll_enabled: false,
  mfa_phone_verify_enabled: false,
  mailer_secure_email_change_enabled: true,
};
const secretKeys = new Set([
  'smtp_pass',
  'external_google_secret',
  'security_captcha_secret',
]);
const groups = ['base'];

if (env.RESEND_API_KEY && env.AUTH_SENDER_EMAIL && env.AUTH_SENDER_NAME) {
  Object.assign(settings, {
    smtp_host: 'smtp.resend.com',
    smtp_port: '465',
    smtp_user: 'resend',
    smtp_pass: env.RESEND_API_KEY,
    smtp_admin_email: env.AUTH_SENDER_EMAIL,
    smtp_sender_name: env.AUTH_SENDER_NAME,
    mailer_subjects_invite: 'You have been invited to Mash Events admin',
    mailer_templates_invite_content: linkButton(
      'You have been invited',
      'You have been invited to the Mash Events admin console.',
      'Accept the invitation',
      'invite'
    ),
    mailer_subjects_recovery: 'Reset your Mash Events password',
    mailer_templates_recovery_content: linkButton(
      'Reset your password',
      'We received a request to reset your Mash Events admin password.',
      'Reset my password',
      'recovery'
    ),
  });
  groups.push('smtp + email templates');
}

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  Object.assign(settings, {
    external_google_enabled: true,
    external_google_client_id: env.GOOGLE_CLIENT_ID,
    external_google_secret: env.GOOGLE_CLIENT_SECRET,
  });
  groups.push('google sign-in');
}

if (env.TURNSTILE_SECRET_KEY) {
  Object.assign(settings, {
    security_captcha_enabled: true,
    security_captcha_provider: 'turnstile',
    security_captcha_secret: env.TURNSTILE_SECRET_KEY,
  });
  groups.push('captcha');
}

console.log(`Project ${ref} · groups: ${groups.join(', ')}`);
for (const [key, value] of Object.entries(settings)) {
  const shown = secretKeys.has(key)
    ? '(secret)'
    : typeof value === 'string' && value.length > 70
      ? `${value.slice(0, 70)}…`
      : JSON.stringify(value);
  console.log(`  ${key.padEnd(40)} ${shown}`);
}

if (!apply) {
  console.log('\nDry run. Re-run with --apply to change these settings.');
  process.exit(0);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/config/auth`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  }
);
if (!res.ok) {
  console.error(
    `Failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`
  );
  process.exit(1);
}
console.log('\nApplied.');
