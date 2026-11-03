# AUREKA UI/UX — Phase 3 Acceptance Checklist

**Implementation branch:** `feat/ui-ux-redesign`  
**CI run:** [41561367095](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41561367095)  
**Status:** Automated CI passed; manual verification remains open.

## Automated acceptance — passed

- [x] 165 unit/regression tests passed; 0 failed.
- [x] 35 AUREKA layouts and 35 unique units passed data validation.
- [x] TypeScript typecheck passed.
- [x] Next.js static production build passed.
- [x] Static export artifact generated (878,058 bytes).
- [x] Shared error normalizer added and unit-tested.
- [x] Reusable loading/empty/error component added and statically checked.
- [x] Legacy notification safety filter tested.
- [x] Chat Super Admin and public metrics integrated with explicit async states/retry.
- [x] Error rendering normalized in the principal operational workspaces.
- [x] Main branch remains unchanged.

## Functional validation — manual, non-production only

- [ ] Simulate network failure while reading a workspace.
- [ ] Simulate expired/invalid session and verify re-login guidance.
- [ ] Use a test account with insufficient role/unit permissions; verify no service details leak.
- [ ] Test duplicate-record handling using isolated test data.
- [ ] Test an unavailable RPC/function using a preview-only schema or controlled mock.
- [ ] Verify that an unsuccessful write does not clear the form or overwrite existing data.
- [ ] Verify that a success message only appears after a confirmed successful operation.
- [ ] Verify Chat Super Admin loading, empty, retry, and message-load error states for ADMIN and PIC.
- [ ] Verify successful and failed chat send behavior.
- [ ] Verify public landing aggregate loading, privacy-threshold empty state, error, and retry.
- [ ] Verify legacy workspace notifications with SQL/schema/URL/UUID-like content are replaced by safe guidance.

## Browser and assistive technology validation — manual, pending

- [ ] Desktop widths 1366 px and 1024 px.
- [ ] Mobile widths 390 px and 375 px.
- [ ] Keyboard-only navigation through chat popover, retry buttons, and error controls.
- [ ] Visible focus state and focus order.
- [ ] NVDA with a supported Windows browser: loading, empty, alert, and status announcements.
- [ ] No console errors or React warnings during the tested paths.

## Data protection and release gate

- [x] No database/schema/RLS/RPC/Edge Function/Auth/Storage changes in this phase.
- [x] No data-engine or clinical calculation change.
- [x] No production deployment.
- [ ] Independent full database backup and Storage archive verified as a separate release prerequisite.
- [ ] Manual test evidence reviewed before merge/release.

**Release decision:** Automated acceptance passed. The phase is not fully accepted for production until manual testing and the independent Supabase backup prerequisite are complete.
