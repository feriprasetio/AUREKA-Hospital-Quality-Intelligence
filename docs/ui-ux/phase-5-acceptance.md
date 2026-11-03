# AUREKA UI/UX — Phase 5 Acceptance Checklist

**Branch:** `feat/ui-ux-redesign`  
**CI run:** [41568195442](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41568195442)  
**Implementation SHA:** `1d71449735fccde6255e99a3b4282a6c2d0aaf32`  
**Status:** Automated CI and static artifact comparison passed; manual validation remains open.

## Automated acceptance — passed

- [x] 177 unit/regression tests passed; 0 failed.
- [x] 35 AUREKA layouts and 35 unique units passed validation.
- [x] TypeScript typecheck passed.
- [x] Next.js production static build passed.
- [x] Static export artifact generated (980,573 bytes).
- [x] Large route workspaces are dynamically imported.
- [x] Command Palette is not part of the initial eager import graph.
- [x] Workforce tabs load directory, team, and OPPE independently.
- [x] FPPE and Clinical Death Audit are split from their parent workspaces.
- [x] All 13 Excel import dialogs load on first use and remain mounted after first load.
- [x] Analytics metadata, staff, and statistics tabs load independently.
- [x] No new dependency or bundle analyzer added.
- [x] No domain engine, Supabase schema, RLS, RPC, Auth, Storage, or production data changed.
- [x] Main branch unchanged; no production deployment.

## Static bundle evidence — measured

- [x] Phase 4 baseline artifact inspected.
- [x] Phase 5 static-export artifact inspected.
- [x] Root `index.html` script-referenced JavaScript decreased from 1,847,049 to 822,005 bytes (−55.5% uncompressed).
- [x] Local gzip estimate for those scripts decreased from 480,199 to 245,227 bytes (−48.9%).
- [x] Complete archive size change recorded (+11.2%); additional lazy chunks are retained in the export rather than removed.

These are static artifact measurements, not real browser network or Core Web Vitals measurements.

## Manual module and data-state verification — pending

- [ ] ADMIN: open every major workspace and verify its initial/loading/ready state.
- [ ] PMKP and management roles: verify role-appropriate modules and tabs.
- [ ] PIC: verify its assigned-unit workflow and all applicable workbook imports.
- [ ] VALIDATOR: verify read-only audit and monthly validation paths.
- [ ] Clinical Pathway: open, edit, save, close, and reopen an audit.
- [ ] Clinical Death Audit: open the separated workspace and review existing records.
- [ ] Patient Safety: load IKP and investigation lists; confirm no data regression.
- [ ] Risk Management: load risk register, RTP, FMEA, and connectors.
- [ ] OPPE: load OPPE rules/assessments and open FPPE on demand.
- [ ] Analytics: switch metadata, staff, and statistics tabs repeatedly.

## Workbook import regression — pending

- [ ] Test each of the 13 unit-specific import dialogs with approved non-production test workbooks.
- [ ] Verify first-open loading feedback.
- [ ] Close and reopen each dialog without navigating away from the mounted workspace; confirm intended dialog state persists.
- [ ] Verify validation errors and duplicate-row handling are unchanged.
- [ ] Verify a failed import does not clear or overwrite source data.
- [ ] Verify successful import still triggers the existing workspace reload.
- [ ] Confirm authorization rules for each room/role remain in force.

## Browser performance and responsive checks — pending

- [ ] Browser DevTools network waterfall on initial public landing load.
- [ ] Confirm unused workspaces are not transferred before selection.
- [ ] Confirm only the selected Excel dialog chunk loads when requested.
- [ ] Confirm chunks are reused after first load/navigation.
- [ ] 1366 px and 1024 px desktop.
- [ ] 390 px and 375 px mobile.
- [ ] No console errors, hydration errors, React warnings, or unexpected layout shifts.
- [ ] Measure LCP, INP, and CLS in a preview/staging deployment and compare against Phase 4 baseline.

## Data protection and release gate

- [x] No modification to domain engines or clinical calculations.
- [x] No database/schema/RLS/RPC/Edge Function/Auth/Storage changes.
- [x] No new npm dependency.
- [x] No main merge or production deployment.
- [ ] Manual role, workbook import, and browser/network evidence reviewed.
- [ ] Full Supabase Database/Auth/Storage backup independently verified.

**Release decision:** Automated acceptance and static bundle comparison passed. Full production acceptance remains pending manual module/import/browser validation and the separate Supabase backup prerequisite.
