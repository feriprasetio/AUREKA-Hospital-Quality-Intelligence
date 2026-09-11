# AUREKA Supabase configuration

Clean rebuild baseline for AUREKA — Hospital Quality Intelligence.

## Production project

Project ref: `ktukmjscopggkzrkgnzp`
Region: `ap-southeast-1`

## GitHub integration

Connect this repository from Supabase Project Settings → Integrations → GitHub. Set the repository to `feriprasetio/AUREKA-Hospital-Quality-Intelligence`, working directory to `.`, and use `main` as the production branch. Supabase GitHub integration can deploy database migrations from `supabase/migrations` on all plans without database branching.

## Storage

Private buckets declared in `supabase/config.toml`:

- `aureka-documents` — operational documents for quality, patient safety, risk, and system documentation.
- `aureka-exports` — generated XLSX/CSV/PDF exports.

Recommended folder prefixes:
- `quality/`
- `patient-safety/`
- `risk-management/`
- `settings/`
- `analytics/`

File-level RLS policies will be tightened when module authorization and user-room permissions are implemented.
