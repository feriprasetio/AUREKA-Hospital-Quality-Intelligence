# AUREKA Engineering Foundation

## Approved direction
- Scope: integrated UI, domain engine, database, security, analytics, and quality assurance.
- Adoption: staged; install only maintained, relevant skills.
- Change control: strict; branch + pull request + automated validation + human review. No direct production changes.

## Repository baseline reviewed
- Frontend: Next.js 16.4.3 / React 19.2.0.
- Rendering/deployment: Next.js static export, GitHub Pages.
- Backend: Supabase Auth, PostgreSQL, RLS, RPC, Storage.
- Package lockfile exists; use `npm ci`.
- Existing scripts: `npm run test:unit`, `npm run test:data`, `npm run typecheck`, `npm run build`.
- Existing CI includes preview build, production Pages deploy, dependency lock validation, OPPE validation, and patient-safety validation.
- Existing test suite includes indicator, risk, OPPE, logbook, Excel import, navigation, accessibility, and workflow tests.

## Initial skill set
| Skill | Source | Use |
|---|---|---|
| `supabase` | Supabase official | Auth, RLS, RPC, migrations, storage, troubleshooting |
| `supabase-postgres-best-practices` | Supabase official | Schema, query performance, indexes, RLS, concurrency |
| `vercel-react-best-practices` | Vercel Engineering | React/Next performance and rendering |
| `web-design-guidelines` | Vercel Engineering | UI, accessibility, form and navigation review |
| `vercel-composition-patterns` | Vercel Engineering | Reusable component architecture |
| `aureka-domain-engineering` | AUREKA local | PMKP domain correctness and test criteria |
| `aureka-static-export-guard` | AUREKA local | Preserve static-export architecture |

Upstream skills are vendored as reference snapshots. Before relying on changing platform guidance, check the upstream repository and official documentation. Do not auto-update skills without review.

## Stage plan

### Phase 1 — Foundation (this PR)
- Establish repository-wide engineering instructions.
- Add selected upstream skill snapshots with attribution.
- Add AUREKA domain and static-export guard skills.
- Add a pull-request-only engineering validation workflow.
- No application source, database migration, production secret, or production deployment changes.

### Phase 2 — Quality assurance
- Add browser E2E tests for critical workflows: authentication, unit scoping, indicator entry/review, IKP, risk, OPPE/FPPE, workbook import/export.
- Add staging-only RLS/RPC matrix tests for role × unit × operation.
- Add migration review checks and schema drift review.
- Add test data factories with synthetic data only.

### Phase 3 — Domain hardening
- Review indicator calculation metadata and aggregation rules.
- Review atomicity and audit trails for multi-table writes.
- Review risk scoring and connector provenance.
- Review staff identity attribution and individual exports.
- Review large-data pagination and server-side aggregation.

### Phase 4 — Release governance
- Require PR checks and human approval before merge.
- Protect `main` and restrict production deployment.
- Keep preview environment isolated from production Supabase.
- Require explicit approval for production migrations and deployment.

## Release acceptance criteria
1. All applicable unit, data, type, build, and security checks pass.
2. No secrets or PHI appear in code, logs, fixtures, or artifacts.
3. Role/unit access matrix passes on isolated staging.
4. Critical user journeys pass browser E2E.
5. Domain owner approves indicator definitions, targets, scoring rules, and workflow semantics.
6. Migration review and rollback/recovery plan are complete where applicable.
7. Human reviewer approves the PR.
8. Only then may a separate, explicitly approved release merge to `main`.

## Current governance gap
At the time of review, GitHub reports `main` as unprotected. The connected GitHub integration could read repository metadata but could not read or modify branch protection settings (403). Therefore this PR can establish checks and written policy, but cannot itself enforce required reviews/status checks on `main`. A repository administrator must enable branch protection/rulesets in GitHub settings.
