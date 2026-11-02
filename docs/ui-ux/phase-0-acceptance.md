# AUREKA UI/UX — Phase 0 Acceptance Checklist

**Status:** Implementation candidate — local verification pending

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

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build` (static export)
- [ ] Git diff confirms only approved files changed.
- [ ] Root layout keeps `<html lang="id">` and `<body>`.
- [ ] Existing stylesheet import order is unchanged; token import is appended.
- [ ] No new console errors in browser.
- [ ] Visual smoke test: public landing, login, dashboard, quality indicators, safety, risk, clinical pathway, workforce, OPPE/FPPE, settings.
- [ ] Viewports checked: 1366, 1024, 768, 390, and 375 px.

## Verification limitation

The current execution environment can create and inspect GitHub commits and branches but does not have a verified local checkout with Node dependencies. A successful GitHub file write is not a substitute for `npm run typecheck`, `npm test`, `npm run build`, or browser regression testing.

## Release decision

Phase 0 may be considered technically complete only after the unchecked code-verification items are executed in CI or a local clone and the resulting statuses are reviewed. Do not merge to `main` based only on successful file creation.
