# AUREKA — Hospital Quality Intelligence

AUREKA is being rebuilt from a clean baseline. No legacy module business logic is carried forward.

## Architecture

```text
GitHub → Vercel → Supabase
```

### Application modules

- 0. Overview
- 1. Indikator Mutu
- 2. Keselamatan Pasien
- 3. Manajemen Risiko
- 4. Metadata dan Statistik
- 5. Pengaturan

Each module is intentionally scaffolded first. Workflow, data model, RLS, UI, services, and analytics will be designed and implemented module-by-module.

## Development principle

`main` is the stable baseline. Module branches are used for isolated development and are merged only after review and verification.

No production Supabase schema, credentials, or legacy integration is assumed by the clean baseline.
