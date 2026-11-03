# AUREKA UI/UX — Phase 4 Acceptance Checklist

**Branch:** `feat/ui-ux-redesign`  
**CI run:** [41563016184](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41563016184)  
**Implementation SHA:** `7c788b7a5bb6401e38d482655b64be024bd2cb23`  
**Status:** Automated CI passed; manual verification remains open.

## Automated acceptance — passed

- [x] 171 unit/regression tests passed; 0 failed.
- [x] 35 AUREKA layouts and 35 unique units passed validation.
- [x] TypeScript typecheck passed.
- [x] Next.js production static build passed.
- [x] Static export artifact generated (882,033 bytes).
- [x] Command Palette component created without new dependencies.
- [x] Ctrl+K and ⌘K global shortcut implemented.
- [x] Shared dialog focus management, Escape, focus trap, and restoration integrated.
- [x] Navigation commands generated from existing role-filtered module registry and sidebar children.
- [x] Active-workspace-only data search integrated with existing search event.
- [x] Quick export refuses to guess when zero or multiple export controls are available.
- [x] Unit quick action only focuses one uniquely identified existing unit filter.
- [x] Main branch unchanged; no production deployment.

## Manual keyboard and interaction validation — pending

- [ ] Ctrl+K opens the palette on Windows.
- [ ] ⌘K opens the palette on macOS.
- [ ] Arrow Up/Down changes the active option and keeps it visible.
- [ ] Enter executes the selected option.
- [ ] Escape closes the dialog.
- [ ] Tab and Shift+Tab remain within the dialog while it is open.
- [ ] Closing restores focus to the trigger or previously focused element.
- [ ] Pointer selection and click-outside close behave correctly.
- [ ] Screen reader announces the dialog name, search input, groups, options, and result count/state.

## Role and navigation regression — pending

- [ ] ADMIN sees only the modules/children available in the existing sidebar.
- [ ] PMKP sees only its existing authorized modules/children.
- [ ] MANAGEMENT, KABID, DIREKTUR, and DEWAN_PENGAWAS retain existing menu visibility.
- [ ] PIC and VALIDATOR do not receive management-only commands.
- [ ] Selecting a parent or nested child opens the same workspace as the sidebar.
- [ ] Browser hash, back/forward, and active workspace state remain unchanged.

## Data search privacy — pending

- [ ] Search patient-related text within the active authorized workspace.
- [ ] Search doctor/provider text within the active authorized workspace.
- [ ] Search indicator and record text within the active authorized workspace.
- [ ] Confirm no hidden, aria-hidden, stale, or other-module record is returned.
- [ ] Confirm palette search does not issue new cross-module Supabase queries or bypass RLS.

## Quick action safety — pending

- [ ] One visible export control invokes that existing control.
- [ ] Zero export controls produces an informational message and no action.
- [ ] Multiple export controls produce an ambiguity message and no automatic action.
- [ ] One uniquely identified unit select receives focus.
- [ ] Zero or multiple unit selectors do not trigger a guessed selection.
- [ ] Account primary unit, role, and authorization remain unchanged.

## Visual and responsive validation — pending

- [ ] 1366 px desktop layout.
- [ ] 1024 px tablet/small desktop layout.
- [ ] 390 px mobile layout.
- [ ] 375 px mobile layout.
- [ ] Command trigger remains at least 44 × 44 px.
- [ ] Dialog fits viewport and scrolls internally without hiding actions.
- [ ] No header overlap, horizontal page overflow, console error, or React warning.

## Data protection and release gate

- [x] No SQL migration, schema, RLS, RPC, Edge Function, Auth, or Storage change.
- [x] No domain engine, scoring, or clinical workflow change.
- [x] No new npm dependency.
- [x] No merge to `main` or production deployment.
- [ ] Full Supabase database/Auth/Storage backup independently verified.
- [ ] Manual role, browser, keyboard, and screen-reader evidence reviewed.

**Release decision:** Automated acceptance passed. Full operational acceptance and release remain blocked pending the manual checklist and independent Supabase backup.
