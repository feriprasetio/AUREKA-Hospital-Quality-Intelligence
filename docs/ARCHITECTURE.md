# AUREKA Architecture Baseline

## Modules

- 0. Overview (deferred)
- 1. Indikator Mutu
- 2. Keselamatan Pasien
- 3. Manajemen Risiko
- 4. Metadata & Statistik
- 5. Pengaturan

## Supabase strategy

AUREKA uses one Supabase production project without paid Database Branching.
Module isolation is implemented logically through PostgreSQL schemas and application/module boundaries.

Planned schemas:

- `aureka_quality`
- `aureka_patient_safety`
- `aureka_risk`
- `aureka_analytics`
- `aureka_system`

`public.master_rooms` is the canonical room/unit master data.

## Git strategy

`main` is the stable integration baseline. Module development branches:

- `module/quality-indicators`
- `module/patient-safety`
- `module/risk-management`
- `module/metadata-statistics`
- `module/settings`

Overview remains deferred and will be introduced after the module architecture is stable.
