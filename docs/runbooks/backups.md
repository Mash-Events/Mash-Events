# Backups (Supabase Free plan)

The Free plan has no downloadable backups or point-in-time recovery, so a
nightly job takes an encrypted dump (`docs/system-design.md` §13). It runs in a
**private** ops repository, never in this public one, because its logs and
artifacts concern production data.

## Setup

1. Create a private repo, e.g. `Mash-Events/ops`.
2. Create an `age` key pair on a trusted machine: `age-keygen -o mash-backup.key`.
   Keep the private key offline (password manager); only the public key goes
   to GitHub.
3. Create a private Cloudflare R2 bucket (or any S3-compatible bucket) with a
   14-day lifecycle rule.
4. Add repo secrets: `SUPABASE_DB_URL` (Session pooler connection string with
   password), `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
5. Add the workflow below as `.github/workflows/backup.yml`.

```yaml
name: Nightly backup
on:
  schedule:
    - cron: '30 20 * * *' # 02:00 IST
  workflow_dispatch:
permissions:
  contents: read
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install tools
        run: |
          sudo apt-get update -y && sudo apt-get install -y age postgresql-client-17 || sudo apt-get install -y age postgresql-client
      - name: Dump, encrypt, upload
        env:
          DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          AGE_PUBLIC_KEY: ${{ secrets.AGE_PUBLIC_KEY }}
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          set -euo pipefail
          stamp=$(date -u +%Y-%m-%dT%H%M)
          pg_dump "$DB_URL" --no-owner --no-privileges \
            --schema=public --schema=app --schema=auth --schema=storage \
            | gzip | age -r "$AGE_PUBLIC_KEY" > "mash-$stamp.sql.gz.age"
          aws s3 cp "mash-$stamp.sql.gz.age" \
            "s3://${{ secrets.R2_BUCKET }}/db/mash-$stamp.sql.gz.age" \
            --endpoint-url "https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com"
          rm -f "mash-$stamp.sql.gz.age"
```

## Restore drill (monthly, and before a large event)

Download the latest file, `age -d -i mash-backup.key file | gunzip >
dump.sql`, restore into the **staging** project, and check row counts for
`events`, `registrations` and `message_job_items`. Never restore into
production without a written plan.

Upgrading to Supabase Pro adds managed daily backups (and optional PITR); keep
this job anyway as an off-platform copy.
