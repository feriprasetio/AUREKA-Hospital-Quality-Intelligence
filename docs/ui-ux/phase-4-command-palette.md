# AUREKA UI/UX — Phase 4: Command Palette

**Status:** Implemented on `feat/ui-ux-redesign`; automated CI passed on 3 November 2026.  
**CI run:** [41563016184](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41563016184)  
**Implementation SHA:** `7c788b7a5bb6401e38d482655b64be024bd2cb23`  
**Design baseline:** Solid Enterprise UI / progressive migration  
**Protected scope:** No new database query, authorization change, business-engine change, or production deployment.

## 1. Objective

Provide a keyboard-first entry point for AUREKA navigation, quick actions, and search of records already displayed in the user's active workspace.

The Command Palette is an additional interaction layer. Existing sidebar navigation and the existing module-local search field remain available.

## 2. Component

Added `components/CommandPalette.tsx`.

The component includes:
- a visible header trigger with a 44 × 44 px minimum touch target;
- global `Ctrl+K` and `⌘K` shortcuts;
- a labelled modal dialog using the shared `useAccessibleDialog` focus controller;
- automatic initial focus, Tab/Shift+Tab containment, Escape close, and focus restoration;
- Arrow Up/Down selection and Enter execution;
- accessible listbox, group, option, active-descendant, and expanded-state semantics;
- responsive solid-surface styling without a new runtime dependency.

No cmdk, Radix, shadcn, or other package was added.

## 3. Role-aware navigation

Navigation commands are generated from:
- `visibleMods`, which is already filtered using the module registry's `requiredRoles`;
- `sidebarChildGroups`, which is already constructed for the active role;
- the existing `openMainModule` and `selectSidebarChild` handlers.

The palette does not define a second authorization map and does not navigate to a hidden module by constructing an independent route. Nested quality audit entries and other module children use the same selection handlers as the sidebar.

## 4. Data search boundary

Command Palette search reuses the existing `aureka:workspace-search` event and the existing DOM-backed module search.

The search scope is intentionally constrained to:
- the current `.moduleEnter[data-workspace-container]`;
- record-like rows and elements already rendered in that active workspace;
- visible elements that are not inside an `aria-hidden` region.

Results are limited to the eight first matching records and each displayed result is truncated to 190 characters. The UI can find patient, doctor, indicator, or other record text when that content exists in the currently rendered workspace.

**No cross-module database search was added.** The palette does not query Supabase, fetch additional records, change RLS, or expand the user's data scope. If the relevant module is not open or its records are not loaded/rendered, it will not appear as a result.

## 5. Quick actions and safety behavior

### Export current module

The action searches for visible, enabled workspace buttons whose visible text, accessible name, or title identifies an export/download action.

- No matching button: show an informational message and perform no export.
- Exactly one matching button: invoke that existing button's action.
- More than one matching button: ask the user to choose the appropriate export control in the workspace; do not guess or execute one automatically.

The underlying export implementation, file format, and authorization remain owned by the module.

### Select unit in current module

The action searches for a single visible, enabled native select control whose associated label/name identifies a unit or room filter.

- Exactly one matching selector: move focus to it so the user can make the selection.
- No matching selector: show an informational message.
- Multiple matching selectors: do not choose automatically; ask the user to use the intended control in the workspace.

The action does **not** change the account's primary unit, role, membership, or authorization. The user must choose an option through the existing module control.

## 6. Integration

Updated `components/HomeClient.tsx` to:
- mount the palette in the existing global search area without changing the workspace header grid;
- generate navigation commands from existing role-filtered navigation data;
- map existing active-workspace search results into command entries;
- expose the export and unit-filter quick actions;
- replace the old Ctrl+K-to-focus-search behavior with the actual Command Palette shortcut.

The original global search input remains available for users who prefer direct module-local search.

## 7. Regression tests

Added `tests/command-palette.test.mjs` covering:
- modal naming, trigger semantics, and minimum touch target;
- Ctrl/Meta+K, arrow selection, Enter execution, and active descendant;
- shared dialog focus containment, Escape, and focus restoration;
- role-filtered navigation and sidebar-child generation;
- active-workspace-only search boundaries;
- reuse of visible export controls and safeguards against ambiguous actions;
- unit-filter focusing without changing the account's primary unit.

## 8. CI verification

GitHub Actions run [`41563016184`](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41563016184) completed successfully for implementation SHA `7c788b7a5bb6401e38d482655b64be024bd2cb23`.

| Automated check | Result |
|---|---|
| Unit and regression tests | **171 passed, 0 failed** |
| AUREKA data/layout validation | **Passed — 35 layouts, 35 unique units, 0 local fixture profiles** |
| TypeScript `tsc --noEmit` | **Passed** |
| Next.js production static build | **Passed** |
| Static export artifact | **Generated successfully** |

Artifact: `aureka-static-export` (882,033 bytes).

The tests verify source contracts and buildability; they do not prove that every role, browser, screen size, export button, or real user interaction has been manually exercised.

## 9. Safety and scope

No changes were made to:
- existing domain engines, indicator calculations, risk scoring, OPPE/FPPE logic, or patient-safety workflows;
- SQL migrations, database schema, RLS policies, RPC definitions, Edge Functions, Auth settings, or Storage;
- module registry role requirements or unit ownership rules;
- source workbooks, import/export schemas, or stored records;
- `main` or production deployment.

The code changes for this phase are limited to:
- `components/CommandPalette.tsx`;
- `components/HomeClient.tsx`;
- `tests/command-palette.test.mjs`.

## 10. Manual verification still required

Before full acceptance:
- test Ctrl+K and ⌘K on Windows/macOS-compatible browsers and confirm Escape, Tab, Shift+Tab, and focus restoration;
- test ADMIN, PMKP, MANAGEMENT/KABID/DIREKTUR/DEWAN_PENGAWAS, PIC, and VALIDATOR visibility against the existing sidebar;
- test patient, doctor, indicator, and other record searches in each relevant active module;
- verify results do not include hidden rows, unauthorized records, or records from another module;
- test export action with zero, one, and multiple visible export controls;
- test unit action with zero, one, and multiple unit selectors and confirm account primary unit is unchanged;
- test 1366 px, 1024 px, 390 px, and 375 px viewports, including the 44 px trigger target and header overflow;
- validate screen-reader announcement and dialog semantics using a supported Windows screen reader/browser.

Do not simulate export or permission failures by changing production data or policies. Use a non-production account and isolated test records.

## 11. Release decision

Automated acceptance passed. Manual browser, role, screen-reader, and operational-action validation remains open. Do not merge to `main` or deploy production until these checks are reviewed and the separate independent full Supabase backup prerequisite has been verified.
