# AUREKA UI/UX — Phase 1 Layout & Responsiveness

**Status:** Implemented on feature branch; CI verification required  
**Branch:** `feat/ui-ux-redesign`  
**Baseline:** Phase 0 approved Solid Enterprise Design  
**Protected area:** module business logic, authorization, Supabase, and data contracts

## 1. Phase 1 objective

Stabilize the existing application shell without replacing the established navigation model. AUREKA already has an authorization-aware navigation tree in `HomeClient.tsx`; it depends on role, unit, module registry, hash routing, and nested module selections. This phase retains that business-aware menu rendering and improves its layout behavior and accessibility.

## 2. Implemented layout decisions

- Desktop retains a fixed-width operational sidebar and a flexible workspace content column.
- The desktop sidebar collapse control is made visible and now produces a real compact icon rail.
- Tablet retains the existing compact sidebar breakpoint and full navigation labels.
- Mobile uses a slide-in drawer with a scrim and a full-width workspace content area.
- When the drawer is open, background body scrolling is locked.
- The drawer closes with Escape, scrim click, explicit close button, navigation selection, or a viewport resize to desktop.
- Focus moves into the drawer on open, remains trapped while open, and returns to the menu trigger when closed.
- Touch targets in mobile navigation and the menu controls are at least 44 × 44 px.
- Safe-area insets are applied to the mobile drawer for devices with display cut-outs.

## 3. Implementation architecture

### Navigation rendering remains in HomeClient

The current navigation tree is not moved into a separate component because it closes over role- and module-specific state:
- role and user context;
- manager/admin visibility;
- active module and nested submodule;
- quality audit selection;
- risk, safety, workforce, and analytics tabs;
- module hash navigation.

Moving it as one large component would increase regression risk. Phase 1 instead extracts only the mobile drawer accessibility controller to `components/layout/useAccessibleSidebar.ts`.

### New layout stylesheet

`app/layout-responsive.css` is imported after the existing stylesheets and Phase 0 design tokens. It is scoped to the workspace shell and contains explicit overrides for legacy cascade conflicts. It does not restyle module interiors.

### No runtime/server architecture change

The static export setup, GitHub Pages base path, and Supabase client architecture are unchanged. No server-dependent features or API routes are introduced.

## 4. Files changed in Phase 1

- `components/layout/useAccessibleSidebar.ts` — accessible drawer state, Escape handling, focus trapping/restoration, body scroll lock, viewport-close behavior.
- `app/layout-responsive.css` — desktop rail, tablet and mobile shell styles; 44 px mobile touch targets.
- `components/HomeClient.tsx` — wire the controller into the existing authorization-aware navigation, add accessible drawer semantics and close control.
- `app/layout.tsx` — load responsive shell styles after existing styles and Phase 0 tokens.
- `docs/ui-ux/phase-1-layout-responsive.md` — this specification.
- `docs/ui-ux/phase-1-acceptance.md` — verification checklist.
- `.github/workflows/preview-build.yml` — run master/data validation in feature preview CI.

## 5. Explicitly unchanged

- `lib/aureka/*.ts` and all domain engines.
- Module registry, role/permission decisions, unit scoping, and menu content.
- Supabase client, schema, SQL migrations, RPC, Edge Functions, Auth, Storage, and production data.
- Import/export workbook payloads and validation.
- Existing hash routing and module selection behavior.
- All legacy CSS files; no bulk stylesheet deletion or relocation.

## 6. Known implementation boundaries

- This phase improves the application shell; it does not claim full WCAG 2.2 AA conformance.
- The mobile drawer uses a custom accessible controller around the existing navigation. It does not add Radix or shadcn/ui dependencies.
- Browser-level keyboard, screen-reader, and physical viewport testing remains a release acceptance requirement.
- The desktop compact rail hides nested children while collapsed. Users can expand the sidebar to access the full tree.

## 7. Safety and release policy

All Phase 1 commits are limited to `feat/ui-ux-redesign`. Do not merge to `main` or deploy production until the entire Phase 1 acceptance checklist is completed and reviewed.

The GitHub backup branch is a source-control recovery point only. It is not a substitute for an independent Supabase database dump or Storage-object archive. No production database backup is claimed by this phase.
