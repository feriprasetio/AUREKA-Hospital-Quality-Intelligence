# AUREKA Clean Rebuild Architecture

AUREKA is being rebuilt from a clean baseline.

## Layers

- GitHub: source control and isolated module development
- Vercel: application hosting and deployment
- Supabase: backend database, authentication, storage, and realtime as required

## Modules

0. Overview
1. Indikator Mutu
2. Keselamatan Pasien
3. Manajemen Risiko
4. Metadata dan Statistik
5. Pengaturan

## Rule

Do not add business logic, database tables, or cross-module dependencies until the corresponding module has been designed and reviewed.
