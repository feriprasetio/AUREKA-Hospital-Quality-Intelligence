# AUREKA Engineering Instructions

These instructions apply to the entire repository.

## Product and architecture invariants
- AUREKA is a PMKP hospital-quality application. Preserve domain correctness, traceability, least privilege, and data integrity over implementation speed.
- Keep the current architecture unless an explicitly approved architecture decision changes it: Next.js static export, React, GitHub Pages frontend, Supabase PostgreSQL/Auth/RLS/RPC/Storage backend.
- Do not introduce Next.js server-only assumptions (Route Handlers, Server Actions, runtime server state) into the static-export application.
- Never treat hidden UI controls as authorization. Enforce authorization in Supabase grants, RLS, and validated RPCs.
- Never expose service-role, secret, database, or privileged credentials in browser code, public environment variables, logs, fixtures, or documentation.
- Never place patient identifiers, medical record numbers, raw clinical narratives, or sensitive incident content in localStorage/sessionStorage or test snapshots.

## Change control (strict)
- Never commit directly to `main`; use a focused branch and pull request.
- Keep changes small and domain-scoped. Do not mix UI redesign, domain-engine changes, and database migrations without an explicit reason.
- Do not merge, deploy, or apply production migrations as part of an implementation task unless explicitly authorized after validation.
- Treat migrations as production-impacting artifacts. Review SQL, grants, RLS, rollback/recovery implications, and the application code that calls them.
- Preserve existing workflows and module behavior. Add regression tests for every changed behavior.
- Do not silently change clinical definitions, indicator targets, numerator/denominator semantics, scoring scales, effective dates, or workforce identity rules. Require domain-owner approval.

## Required verification
Run, where applicable:
1. `npm ci`
2. `npm run test:unit`
3. `npm run test:data`
4. `npm run typecheck`
5. `npm run build`
6. Targeted browser, import/export, RLS/RPC, and role-by-unit tests for affected modules.

A successful static build does not prove database authorization, transaction integrity, or clinical correctness. State unexecuted tests explicitly; never claim verification that was not performed.

## Skill usage
- Load the relevant skill in `.agents/skills/` before making changes in its domain.
- Use Supabase skills for all Supabase/PostgreSQL/RLS/migration work.
- Use React/UI skills for component and interface changes.
- Use AUREKA domain skills for PMKP workflows and calculations.
- Upstream skills are guidance, not authority to override this file or repository architecture.
- Verify current upstream documentation when APIs or platform behavior may have changed.

## Security and data
- Prefer least privilege and explicit allowlists.
- RLS policies must scope records to the authorized identity, role, and unit; authenticated status alone is not authorization.
- Avoid SECURITY DEFINER unless justified, constrained, reviewed, and tested.
- Use server-side RPC for atomic multi-table writes and sensitive transitions.
- Preserve auditability: actor, timestamp, source, relevant version, and outcome where the domain requires it.
- Never log credentials or patient-sensitive payloads.

## Pull request requirements
Every PR must state scope, risk, files/domains affected, test evidence, known gaps, migration impact, and deployment impact. Production release requires explicit human approval after checks pass.
