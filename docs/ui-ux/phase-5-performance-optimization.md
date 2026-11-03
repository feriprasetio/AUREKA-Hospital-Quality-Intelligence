# AUREKA UI/UX — Phase 5: Performance Optimization

**Status:** Implemented on `feat/ui-ux-redesign`; automated CI passed on 3 November 2026.  
**CI run:** [41568195442](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41568195442)  
**Implementation SHA:** `1d71449735fccde6255e99a3b4282a6c2d0aaf32`  
**Baseline:** Phase 4 artifact from CI run `41563154832`, implementation SHA `771b9e8b4eb653b45618b92a2f0dc606429ec713`.

## 1. Objective

Reduce the JavaScript required by the static landing route and load operational workspaces, tabs, editors, and import dialogs only when the user navigates to or invokes them.

The optimization is progressive and presentation/runtime-only. It does not change data fetching contracts, calculation engines, write operations, authorization, or persisted data.

## 2. Implementation

### Route-level workspace splitting — `components/HomeClient.tsx`

Converted eager workspace imports into `next/dynamic` imports with `ssr: false` and compact loading states:
- Audit Indikator Mutu;
- Hasil Capaian Mutu;
- Clinical Pathway;
- Keselamatan Pasien;
- Manajemen Risiko;
- Quality Hub;
- Administrasi;
- Ringkasan Rumah Sakit;
- Analitik & Laporan;
- Tenaga Klinis.

The Command Palette is also loaded dynamically after the authenticated workspace shell is rendered rather than being included in the initial public landing JavaScript.

The same component props, module handlers, route/hash behavior, session restoration, and authorization-derived navigation remain in place.

### Workforce sub-area splitting — `components/ClinicalWorkforceWorkspace.tsx`

Directory, Team & Assignment, and OPPE are separate dynamic imports. Only the sub-area selected by the existing role-aware tab is loaded.

Existing role predicates `isSuperAdmin`, `canOpenTeam`, and `canOpenOppe` remain unchanged.

### FPPE splitting — `components/OppeAuditWorkspace.tsx`

FPPE is dynamically imported only when the existing OPPE screen changes to `fppe`. OPPE calculation and the existing `lib/aureka/oppe-engine` import remain untouched.

### Quality sub-workspace and Excel import splitting — `components/QualityIndicatorWorkspace.tsx`

- Clinical Death Audit is a separate dynamic import, loaded only when the selected audit container is Audit Klinis dan Kematian.
- All 13 unit-specific Excel import dialogs are dynamic imports.
- A typed `ImportDialogKey` set records which dialog has been requested.
- Each dialog chunk is first requested when the existing upload action is clicked for that unit.
- After first use, the dialog remains mounted when closed, preserving its internal import state during the current workspace session. Its existing `open`, `onClose`, `authorized`, `profiles`, `layout`, and `onImported` props remain intact.

The original mapping between room IDs and unit-specific import dialogs is unchanged.

### Analytics tab splitting — `components/MetadataStatisticsWorkspace.tsx`

Quality Settings, Staff Directory, and Statistics are separate dynamic imports. The wrapper still selects the same tab and retains existing authorization checks.

## 3. Measured output comparison

Both measurements were taken from the actual GitHub Actions static-export ZIP artifacts, not from an estimated source-code size.

| Metric | Phase 4 baseline | Phase 5 | Change |
|---|---:|---:|---:|
| Root `index.html` JavaScript references, uncompressed | 1,847,049 bytes | 822,005 bytes | **−55.5%** |
| Same referenced JS, local gzip estimate | 480,199 bytes | 245,227 bytes | **−48.9%** |
| Complete static-export ZIP | 882,050 bytes | 980,573 bytes | **+11.2%** |
| Files in static-export ZIP | 33 | 69 | +36 |

### Interpretation

The initial route references substantially less JavaScript because workspace and dialog code is now placed in separate chunks. The complete static-export archive is larger because it contains additional independently loadable chunks and their metadata. This is expected for code splitting and is not a claim that total feature code was removed.

The gzip numbers are reproducible local compression estimates (gzip level 9) of the referenced JavaScript files; they are not a measurement of the actual hosting CDN response headers or browser transfer logs.

The measurement does not yet establish end-user interaction latency or Core Web Vitals. Those require a deployed preview/staging site and browser measurements.

## 4. Regression coverage

Added `tests/workspace-performance.test.mjs` for:
- route-level workspace dynamic imports and removal of eager workspace imports;
- role-aware staff sub-area lazy loading;
- FPPE and Clinical Death Audit separation;
- all 13 Excel dialog dynamic imports;
- retention of import dialog instances after first use;
- independent analytics tab loading;
- retention of static export configuration and absence of added bundle-analysis dependency.

Existing unit and data validation suites continue to run.

## 5. CI verification

GitHub Actions run [`41568195442`](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41568195442) completed successfully for SHA `1d71449735fccde6255e99a3b4282a6c2d0aaf32`.

| Automated check | Result |
|---|---|
| Unit and regression tests | **177 passed, 0 failed** |
| AUREKA data/layout validation | **Passed — 35 layouts, 35 unique units, 0 local fixture profiles** |
| TypeScript `tsc --noEmit` | **Passed** |
| Next.js production static build | **Passed** |
| Static export artifact | **Generated successfully** |

Artifact: `aureka-static-export` (980,573 bytes).

## 6. Scope intentionally not changed

### Business logic and data integrity

No changes were made to:
- `lib/aureka/indicator-engine.ts`;
- `lib/aureka/oppe-engine.ts`;
- `lib/aureka/quality-results-engine.ts`;
- risk scoring, patient-safety, or Clinical Pathway calculation logic;
- Supabase clients, queries, mutation payloads, RPCs, RLS policies, SQL migrations, Auth, or Storage;
- workbook parsing, normalization, import mapping, or export schemas.

Existing Supabase requests remain in their current client-side workspaces. No background prefetch of protected patient or incident data was introduced.

### Server Components / server-side fetching

The current application uses `output: 'export'` and a browser Supabase session. Moving authenticated, user-scoped data fetching to a server runtime would require an architectural change to hosting, session propagation, and RLS-aware server execution. That is intentionally deferred rather than partially implemented in this performance phase.

### Dependencies and deployment

No new package was added. No merge to `main` or production deployment was performed.

## 7. Manual verification still required

Before full acceptance:
- open each role-appropriate workspace and confirm lazy loading completes;
- confirm loading feedback does not obscure or shift the forms unexpectedly;
- exercise all 13 unit-specific workbook import dialogs, including close/reopen and failed import;
- verify draft workbook selections and validation messages persist while a dialog is closed/reopened within the same mounted workspace;
- verify Clinical Death Audit, FPPE, and analytics tabs still receive the same props and show the expected data;
- test browser back/forward, direct hash navigation, and repeated workspace switching;
- inspect browser network waterfall and console on 1366 px, 1024 px, 390 px, and 375 px;
- measure real LCP, INP, CLS, and route/chunk transfer in a preview/staging deployment.

Use non-production test accounts and copies of approved test workbooks. Do not use production clinical or patient-safety records for performance testing.

## 8. Release decision

Automated acceptance passed, and static-root JavaScript references were materially reduced. Manual browser/network validation remains open. Do not merge to `main` or deploy production until manual tests are reviewed and the separate independent Supabase Database/Auth/Storage backup prerequisite is verified.
