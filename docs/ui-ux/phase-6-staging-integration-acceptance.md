# AUREKA UI/UX — Phase 6: Staging and Integration Acceptance

**Branch:** `feat/ui-ux-redesign`  
**Scope:** deployment safety, environment separation, dependency audit, and manual release gate  
**Production deployment:** not performed  
**Main merge:** not performed

## 1. Hosting and preview status

The repository's `.github/workflows/preview-build.yml` builds feature branches and uploads a GitHub Actions artifact named `aureka-static-export`. It does not publish a browser-accessible preview URL.

The `.github/workflows/deploy-pages.yml` workflow is triggered by `main` pushes or manual dispatch and deploys to GitHub Pages. The Vercel project/deployment lookup for this repository returned no matching AUREKA project or deployment.

Therefore, the static build artifact must not be treated as a live staging environment. Browser-based acceptance, Web Vitals, and real authentication/session checks remain pending until an isolated staging deployment is available.

## 2. Supabase environment separation

The application client requires both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at build/runtime. The previous workflows did not pass these values to the static build, so a successful static export alone did not prove that the client was configured.

The workflows now map explicitly named GitHub Actions Variables or Secrets into the Next.js build environment:

### Preview / staging

Set these in the repository's GitHub Actions Variables or Secrets:

- `AUREKA_STAGING_SUPABASE_URL`
- `AUREKA_STAGING_SUPABASE_PUBLISHABLE_KEY`

These must point to an isolated non-production Supabase project, with synthetic or approved de-identified test data only. The workflow fails before building if either value is missing.

### Production Pages

Set these separately:

- `AUREKA_PRODUCTION_SUPABASE_URL`
- `AUREKA_PRODUCTION_SUPABASE_PUBLISHABLE_KEY`

The Pages workflow fails before building if either value is missing. These values are only consumed by a deployment workflow triggered from `main` or by manual dispatch.

Only a Supabase publishable key (or legacy anon key where required) is allowed in the public client. Never store or pass a `service_role` key or any Supabase secret key through a `NEXT_PUBLIC_*` variable.

## 3. Dependency audit status

Preview CI now uses `npm ci` and prints all dependency-audit findings with package, severity, range, fix status, and advisory metadata where available. Preview artifact generation is blocked by high or critical findings; moderate findings remain visible for triage.

The audit output inspected on 3 November 2026 reported four moderate package nodes and zero high/critical nodes:

- `archiver`
- `exceljs-hardened`
- `minimatch`
- `readdir-glob`

The identified `minimatch` advisory is GHSA-g3hv-75wg-m249, covering versions below 11.0.1. The installed lockfile resolves `minimatch` 10.2.6 and `readdir-glob` 3.0.0 declares `minimatch ^10.2.2`.

No forced major-version override was applied: the existing parent dependency range and consuming API must be compatibility-tested before upgrading across a major version. This audit result does not by itself establish exploitability through AUREKA's actual application paths.

The production Pages workflow now blocks on any moderate, high, or critical dependency-audit finding. This keeps a known moderate finding from passing into a future Pages release until it has been remediated or formally resolved and the lockfile is re-audited.

## 4. Automation executed

The hardened preview workflow uses:

- `npm ci` for lockfile-based, reproducible dependency installation;
- dependency audit output with severity-specific reporting;
- all existing unit/regression tests;
- AUREKA data/layout validation;
- TypeScript type checking;
- Next.js static export;
- artifact upload with seven-day retention.

The production Pages workflow uses the same reproducible install, the stricter dependency gate, and the explicit production Supabase configuration check before build/deploy.

The feature-branch CI run [41571392780](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41570910956) verified **185/185 tests passed**, the 35-layout/35-unit data validation passed, and TypeScript passed. The run then stopped at the intended staging configuration gate because the required staging URL/key were not configured; static build and artifact upload were skipped. This is an environment-configuration blocker, not a failing unit test or type check.

Eight additional tests in `tests/release-workflows.test.mjs` now protect the staging/production variable separation, lockfile install, audit thresholds, validation-before-build ordering, and restriction of manual Pages deployment to `main`.


## 5. Current Supabase staging and backup findings

Read-only project inventory on 3 November 2026 found:

- The AUREKA Supabase project is `ACTIVE_HEALTHY`.
- The linked Supabase organization is on the **Free** plan.
- No separate AUREKA staging project is listed.
- The organization has two active Free-plan Supabase projects, which already reaches the Free plan's stated two-active-project limit. Creating a third isolated project therefore needs a plan/capacity decision; pausing an existing hospital project is not an acceptable shortcut. Supabase also lists database branching as unavailable on the Free plan ([current Supabase pricing](https://supabase.com/pricing)).
- The only listed development branch is named `main`, has `MIGRATIONS_FAILED`, and reports `with_data: false`; it is not an acceptable staging target and was not reset, rebased, or otherwise modified.
- The preview workflow run for the feature branch stopped at the intended configuration guard because `AUREKA_STAGING_SUPABASE_URL` was not supplied. Tests, data validation, and TypeScript checks had already passed; the static build and artifact upload were skipped.

Supabase's current documentation states that automatic daily database backups are provided for Pro, Team, and Enterprise plans, while Free projects should perform manual exports with the Supabase CLI and keep off-site backups. Database backups do **not** include objects stored through the Storage API. See [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) and [Free Plan Backups FAQ](https://supabase.com/kb/faqs/platform/free-plan-backups).

No backup was initiated or verified from this environment. The available Supabase integration exposes project inventory and database/query operations but no backup listing/export or Storage object backup action. A successful database dump alone would still not prove that Storage objects and Auth recovery procedures are covered.

## 6. Manual integration acceptance — still open

Do not close these items based on CI alone:

- [ ] Provision and configure a dedicated staging Supabase environment and GitHub Actions staging variables.
- [ ] Obtain a browser-accessible staging URL without exposing production records.
- [ ] Browser console, hydration, and route/hash/back/forward checks.
- [ ] Network waterfall: unused workspaces are not fetched before navigation; the selected Excel dialog chunk is fetched on first use and reused afterward.
- [ ] Desktop viewports 1366 px and 1024 px.
- [ ] Mobile viewports 390 px and 375 px.
- [ ] Test each supported role: ADMIN, PMKP, management roles, PIC, and VALIDATOR.
- [ ] Test all 13 unit-specific Excel import dialogs using synthetic or approved de-identified workbooks.
- [ ] Verify validation failures, duplicate handling, close/reopen state, failed-import safety, and successful reload behavior.
- [ ] Verify Clinical Death Audit, FPPE, Analytics, Clinical Pathway, Patient Safety, and Risk Management workspaces with the same expected role/data scope.
- [ ] Measure LCP, INP, and CLS from a real browser session on staging.
- [ ] Independently verify Supabase Database, Auth, and Storage backup/restore readiness before production release.

Use no live patient identifiers, incident narratives, or production workbook records in preview testing.

## 7. Release decision

The branch contains deployment-safety hardening, but full staging/integration acceptance is not complete because no browser-accessible staging deployment and no independently verified Supabase backup were available during this validation. The latest preview build did not emit a deployable artifact because the dedicated staging Supabase values are not configured.

Do not merge to `main` or deploy production until:
1. Staging configuration is provided and isolated from production;
2. Browser, role, and workbook import tests pass;
3. The dependency findings are remediated and the production audit gate passes; and
4. Supabase backup and restore readiness is independently verified.
