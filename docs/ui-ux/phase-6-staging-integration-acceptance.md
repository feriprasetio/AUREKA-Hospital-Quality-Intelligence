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

The first Phase 6 audit on the pre-remediation checkpoint reported four moderate package findings (`archiver`, `exceljs-hardened`, `minimatch`, and `readdir-glob`) and no high or critical findings. That is historical evidence, not the current dependency state.

The transitive `minimatch` finding (GHSA-g3hv-75wg-m249; affected versions below 11.0.1) was remediated in commit `f50bfa63f8186f9f1b2a5e3c166ad162956378c3`. The root `package.json` override now resolves the full path `exceljs-hardened > archiver > readdir-glob > minimatch` to `minimatch@11.0.1`. The generated lockfile is checked into the feature branch.

The new `.github/workflows/dependency-lock-validation.yml` workflow re-resolves the lockfile, runs `npm ci`, checks every resolved `minimatch` instance, and blocks moderate, high, or critical findings. It also runs unit/compatibility tests, data validation, and TypeScript checks. Run [41581882752](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41581882752) recorded **0 critical, 0 high, 0 moderate, 0 low, and 0 informational vulnerabilities**. The dependency tree showed the patched version on the actual transitive path.

`tests/minimatch-compat.test.mjs` checks the `Minimatch` options used by `readdir-glob` and verifies workbook-file enumeration using synthetic files. The production Pages workflow continues to block any moderate-or-higher audit finding. The earlier four moderate findings are therefore considered resolved in the currently validated lockfile; the audit must be rerun whenever dependencies change.

## 4. Automation executed

The release workflows now use reproducible `npm ci` installation, explicit staging/production Supabase configuration, and severity-aware dependency gates. Preview builds block high/critical findings; the production Pages workflow blocks moderate/high/critical findings. The separate dependency-lock workflow blocks moderate-or-higher findings and is now guarded so it can run only on `feat/*` branches; this guard executes before checkout, preventing a manual dispatch on `main` from automatically writing a lockfile commit there.

Verified runs on 3 November 2026:

- [Dependency Lock Validation — 41581882752](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41581882752): patched `minimatch` path confirmed; **0 npm audit findings**; 187/187 tests passed; AUREKA data validation and TypeScript checks passed; the committed lockfile already matched the validated dependency tree.
- [AUREKA unit, data & build validation — 41582031875](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41582031875): **188/188 tests passed**, 35 layouts and 35 unique units validated, TypeScript passed, and the Next.js optimized build/static page generation completed successfully.
- [Preview Build Artifact — 41582027870](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41582027870): the 188 tests, data validation, and TypeScript checks passed. The run then stopped at the intended staging configuration gate because `AUREKA_STAGING_SUPABASE_URL` and `AUREKA_STAGING_SUPABASE_PUBLISHABLE_KEY` are not configured. Static artifact generation was skipped. This is an environment blocker, not a unit-test, data-validation, or type-check failure.

The test suite now also includes a regression test that ensures dependency-lock automation rejects non-feature refs before checkout. No production deployment, Supabase data mutation, or browser-based staging acceptance has been performed.

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

Pull request [#94 — Feat/UI ux redesign](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/pull/94) remains open and unmerged. At this checkpoint it contains 123 commits across 46 changed files (+3,730/-216) and is 0 commits behind `main`. The size of this change set means a green CI run should not be treated as a substitute for functional review or staged acceptance.

The dependency audit issue has been resolved and the automated unit/data/type/build checks now pass. Full staging/integration acceptance remains incomplete because no isolated browser-accessible staging environment is configured and Supabase backup/restore readiness has not been independently verified. The latest preview run therefore did not create a deployable artifact.

Do not merge to `main` or deploy production until:
1. A dedicated staging Supabase environment and the two staging Actions values are configured and verified as non-production;
2. A browser-accessible staging build is available and browser, role, route, and all 13 workbook-import acceptance checks pass;
3. Supabase Database, Auth, and Storage backup/restore readiness is independently verified; and
4. The full PR diff receives functional review, with no unintended changes to production data, permissions, or clinical workflows.

No production data was changed, no Supabase branch was reset or rebased, no backup was claimed or verified, and no merge/deploy was performed.
