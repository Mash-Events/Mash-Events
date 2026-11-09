# Supabase Auth settings (production project)

Applied through the Supabase Management API (`PATCH /v1/projects/{ref}/config/auth`).
See `docs/system-design.md` §6.

## Applied (2026-11-09)

| Setting                                 | Value                                         |
| --------------------------------------- | --------------------------------------------- |
| Allow new users to sign up              | off (`disable_signup: true`)                  |
| Email/password provider                 | on                                            |
| Phone provider, anonymous sign-ins      | off                                           |
| TOTP MFA (enrol + verify)               | on; phone MFA off                             |
| Minimum password length                 | 12                                            |
| Required characters                     | lower, upper, digit, symbol                   |
| Access token (JWT) expiry               | 600 s                                         |
| Refresh token rotation / reuse interval | on / 10 s                                     |
| Secure email change                     | on                                            |
| JWT signing keys                        | asymmetric (ES256), so `getClaims()` is local |
| Site URL                                | `http://admin.localhost:3000` (until domain)  |
| Redirect allow list                     | `http://admin.localhost:3000/auth/**`         |

The security advisor's two remaining warnings are expected: `grant_membership`
and `revoke_membership` are callable by signed-in users by design and check for
a super admin inside.

## Still to do

1. **Custom SMTP (Resend)** once the domain is bought. The Free plan only
   allows custom email templates with custom SMTP, and the default sender is
   heavily rate-limited. Then set the invite and recovery templates to link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (and
   `type=recovery`). Until then, invite and reset emails use Supabase's default
   link, which the POST-confirm page does not handle.
2. **Google sign-in:** create an OAuth client in the Mash Google Cloud project
   (authorised redirect URI: the project's `/auth/v1/callback`), then set
   `external_google_enabled`, `external_google_client_id` and
   `external_google_secret`.
3. **Domain:** add `https://admin.<domain>` as site URL and to the allow list.
4. **CAPTCHA:** turn on Turnstile (`security_captcha_enabled`) once the
   Turnstile keys exist; the sign-in and reset actions already pass the token.
5. **First super admin:** until SMTP works, create the user in the dashboard
   (Authentication → Users → Add user, auto-confirm, set a password), then run
   `select app.bootstrap_super_admin('<user uuid>');` in the SQL editor.
