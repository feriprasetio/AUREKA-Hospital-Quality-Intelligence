# AUREKA — Hospital Quality Intelligence

Fondasi aplikasi AUREKA yang menghubungkan tiga lapisan utama:

- **GitHub** — source code dan version control
- **Vercel** — hosting dan deployment
- **Supabase** — PostgreSQL, Authentication, Storage, dan Realtime

## Supabase project

`fwgdbddrsstzjlyfeqzl`

## Environment variables

Set di Vercel dan `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://fwgdbddrsstzjlyfeqzl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Jangan pernah menaruh `service_role`/secret key di frontend atau repository.

## Development flow

`GitHub → Vercel Preview → testing → Production`

Database AUREKA akan dibangun setelah arsitektur data, RLS, dan modul inti disepakati sehingga tidak terjadi migrasi ulang yang tidak perlu.
