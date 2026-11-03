# AUREKA UI/UX — Phase 0 Acceptance Checklist

**Status:** Automated code checks passed on 3 November 2026; manual browser, visual, and backup acceptance remain pending

## Scope and safety

- [x] Approved visual direction recorded.
- [x] Progressive migration strategy recorded.
- [x] Tailwind CSS deferred.
- [x] Landing and authentication included in Solid Default target.
- [x] Existing five root stylesheets retained.
- [x] Namespaced tokens added without component selectors or global reset.
- [x] No new npm dependency.
- [x] No Supabase schema, data, Auth, Storage, RPC, or Edge Function changes.
- [x] No `lib/aureka/*.ts` changes.
- [ ] Full repository archive independently downloaded and verified.
- [ ] Full production database dump independently created and verified.
- [ ] Storage objects downloaded and checksummed (current metadata inventory reported zero objects; recheck at backup time).

## Code verification

- [x] `npm run typecheck` — GitHub Actions run `41586465407`, 3 November 2026, current PR head `6304be2deff9a74afdd73745c0f1b87009695bd3`.
- [x] `npm test` — 188/188 unit/regression tests and data validation passed in the current verified checkpoint.
- [x] `npm run build` (static export) — current PR head CI completed successfully.
- [ ] Git diff confirms only approved files changed.
- [x] Root layout keeps `<html lang="id">` and `<body>` (verified in `app/layout.tsx`).
- [x] Existing five stylesheet imports remain in the original order; design tokens and responsive layout CSS are appended in `app/layout.tsx`.
- [ ] No new console errors in browser.
- [ ] Visual smoke test: public landing, login, dashboard, quality indicators, safety, risk, clinical pathway, workforce, OPPE/FPPE, settings.
- [ ] Viewports checked: 1366, 1024, 768, 390, and 375 px.
- [ ] Review `color-scheme: light` against Windows/browser light and dark system preferences; inspect native select/input rendering.

## Latest automated verification — 3 November 2026

- [x] PR #94 head `6304be2deff9a74afdd73745c0f1b87009695bd3`: unit/regression tests, data validation, TypeScript, and Next.js build all passed in GitHub Actions run [41586465407](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41586465407).
- [x] Patient Safety Build Check passed in run [41586465402](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41586465402).
- [x] The current PR diff has no paths under `lib/aureka/`, `supabase/migrations/`, or `supabase/functions/`. UI feedback helper is isolated under `lib/ui/`.
- [ ] Lint is not configured as a package script and has not been run.
- [ ] Browser, viewport, console, visual regression, keyboard, screen-reader, staging, and restore acceptance remain pending.
- [ ] Full off-site repository/database/Auth/Storage/Edge Function backup and isolated restore remain pending.

Automated CI is evidence for unit/data/type/build correctness at this specific commit only. It is not a substitute for browser regression, manual clinical workflow validation, or a restore test.

## Release decision

The automated test/data/type/build gate has passed on the recorded commit. Phase 0 is not fully accepted until the remaining visual/browser checks, `color-scheme: light` review, off-site repository and Supabase backup, and isolated restore are completed. Do not merge to `main` based only on CI success.
