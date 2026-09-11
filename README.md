# AUREKA — Hospital Quality Intelligence

Clean rebuild baseline.

## Core stack

- GitHub — source code and version control
- Vercel — hosting and deployment
- Supabase — PostgreSQL, Authentication, Storage, and Realtime

## Supabase

Project: `ktukmjscopggkzrkgnzp`

Region: `ap-southeast-1`

The database is intentionally designed as one production project with logical module schemas rather than paid database branches.

## Modules

0. Overview  
1. Indikator Mutu  
2. Keselamatan Pasien  
3. Manajemen Risiko  
4. Metadata dan Statistik  
5. Pengaturan

Business logic, data models, RLS, services, analytics, and tests will be built module-by-module after design review.

## Development flow

`GitHub module branch → Vercel Preview → testing → main → Production`

Never commit a Supabase service-role/secret key. Frontend code uses the publishable key only.
