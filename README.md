# AUREKA — Hospital Quality Intelligence

AUREKA is being rebuilt from a clean baseline. Legacy business logic and legacy data bindings are not part of the new baseline.

## Architecture

```text
GitHub → Vercel → Supabase
```

## Modules

- 0. Overview
- 1. Indikator Mutu
- 2. Keselamatan Pasien
- 3. Manajemen Risiko
- 4. Metadata dan Statistik
- 5. Pengaturan

Each module is scaffolded first. Workflow, data model, RLS, UI, services, analytics, and tests will be designed and implemented module-by-module.

## Development principle

`main` is the stable baseline. Module branches are isolated development lines and should be merged only after review and verification.
