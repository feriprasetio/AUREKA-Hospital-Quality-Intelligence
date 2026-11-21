# AUREKA UI/UX Cross-Viewport Audit — 21 November 2026

**Scope:** source-level inspection of the production Next.js/React repository, its shared dialog and responsive layout infrastructure, and representative clinical and administrative workspaces. This is **not** a claim of completed browser-device acceptance testing. No user or patient data was changed.

## Executive findings

| Priority | Evidence in repository | Impact | Action / status |
| --- | --- | --- | --- |
| P0 | `app/modal.css`: `.akModalRoot` used z-index 1000; `app/tanya-aureka.css`: NARA panel 1200; mobile drawer 1301 and navigation dropdown 1400; `app/aurora.css`: presentation root 2147483000 | Confirmation can appear **behind** the invoking surface and become unusable | **Fixed in this PR:** shared dialog uses documented topmost design token, above presentation as well as chat |
| P0/P1 | Floating NARA can remain open (`.tanyaFab.on`) while several module-specific blocking dialogs are visible | Form/modal can be obstructed or confusing | **Mitigated in this PR:** suspend floating panel/FAB during known blocking dialogs; complete modal standardization still pending |
| P1 | `components/NaraAIWorkspace.tsx`: delete action 30×30px, list entry 38px, desktop hover-dependent discoverability | Difficult to operate on touch, keyboard and hybrid tablets | **Fixed in this PR:** 44px targets, persistent delete affordance, explicit focus indication |
| P1 | NARA mobile history expanded without a height bound | Chat area can be pushed far below the fold | **Fixed in this PR:** bounded history with its own scroll area |
| P1 | Destructive `aurekaConfirm` placed autofocus on affirmative action | Accidental destructive action possible with keyboard | **Fixed in this PR:** initial focus on Cancel for destructive prompts |
| P1 | Multiple legacy and canonical navigation/layout stylesheets with `!important` selectors are loaded in order from `app/aureka-global.css` | High CSS-cascade coupling and cross-breakpoint regression risk | **Open:** consolidate incrementally into existing owners; never append generic overrides |
| P1 | Modal implementations vary across `PatientSafetyWorkspace`, `RiskManagementWorkspace`, `OppeAuditWorkspace`, `StaffDirectoryWorkspace`, `ClinicalPathwayWorkspace`, `SecretariatWorkspace` and shared `AurekaModal` | Inconsistent stacking, escape handling, scrolling, and focus management remain possible | **Open:** inventory each modal and migrate safely to shared portal + focus controller |
| P2 | Several shared chat/action controls were smaller than 44px; phone chat textarea was 14px | Target-size and mobile input-zoom concerns | **Improved in this PR:** modal and chat actions, phone textarea 16px |

## Source-level coverage and limitations

Reviewed the route/theme contract (`AGENTS.md`, `DESIGN.md`, `app/aureka-global.css`), 35 app stylesheets for declared layers, shared modal/confirm/focus helpers, NARA, adaptive shell and table viewport, and a representative set of 13 module workspaces. The repository contains more components than these inspected examples. Static inspection can identify conflicting CSS declarations and risky implementation patterns, but it **cannot verify** whether every screen has visual overlap at a particular viewport or browser zoom.

The theme remains **Arktik**, including user-selected light/dark modes. No new CSS override file has been introduced, and global import order was left unchanged.

## Cross-device acceptance matrix (required before release)

All entries below are **pending live-browser QA** unless marked by CI/static checks. Capture screenshots and actionable defects (route, user role, viewport, steps, expected/actual, browser/OS).

| Platform | Viewport sample | Mandatory checks |
| --- | --- | --- |
| Narrow phone | 320×568, 360×740 | Login, navigation drawer, NARA chat + delete confirmation, sticky header, error/success states, buttons and keyboard |
| Modern phone | 390×844, 430×932 | Portrait/landscape, overlay focus, virtual keyboard, sheet scrolling, no offscreen actions |
| Tablet | 768×1024, 820×1180, 1024×768 | Drawer/sidebar breakpoint, dense tables, subnavigation dropdown, split panes, touch targets |
| Desktop | 1280×800, 1440×900, 1920×1080 | Sticky navigation, module forms, nested dialogs, table width and floating NARA |
| Accessibility | 200% browser zoom, keyboard-only, reduced motion | Tab cycle, Escape, focus restore, reachable controls, contrast in light/dark |

### Critical workflows to replay for each relevant viewport

1. **NARA AI:** open existing conversation → delete → verify confirmation on top → cancel and retry → delete → verify history updates; repeat from floating NARA while another workspace is active.
2. **Quality Indicators:** blank master/profile → import `worksheet.xlsx` → verify mapping/status and any secondary dialogs; inspect charts, tables and empty/error states.
3. **Patient Registry and clinical services:** edit patient, view details, import per-unit worksheets, long descriptions, wide table and keyboard input.
4. **Patient Safety and Risk:** add/edit incident, risk/FMEA detail, validator actions and modal dismissal.
5. **OPPE, SPM, Clinical Pathway, Secretariat and Settings:** create/edit forms, download and import dialogs, select dropdowns, cancellation and confirmation.
6. **Presentation/fullscreen:** open/close presentation mode and any confirmation; ensure topmost shared modal is visible.
7. **Light and dark Arktik:** perform the above with both modes, long labels and real representative non-sensitive data.

## Engineering release gates

- Static regression: `tests/ui-overlay-nara-regression.test.mjs`.
- Existing test suites: `npm test`, then `npm run build`.
- Browser E2E + screenshot diffs must run before acceptance; the current repository unit tests are largely structural/static and **do not replace** real visual testing.
- Verify after deploy that the updated static GitHub Pages build is served; passing PR CI alone does not deploy to production.
- If a modal or navigation regression appears, revert this PR independently; no database migration is required.

## Recommended follow-up order

1. Perform the cross-viewport, cross-role browser QA above and open reproducible bugs with screenshots.
2. Standardize remaining custom modals onto a documented dialog-layer contract with portal, focus trap and body scroll lock.
3. Reduce overlapping navigation stylesheet ownership without changing `AGENTS.md` theme contract; preserve existing breakpoint regressions.
4. Add an actual browser automation layer for screenshot comparisons, horizontal overflow detection and modal keyboard checks in CI.
