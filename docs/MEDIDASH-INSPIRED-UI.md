# MedDash-inspired UI redesign for AUREKA

## Purpose

Provide AUREKA with the information hierarchy and interaction patterns of a modern hospital administration dashboard while retaining AUREKA's clinical quality and patient-safety scope, brand identity, Next.js application, and Supabase domain architecture.

This is an original AUREKA implementation inspired by the reference layout. It does not copy MediDash source code or commercial assets.

## User interface changes

- White, fixed-height, collapsible sidebar with nested module navigation and compact active states.
- Expandable Ringkasan tree with Dashboard 1 and management-only Dashboard 2; sidebar selection and dashboard tabs share the same state.
- Sticky topbar with module-scoped search, fullscreen action, notification history, Super Admin chat, theme selection, and profile shortcut.
- Shared spacing, card, panel, form, button, table, and alert treatments for existing workspaces.
- Responsive layout for compact/mobile screens and reduced-motion preference.
- Explicit support for the existing AMOLED theme.
- Management users can switch between two dashboard presentations:
  - Dashboard 1: operational PMKP worklist and status overview.
  - Dashboard 2: executive-oriented early warnings and cross-domain aggregates.

## Dashboard data semantics

Dashboard 2 deliberately uses only existing, permission-scoped AUREKA sources: quality audit records, Clinical Pathway audit records, incident workflow status, risk register, mitigation-plan status, and existing derived aggregates.

Values retain the period and denominator semantics of their source query. The display does not claim that different sources share one common reporting window, and it does not calculate a single overall hospital quality score. Source errors are shown as unavailable rather than silently converted to zero.

## MediDash patterns intentionally not copied as AUREKA modules

Appointment scheduling, patient billing/revenue, bed assignment/occupancy, inpatient journey tracking, and staff attendance are not introduced as working AUREKA modules. They require operational systems, data contracts, and permissions that are outside AUREKA's current PMKP scope. No demo numbers or placeholder patient records are used to imitate them.

## Security and architecture boundaries

- No Supabase schema, migration, RPC, RLS, storage policy, or clinical calculation engine is changed by this UI redesign.
- The existing authentication and role visibility rules remain in force.
- Visual hiding is not treated as authorization; backend policies remain the access-control boundary.
- No patient-level records are introduced into executive cards.

## Validation

CI on the feature branch runs unit/regression tests, master/layout data validation, TypeScript checking, and Next.js static export. Additional release acceptance remains necessary: visual review in Firefox/Chrome at desktop/tablet/mobile widths, actual authenticated persona × unit checks, keyboard/screen-reader review, and user acceptance with PMKP and unit PICs.
