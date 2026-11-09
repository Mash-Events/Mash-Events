# sites/

Custom-coded event websites, one folder per event: `sites/<org>/<event>/`
(see `docs/system-design.md` §2.1). There is no CMS; pages are code.

Rules (lint-enforced):

- A site imports from `core/` only, never from another site.
- A site never uses the Supabase service-role client; it reads data through
  core loaders.
- Every new org/event is added to `registry.ts` with the UUIDs from the
  `events` and `organizations` tables.
