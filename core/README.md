# core/

The shared engine: auth, event-scoped data access, registration, messaging
(email + WhatsApp), passes, check-in, admin, security and audit
(see `docs/system-design.md` §2.1).

Rules (lint-enforced):

- `core/` never imports from `sites/`.
- Only `core/db/privileged/` may create the Supabase service-role client.
- Every data function takes the event id as its first argument.

The engine code currently lives in `src/lib/` and `src/components/admin/` as
carried over from the seed codebase. Modules move here as each is
refactored to be event-scoped, in the order of design §16.5.
