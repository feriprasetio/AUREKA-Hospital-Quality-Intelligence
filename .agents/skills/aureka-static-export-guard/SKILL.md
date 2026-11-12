---
name: aureka-static-export-guard
description: Use when changing routing, data fetching, authentication, environment configuration, deployment, or Next.js features in AUREKA. Prevents incompatible server-runtime assumptions in its GitHub Pages static-export architecture.
---

# AUREKA Static Export Guard

- Read `next.config.mjs` and `docs/ARCHITECTURE.md` before proposing architecture changes.
- Preserve `output: 'export'`, repository `basePath`, and GitHub Pages deployment unless a separately approved architecture decision authorizes a change.
- Do not introduce server-only Next.js Route Handlers, Server Actions, middleware-dependent authorization, ISR, or server runtime state as required application functionality.
- Treat browser code as public. Any `NEXT_PUBLIC_*` variable is shipped to the client.
- Supabase is the authority for authentication, authorization, RLS, RPC, and persistence.
- Use only publishable/legacy anon credentials in browser code; never service-role or secret credentials.
- Do not use localStorage as a durable source of truth for clinical, patient, workforce, or incident records.
- Validate preview builds against an isolated staging Supabase project. Never point preview to production.
- A static build proves only that export compilation succeeded. It does not prove RLS, RPC grants, role/unit isolation, or data correctness.
- Keep production deployment isolated to the existing protected release path; preview artifacts must never deploy to Pages production.
