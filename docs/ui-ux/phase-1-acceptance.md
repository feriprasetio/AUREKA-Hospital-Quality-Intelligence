# AUREKA UI/UX — Phase 1 Acceptance Checklist

**Branch:** `feat/ui-ux-redesign`  
**Status:** Automated CI passed on 3 November 2026; manual browser/accessibility testing remains pending

## Automated validation

- [x] Unit and regression tests pass.
- [x] AUREKA master/layout data validation passes.
- [x] TypeScript check passes.
- [x] Next.js static export build passes.
- [x] Preview artifact is generated.
- [x] Git diff contains only the approved Phase 1 files and documentation.
- [x] `main` remains unchanged.
- [x] No changes to `lib/aureka/*.ts`, SQL migrations, RPC, Edge Functions, or Supabase data.

Automated verification: GitHub Actions run `41557726436` completed successfully for commit `019e8e195e0caddcbd696dadb01367d5bd93b26c`. The preview artifact `aureka-static-export` was generated (870,515 bytes). This verifies tests, data validation, typecheck, and static export; it does not replace browser or screen-reader testing.

## Desktop and tablet

- [ ] At 1366 px, full sidebar, topbar, and module workspace render correctly.
- [ ] Desktop sidebar toggle is visible and keyboard accessible.
- [ ] Collapsed sidebar becomes an icon rail without shifting or clipping workspace content.
- [ ] Tooltips/accessible names identify navigation actions in the collapsed rail.
- [ ] At 1024 px and 768 px, sidebar and content remain usable without horizontal page overflow.
- [ ] Expanding/collapsing sidebar does not reset active module, nested selection, or user context.

## Mobile

- [ ] At 390 px and 375 px, menu trigger is at least 44 × 44 px.
- [ ] Tapping the trigger opens the drawer above the scrim.
- [ ] Drawer width remains within the viewport.
- [ ] Explicit close control is visible and at least 44 × 44 px.
- [ ] Escape closes the drawer.
- [ ] Scrim click closes the drawer.
- [ ] Focus moves into the drawer on open.
- [ ] Tab and Shift+Tab remain inside the open drawer.
- [ ] Closing the drawer restores focus to the trigger.
- [ ] Background body scrolling is locked while open and restored on close.
- [ ] Switching viewport from mobile to desktop closes the drawer and restores scrolling.
- [ ] Selecting a module without nested choices closes the drawer.
- [ ] Selecting a module with nested choices preserves the existing intended nested-menu flow.
- [ ] Selecting a nested child closes the drawer and renders the correct submodule.
- [ ] A desktop-collapsed sidebar always opens as a full-label drawer on mobile.
- [ ] Safe-area insets do not obscure the logo, close control, or bottom actions.

## Regression checks for existing AUREKA workflows

- [ ] Test role ADMIN, PMKP, PIC, VALIDATOR and relevant management roles.
- [ ] Confirm restricted modules remain restricted to the same roles and units.
- [ ] Confirm active module hash and browser Back/Forward behavior are unchanged.
- [ ] Confirm notification history, Super Admin chat, global search, profile, fullscreen, and logout controls remain usable.
- [ ] Confirm module workspace layout and operational forms are not clipped or covered by the new shell.
- [ ] Confirm no console errors or React warnings.

## Supabase and production

- [ ] No Supabase schema/data/Auth/Storage changes occurred.
- [ ] No production deployment occurred.
- [ ] Independent full database backup and Storage archive are still tracked as a separate prerequisite before merge/release.

## Release decision

Phase 1 is not considered fully accepted based on CI alone. Manual viewport and keyboard checks, role-based navigation regression checks, and review of the feature-branch diff are mandatory before Phase 2 or merge.
