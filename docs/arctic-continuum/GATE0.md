# Arctic Continuum v2.0 — Gate 0 engineering handoff

Status: **OPEN / release blocked**. This is the discovery branch, not a completed redesign.
Design authority: user-supplied AUREKA Arctic Continuum — Definitive Product Design & Engineering Specification v2.0, 27 November 2026 (chapters 02, 09–10 and 12; screens S001–S145). Preserve existing domain logic and server-side authorization. Do not treat mockups as proof of functionality.

## Pinned baseline
- main: ca6349f92028de3c89b04973f515236ee34d98c8
- tree: b2f83a98ada62948b66bf34c770aeaf23aea4be9
- Complete blob inventory: `baseline-tree.json` (755 tracked blobs).
- Existing baseline CI: https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/45979040753 ; existing Pages run: https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/45979040818 . These runs predate this branch.
- Reuse `docs/uiux-audit/BASELINE.md`, `CSS_OWNERSHIP.md`, `ROUTE_ROLE_MATRIX.json`, `ISSUE_REGISTER.json` as historical inputs, not current runtime proof.
- Reuse `scripts/audit-supabase-migration-ledger.mjs`, `scripts/check-workspace-ui.mjs`, `scripts/run-browser-smoke.sh`, existing CI and preview artifact.
- Current external execution could not resolve github.com from the local container; connector tree/source and read-only metadata were accessible. Full checkout/build in that container is not verified.
- No production schema, data, RLS, permissions, formula, application source, or workflow changed by this discovery handoff.

## Architecture decisions for later phases
1. One repository, isolated feature branch, isolated synthetic backend. Never use production as test sandbox. Preserve current shell as a reversible fallback until parity is proven.
2. Existing AGENTS.md / DESIGN.md describe the legacy sidebar/dock. The v2.0 master defines the target category bar, mega menu, no permanent sidebar/dock. Reconcile the target policy during P1, not by erasing legacy baseline behavior/tests. Do not add a competing terminal CSS override.
3. Canonical registry and hash aliases remain authoritative for actual navigation. Preserve eight categories, shared module ownership, NARA global access and Dashboard-integrated insights. Resolve Realcost role exception and shared staff/quality/analytics sections against actual server guards.
4. Pilot register incidents and quality result analytics separately after P0. Do not change domain formulas or authorized PDF/Excel/QR flows. No artificial rows or fake buttons.
5. No auto-merge or production deployment. PR remains draft until gates and domain review are satisfied.

## Open blockers and required evidence
| ID | Finding | Closure evidence |
| --- | --- | --- |
| B01 | Migration ledger drift: 221 repo files vs 227 live ledger entries; previous audit counts 90 exact, 90 same-name candidates, 2 same-version name conflicts, 2 ambiguous ledger entries, 43 live-only, 39 repo-only. Counts are not SQL equality. | Export fresh metadata-only ledger privately, run existing checker, compare effective SQL, grants, policy and constraints on isolated staging. Never replay migrations or edit ledger just to match. |
| B02 | GeneralSettings calls aureka_admin_set_user_identity; prior catalog query did not find it. | Verify signature, grants, intended implementation and authorized synthetic account test. No production mutation. |
| B03 | Two latest atomic clinical/Realcost RPCs present in prior catalog, but migration names absent in ledger. | Compare deployed definitions and staging behavior; do not blindly reapply. |
| B04 | No isolated Supabase staging project was visible in previous discovery. | Establish isolated local/staging environment; verify endpoint before every test. No production credentials or patient data in fixtures, artifacts, or public repository. |
| B05 | Static manifest and existing CI do not prove full runtime coverage. | Complete per-operation traceability, role × unit × action × object tests, baseline browser captures, golden formula/export/import fixtures. |
| B06 | Legacy CSS/navigation and tests encode old layout. | Inventory current cascade, identify winning selectors, record baseline responsive and dark screenshots. Migrate tests only with proven equivalent contracts. |

## Gate sequence (v2.0)
P0 discovery → P1 foundation → P2 spatial shell → P3 data grid and analytics pilot → P4 domain slices → P5 cross-module → P6 public/accessibility/performance → P7 release. No phase skips.

Required evidence T01–T17: auth, routing, role/scope, grid, clinical calculations, import, export/QR, workflow, NARA/skills, public privacy, responsive, theme/preferences, accessibility, performance, recovery, visual regression, deployment. Evidence must identify commit, fixture, role/scope, expected/actual, command exit code and reviewer. Not run ≠ pass.

## Reproduce static discovery
Run `node scripts/arctic-continuum-discovery.mjs > /tmp/arctic-discovery.json` in a complete checkout. It produces candidate source references with line numbers, not authorization proof or a complete AST/call graph. Resolve dynamic references manually and supplement with runtime evidence. Use existing CI `npm ci`, `npm test`, `npm run build` and isolated Chromium smoke. Existing preview-build uses a disabled endpoint; an artifact is not a staging database.

Keep all synthetic datasets free of PHI, identifiers, secrets, and actual signature assets. Store sensitive detailed database evidence privately, not in this public repo.
