# AUREKA — Solid Default Workspace UI

## Design decisions

The authenticated workspace uses the Solid Default visual language: white page and navigation surfaces, restrained gray borders, compact controls, and a single blue action color. Translucent glass panels, blur, glass gradients, and the AMOLED theme switch are not used in the workspace.

The design stylesheet is loaded after the legacy base styles so the Solid Default rules take precedence without rewriting the existing module-specific layouts.

## Summary dashboard

The former operational and executive dashboard modes are consolidated into one Ringkasan page. Operational indicators remain in the primary summary, while management-only early warnings, Clinical Pathway performance, and RTP status appear as supplementary sections on the same page. Duplicate incident-trend and unit-risk rankings are avoided.

## Mutu Klinis navigation

Mutu Klinis contains three audit groups:

- Audit Indikator Mutu
  - Hasil Capaian
  - Form Logbook
- Audit Clinical Pathway
  - Hasil Capaian
  - Form Logbook
- Audit Klinis dan Kematian
  - Hasil Capaian
  - Form Logbook

Each group opens its existing workspace. Results remain read-only aggregation views; logbook tabs retain the underlying audit and validation workflows. Existing routes for the Clinical Pathway and other audit workspaces remain supported.

## Account identity

The signed-in account is shown once in the workspace header at the upper right. The duplicate profile identity in the sidebar footer is removed; the sidebar footer is reserved for logout.

## Scope and safety

This is a presentation and navigation refactor. It does not modify Supabase schemas, RLS policies, RPC contracts, clinical calculations, indicator definitions, audit records, or patient-safety workflow states.
