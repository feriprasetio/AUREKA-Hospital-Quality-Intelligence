# AUREKA UI/UX — Phase 2 Accessibility

**Status:** Implemented on feature branch; automated CI passed on 3 November 2026. Manual assistive-technology verification remains pending.  
**Branch:** `feat/ui-ux-redesign`  
**Design baseline:** Approved Solid Enterprise Design / progressive migration  
**Protected scope:** Data model, authorization, domain engines, and Supabase behavior

## 1. Objective

Improve the accessibility of operational forms and dialogs without changing business rules, visual identity, persisted values, workflow transitions, or data contracts.

This phase targets accessible names, announcements, required-field feedback, keyboard focus handling, and regression protection.

## 2. Shared keyboard-dialog controller

Added `components/layout/useAccessibleDialog.ts`.

The typed hook supports:
- initial focus on a `data-dialog-autofocus` element, then the first visible focusable element;
- Tab and Shift+Tab containment while the dialog is open;
- Escape-to-close when the host explicitly supplies an `onClose` callback and allows Escape;
- focus restoration to the element active before opening;
- configurable Escape suppression for forms where accidental dismissal could lose work.

The hook does not create a dialog, style it, change its content, or decide whether unsaved data may be discarded. The caller remains responsible for `role="dialog"`, `aria-modal`, a meaningful accessible name, and its existing dirty-state/confirmation behavior.

## 3. Implemented dialog integrations

| Workspace | Accessibility improvement |
|---|---|
| Patient Safety / IKP | Form dialog focus management; Escape continues through existing dirty-form confirmation; explicit labels and descriptions for generated incident/investigation fields |
| Audit Indikator Mutu | Logbook editor, close confirmation, archive confirmation, and unit picker receive focus management |
| Manajemen Risiko | Dialog focus containment; Escape remains disabled deliberately to preserve the existing no-accidental-dismiss rule |
| OPPE | Rule editor and indicator-gap draft dialogs receive focus management and labelled headings |
| Direktori Tenaga Kerja | Edit metadata dialog receives focus management and explicit initial focus |

The existing workflow and modal business behavior is intentionally retained. This is a targeted integration, not yet a proof that every dialog in every Excel importer or every workspace is fully conformant.

## 4. Form naming and validation

- Administrative search fields and per-user unit/role controls have explicit accessible names.
- Dynamic logbook controls receive field-specific accessible names where the field label is generated from workbook metadata.
- Patient Safety incident/investigation controls explicitly reference the generated label IDs.
- Required IKP fields expose `aria-invalid` when missing and point to a nearby explanatory message through `aria-describedby`.
- Search/file-input controls that are visually hidden or compact still carry an accessible name.

Visible labels are retained wherever possible; `aria-label` is used for controls such as row-specific selectors and search boxes that have no practical visible label.

## 5. Status and error announcements

- Successful actions use `role="status"` and polite live announcements.
- Errors use `role="alert"` and assertive announcements in the reviewed components.
- Settings and quality metadata feedback distinguish errors from normal completion messages.
- OPPE, FPPE, clinical pathway, staff directory, and team success notifications use polite announcement semantics.

The classification of a message remains at the UI layer and does not change operation results or the underlying error payload.

## 6. Regression tests

Added `tests/ui-accessibility.test.mjs` with static regression checks for:
- dialog Escape, focus trap, and focus restoration hooks;
- mobile sidebar keyboard behavior;
- patient-safety generated labels and invalid/described-by state;
- names for administrative search and row assignment controls;
- distinction between error alerts and success statuses;
- selected workspace dialog roles and focus-controller integration.

These tests check code contracts; they do not replace browser interaction tests or a real screen reader.

## 7. Files updated in Phase 2

- `components/layout/useAccessibleDialog.ts` — new shared hook.
- `components/GeneralSettings.tsx` — form/search names and status/error semantics.
- `components/QualitySettings.tsx` — status/error semantics.
- `components/QualityIndicatorWorkspace.tsx` — dynamic field names, focus management for editor and confirmation dialogs.
- `components/PatientSafetyWorkspace.tsx` — generated field labels, descriptions, validation status, and dialog focus.
- `components/RiskManagementWorkspace.tsx` — dialog focus containment while preserving no-Escape behavior.
- `components/OppeAuditWorkspace.tsx` — dialog focus, labelled headings, search names, success announcement.
- `components/FppeEvaluationWorkspace.tsx` — accessible archive search and polite success announcement.
- `components/ClinicalPathwayWorkspace.tsx` — distinguish error alerts from normal status.
- `components/StaffDirectoryWorkspace.tsx` — focus-managed edit dialog, file input/search names, success announcement.
- `components/StaffTeamWorkspace.tsx` — polite success announcement.
- `tests/ui-accessibility.test.mjs` — new regression tests.

No new runtime dependency was installed.

## 8. CI verification

GitHub Actions run `41559175408` completed successfully for commit `b9541ef5d81ee0fbe485e5992d59b4ec5b85629e`.

Verified automated steps:
- unit and regression tests: passed (157 tests in the run);
- AUREKA data/layout validation: passed;
- TypeScript typecheck: passed;
- Next.js static export build: passed;
- `aureka-static-export` artifact generated.

CI does not verify screen-reader announcements, the visual placement of focus rings, or actual keyboard behavior in a real browser.

## 9. Explicit limitations and remaining checks

The following remain required before declaring broad accessibility acceptance:
- screen reader verification using at least one Windows screen reader/browser combination available to the hospital;
- keyboard-only testing across all main navigation, forms, data tables, nested menu controls, and dialogs;
- validation of focus order and visible focus indicators at desktop and mobile breakpoints;
- review of all Excel importer dialogs and less frequently used dialogs not included in this targeted pass;
- review of all generated labels in workbook-driven forms and all form validation paths;
- manual role/unit regression checks for ADMIN, PMKP, PIC, and VALIDATOR.

This phase does not claim WCAG 2.2 AA conformance. Conformance requires manual evaluation and a defined test scope.

## 10. Safety policy

No edits were made to:
- `lib/aureka/*.ts` or any calculation/scoring engine;
- role mapping, unit authorization, or route/hash behavior;
- Supabase client, RLS, SQL, RPC, Edge Functions, Auth, Storage, or production data;
- workbook import/export contracts;
- the main branch or production deployment.

The repository backup branch is a source-control recovery point only. Independent full database and Storage backup remain unverified.
