# AUREKA UI/UX — Phase 6: Staging and Integration Acceptance

**Status:** Workflow safeguards implemented; isolated staging and browser acceptance are blocked pending valid environment credentials.

## Verified on 3 November 2026

- Latest integration checkpoint: `2d3dc3e6eee664599dc2cfceb190453ab92806cf`.
- AUREKA CI run [41612455650](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41612455650): passed 236/236 tests, data validation, TypeScript, and Next.js build.
- Patient Safety build [41612455672](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41612455672): passed.
- Preview build [41612447977](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41612447977): stopped at the Supabase environment gate. The tests, data validation, and TypeScript steps passed; build/export and artifact upload were skipped.
- The preview workflow now validates the project URL and browser-safe publishable key before building. It rejects the production AUREKA endpoint for preview and rejects secret/service-role credentials.
- The production workflow independently validates that its configured endpoint matches `project_id` in `supabase/config.toml`.

## Required staging values

GitHub Actions must receive these repository/environment variables or secrets, populated with real values for a dedicated non-production project:

- `AUREKA_STAGING_SUPABASE_URL`
- `AUREKA_STAGING_SUPABASE_PUBLISHABLE_KEY`

The current configured values do not pass validation. A placeholder value is not sufficient. Never put a service-role or secret key into a `NEXT_PUBLIC_*` variable.

The active AUREKA Supabase project is production. The connected organization has no separate active AUREKA staging project, and the existing development branch was previously observed in a failed migration state. Neither is a safe staging substitute. No production schema or data changes were made to work around this blocker.

## Acceptance checklist

- [x] CI unit/regression tests: 236 passed, zero failed.
- [x] AUREKA master/layout data validation.
- [x] TypeScript typecheck.
- [x] Next.js production build.
- [x] Preview environment validation fails closed when values are absent/invalid.
- [ ] Dedicated isolated Supabase staging project with valid URL and publishable key.
- [ ] Successful preview static export and artifact upload.
- [ ] Browser visual checks at 1366, 1024, 768, 390, and 375 px.
- [ ] Keyboard-only and screen-reader acceptance.
- [ ] Role/unit acceptance and all 15 workbook-import scenarios.
- [ ] Browser performance measurements (LCP, INP, CLS).
- [ ] Independent full backup and isolated restore test.
- [ ] Final PR diff review and explicit release authorization.

## Release decision

Phase 6 is not accepted for production release. Keep the branch and PR open until every unchecked item above has objective evidence. Do not point preview at production or alter live clinical data to force a green preview workflow.
