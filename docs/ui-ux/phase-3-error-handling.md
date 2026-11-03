# AUREKA UI/UX — Phase 3: Error Handling & UX States

**Status:** Implemented on `feat/ui-ux-redesign`; automated CI passed on 3 November 2026.  
**CI run:** [41561367095](https://github.com/feriprasetio/AUREKA-Hospital-Quality-Intelligence/actions/runs/41561367095)  
**Protected scope:** No changes to database schema, RLS, RPC, Edge Functions, authentication policy, business engines, or production data.

## 1. Objective

Give operators clear and actionable feedback when an operation is loading, has no results, or cannot be completed. Prevent raw infrastructure diagnostics from being displayed in ordinary UI notifications.

The phase is deliberately incremental. It centralizes reusable feedback behavior and applies it to high-traffic flows without changing the underlying service calls or their authorization rules.

## 2. Shared error-feedback utility

Added `lib/aureka/error-feedback.ts`.

### `toUserFacingError(error, { fallback })`

- Maps common PostgreSQL/PostgREST codes to Indonesian operator guidance.
- Maps common session, authentication, throttling, network, and timeout failures.
- Preserves concise application-authored Indonesian validation/workflow messages.
- Uses a caller-supplied fallback for unknown service objects and unrecognized English diagnostics.
- Filters SQL fragments, schema/table/function diagnostics, raw URLs, and UUIDs rather than echoing them to the UI.

Known mappings include duplicate records, missing related records, required fields, invalid formats, insufficient permissions, stale/missing data, unavailable service functions, expired sessions, rate limits, connectivity failures, and timeouts.

### `sanitizeNotificationText(message, fallback)`

Acts as a final safety filter for legacy components that already dispatch a string notification. Safe operator copy is retained; technical diagnostics, URL/UUID content, and excessively long messages are replaced by the caller's fallback.

The helper does not log the original error, transmit it elsewhere, alter service responses, or change application workflow state.

## 3. Reusable asynchronous state component

Added `components/AsyncStatePanel.tsx` with three explicit states:

| State | Meaning | Accessibility |
|---|---|---|
| Loading | A request is active | `role=status`, polite live region, `aria-busy=true` |
| Empty | Request succeeded but there is no result | `role=status`, polite live region |
| Error | A request failed | `role=alert`, assertive live region, optional retry control |

The component supports compact layout, caller-authored title/description, a real retry callback, disabled/retrying feedback, focus-visible styling, and reduced-motion handling.

## 4. Integrations

### Global shell and notifications — `components/HomeClient.tsx`

- Legacy workspace notifications are classified and passed through the final safety filter.
- Technical error content is replaced even when an older component did not explicitly classify the message as an error.
- Authentication failures use the shared normalizer for unrecognized service errors.
- Password recovery and first-login password completion no longer echo raw service messages.
- Chat Super Admin distinguishes loading, empty, and failed request states.
- Chat conversation and message failures expose explicit retry controls.
- Public landing graphs use the shared loading, empty, and error states; retry repeats the aggregate read.

The chat operation itself remains unchanged: the existing Supabase calls, filtering by role/user, and send workflow are retained.

### Operational modules

User-facing error rendering now uses the shared normalizer in:
- General Settings and account administration;
- Quality Settings / indicator metadata;
- Audit Indikator Mutu and monthly review;
- Patient Safety — IKP, investigation, and anonymous culture survey;
- Risk Register, FMEA, mitigation workflow, and risk connectors;
- OPPE and FPPE;
- Staff Directory and Staff Team assignments.

Application-authored validation messages remain intact. Migration-specific guidance already authored by the application is retained where it is meaningful; low-level service detail is not appended.

## 5. Regression tests

Added `tests/error-feedback.test.mjs` covering:
- mappings for common service error codes and statuses;
- filtering of schema/table details, SQL, URLs, and UUIDs;
- preservation of concise application validation messages;
- safe fallback for unknown service objects and unrecognized English diagnostics;
- connectivity, timeout, and authentication guidance;
- sanitization of legacy notification strings;
- loading/empty/error semantics and retry behavior in the shared component;
- support-chat and public-metrics retry-state integration.

## 6. CI verification

GitHub Actions run `41561367095` completed successfully for the implementation commit before this document was added.

| Automated check | Result |
|---|---|
| Unit and regression tests | **165 passed, 0 failed** |
| AUREKA data/layout validation | **Passed — 35 layouts, 35 unique units, 0 local fixture profiles** |
| TypeScript `tsc --noEmit` | **Passed** |
| Next.js static production build | **Passed** |
| Static export artifact | **Generated successfully** |

Artifact: `aureka-static-export` (878,058 bytes).

This CI result verifies build and code-level contracts only. It does not prove that every runtime branch, screen-reader announcement, or retry interaction has been exercised in a real browser.

## 7. Safety and scope

The following were not modified:
- existing `lib/aureka/*` domain engines, scoring rules, or calculations (apart from adding the independent `error-feedback.ts` helper);
- SQL migrations, schema definitions, RLS policies, RPC definitions, Edge Functions, Supabase Auth configuration, or Storage;
- role mappings, unit-level authorization, and data ownership rules;
- workbook import/export schemas or source data;
- `main` branch or production deployment.

The helper is presentation-only. It changes what is shown to an operator, not the result returned by Supabase or the decision made by the application.

## 8. Remaining manual validation

Before marking the phase fully accepted, validate in a preview/test environment:
- simulate network loss, expired session, insufficient permission, duplicate record, and unavailable service function;
- confirm that no schema names, SQL fragments, URLs, UUIDs, or internal service messages are shown;
- verify Chat Super Admin loading, empty, retry, successful send, and failed send states for ADMIN and PIC roles;
- verify public graph loading, empty aggregate, error, and retry states;
- verify that a failed write leaves the original form/data intact and does not show a false success notification;
- verify loading and error announcements with a supported Windows screen reader;
- run visual/keyboard regression at the agreed desktop and mobile widths.

Use a non-production tenant or isolated test records for failure simulation. Do not induce permission, duplicate, or migration failures by changing production data or production policies.

## 9. Release decision

Automated acceptance is passed. Manual browser and screen-reader validation remains open. Do not merge to `main`, deploy production, or claim complete UX/accessibility acceptance until the manual checklist is signed off and the separate full Supabase backup prerequisite is independently verified.
