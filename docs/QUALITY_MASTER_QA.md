# Quality master data: unresolved items before automated interpretation

This note records data-quality defects found during the 29 October 2026 review. It is intentionally a **review queue**, not an automatic correction. Indicator definitions, inclusion criteria, targets, and numerator/denominator semantics are clinical governance decisions and must be approved by the indicator owner/Komite PMKP before being changed.

## Verified examples

| Source | Finding | Required action |
|---|---|---|
| 2026 profile chunks, code 7.1 and 7.2 | Master title is blank in the repository source profile. | Confirm the official indicator name and approved header before publishing a new profile version. |
| 2026 profile chunk 11, codes 26.1, 26.3, 26.11 | Master title is blank in the repository source profile. | Confirm the official name from the approved unit worksheet; do not infer it from the numerator definition alone. |
| 2026 profile chunk 4, code 12.2 | The source value for unit of measure contains narrative/definition text rather than only a measurement unit. | Restore the correct measurement unit and keep the operational definition in its dedicated field. |
| Live aureka_quality.indicator_profiles, code 14.4 (Kepatuhan Jam Visite Dokter Spesialis) | Several response options, including “Tidak Visite”, have numerator=true and code=1. | The indicator owner must confirm each option's numerator/denominator meaning and response code; otherwise automated rates can be biased. |
| Live profile family with the same header_label “Visite Spesialis” (e.g., codes 18.4, 19.8, 20.8, 22.7, 23.5, 24.8, 27.9, 37.6) | Some profiles have no unit of measure, no numeric target value, and no response options. | Confirm which rows are active templates versus legacy/placeholder duplicates, then retire or complete them through the versioned master-data workflow. |

## Release rule

- Do not silently rename clinical indicators, change targets, or recode options from inference.
- Publish corrected metadata as a new version with approver, effective date, source worksheet, and a regression case for its calculation.
- Keep ambiguous values in manual review; do not turn missing or unclassified data into a zero or an automatic pass.
- Reconcile repository source chunks with the live Supabase master before import or deployment. A source JSON file is not the authority for the currently published database profile.
