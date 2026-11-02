# AUREKA UI/UX — Phase 0 CSS Inventory

**Baseline ref:** `main` at `75a96be6cb61b4e9f17ad64b8c55ab12576ecb23`  
**Audit date:** 2 November 2026  
**Scope:** Root-layout stylesheet imports  
**Purpose:** Record the current CSS surface before progressive migration

## 1. Root layout imports

The current `app/layout.tsx` imports these five stylesheets:

1. `app/globals.css`
2. `app/clinical-ui.css`
3. `app/medidash-ui.css`
4. `app/solid-default.css`
5. `app/medidash-polish.css`

The layout already includes `<html lang="id">` and `<body>`. The earlier concern that these elements were missing is not applicable to the audited baseline.

## 2. Measured stylesheet inventory

Counts were obtained from the full text contents retrieved at the baseline commit. `!important` counts are lexical occurrences, not a claim that each declaration is redundant or safe to remove.

| File | Characters | !important | @media | :root |
|---|---:|---:|---:|---:|
| globals.css | 214,132 | 1,825 | 59 | 2 |
| clinical-ui.css | 43,168 | 802 | 9 | 1 |
| medidash-ui.css | 49,536 | 1,025 | 5 | 1 |
| solid-default.css | 16,606 | 233 | 2 | 2 |
| medidash-polish.css | 46,911 | 663 | 10 | 0 |
| **Total** | **370,353** | **4,548** | **85** | **6** |

The four supplementary stylesheets contain 2,723 `!important` occurrences. The total across all five root imports is 4,548.

## 3. Known cascade behavior

- The root layout imports all five stylesheets in the order shown above.
- `clinical-ui.css` defines a clinical/solid workspace layer and includes high-specificity workspace overrides.
- `medidash-ui.css` defines a MediDash-inspired visual layer and includes additional workspace overrides.
- `solid-default.css` defines a solid white surface direction and removes blur from key workspace surfaces.
- `medidash-polish.css` explicitly describes itself as a final polish layer loaded after Solid Default.
- `globals.css` is the largest stylesheet and includes multiple global, landing, workspace, responsive, and interaction rules.

These facts justify a cascade audit, but they do not establish that every rule conflicts at runtime. Conflicts must be mapped by selector, specificity, source order, and actual component usage before removal.

## 4. Progressive migration risks

1. Moving a stylesheet before all consumers are migrated may change visual behavior.
2. Removing `!important` without analyzing the winning declaration may alter component layout or state styling.
3. Replacing global CSS with Tailwind utilities before a migration map exists can introduce a second styling system rather than simplify the cascade.
4. Changing root tokens such as `:root` variables can alter landing, authentication, and workspace screens simultaneously.
5. CSS custom properties cannot be substituted directly into media-query conditions; breakpoint values must remain explicit or be managed through a compatible build-time mechanism.

## 5. Phase 0 treatment

- Keep all five existing stylesheets in their current paths.
- Do not bulk-delete or relocate CSS.
- Add `app/design-tokens.css` with only `--aureka-*` namespaced tokens.
- Import the token stylesheet after existing root CSS imports.
- Do not globally consume or apply the new tokens in Phase 0.
- Do not add a reset, global font override, or component selectors.
- Record every later CSS migration by component, file, visual baseline, and regression result.

## 6. Work not yet completed

This inventory is an initial root-import and lexical count audit. It is not yet a complete selector conflict graph. Further work is required to:
- map duplicate selectors and overlapping declarations;
- inspect global selectors affecting forms, buttons, tables, dialogs, and overlays;
- identify unused CSS with build/runtime evidence;
- map all media-query interactions;
- capture representative before/after screenshots at desktop, tablet, and mobile sizes;
- remove individual legacy rules only after migration and regression tests.

## 7. Baseline source

All source facts in this report refer to the baseline commit listed at the top of this document. The branch `backup/pre-ui-ux-redesign-2026-11-02` preserves a GitHub branch reference to that commit; it is a remote source-control recovery point, not an external full repository archive or a Supabase database backup.
