# NARA AI — Clinical Intelligence, Data Governance, and Multi-Provider Routing

## Overview

NARA AI is the single assistant and hospital-intelligence workspace for AUREKA. The gateway uses the authenticated user's Supabase JWT; it does not expose service-role credentials to the frontend and does not permit an LLM to execute arbitrary SQL.

## AI provider orchestration

NARA supports Groq, NVIDIA, Gemini, DeepSeek, and LLM7. The default route order is `groq,nvidia,gemini,deepseek,llm7`, adjustable with `AI_PROVIDER_ORDER`. Providers without a server-side API secret are skipped. When a provider/model is unavailable, rate-limited, out of quota, slow, or returning a server error, the gateway can fall through to the next configured provider.

DeepSeek and LLM7 are eligible by default when their server-side API secrets exist. Set `AI_ENABLE_DEEPSEEK=false` or `AI_ENABLE_LLM7=false` to disable either provider. A supported adapter/secret is not proof of current vendor availability; actual provider success, quota, and latency require authenticated runtime tests.

## Data domains in the NARA context

The server-side snapshot aggregates the following AUREKA domains, subject to the user's actual RLS and role permissions:
- Risk Register: risk-level and status distributions, deadlines, and unit-level aggregates.
- FMEA: counts by priority/status/unit and RPN summary. Failure-mode narrative, causes, action text, and named owners are intentionally excluded from the LLM context.
- Mitigation Plans: status and overdue aggregates.
- Patient Safety: incident totals and suppressed category aggregates; incident narratives and patient-level records are excluded.
- Clinical Quality: logbook counts by unit and period plus the secure governance/infographics aggregate.
- Workforce: counts by profession, directory status, and source unit. Staff names, employee codes, and contacts are excluded.
- Clinical Pathway and clinical-death audits: status/type and selected score aggregates. Patient names, MRNs, DPJP names, and episode JSON are excluded from LLM context.
- IGD consultation response: count, performance labels, mean elapsed minutes, and target-attainment aggregate for the requested year. Patient and doctor identifiers are excluded.

If a source table is empty or unavailable under the user's role, NARA states that limitation. It must not invent missing values or claim a module has data when its source is empty.

## Clinical diagnosis ranking and MRN boundary

The secure function public.aureka_nara_clinical_summary(p_year,p_room,p_limit) uses the patient index as the primary source for patient-level diagnosis ranking whenever eligible diagnosis_terakhir rows exist in the user's permitted units and requested year. This prevents a small number of imported Logbook episodes from hiding the broader diagnosed-patient population.

The statistical units remain distinct:
- **Patient ranking:** one latest diagnosis per indexed patient, with No. RM used only inside PostgreSQL to count unique patients.
- **Episode context:** episode count, unique patients in episode records, analyzable diagnosis records, diagnosis groups, and suppressed groups are calculated separately from quality_records. They are not added to the patient-index denominator and are not presented as visit counts for the patient ranking.
- **Episode fallback:** episode records become the primary ranking basis only when no eligible patient-index latest-diagnosis rows exist for the selected year and permitted room scope.

The function returns only de-identified aggregate diagnosis labels/counts and the source basis. MRNs, patient names, DPJP names, and patient-level rows are never returned. Diagnosis groups below five unique patients are suppressed. Punctuation/case normalization groups mechanically equivalent label variants; clinically distinct labels and spelling variants are not merged unless a reviewer validates their mapping to the same ICD-10 code.

**Production data state verified on 18 November 2026:**
- aureka_quality.patient_index: 10,950 patient-index rows; 1,902 have a non-empty diagnosis_terakhir across the full table.
- Of the diagnosed patient-index rows, the ADMIN account's permitted-unit scope previously used by NARA contained 1,664 diagnosed patients and 23 diagnosis groups meeting the five-patient threshold.
- aureka_quality.quality_records: 235 active patient-episode records in 2026, each with a diagnosis field; these represented 222 unique medical-record numbers.
- In the episode-only grouping, 172 exact diagnosis groups were suppressed because each contained fewer than five unique patients. This was the production reason the previous NARA implementation returned no ranked diagnoses despite available patient-index diagnoses.

The production query continues to enforce aureka_system.has_quality_room_access; the counts above are a diagnostic snapshot and must not be generalized to users with different room permissions. The patient index currently contains rows with empty latest-diagnosis values, so AUREKA must not claim that every historical patient-index row has a diagnosis. The 235 episode records observed in the production snapshot did contain diagnoses.

## Diagnosis data completeness

The clinical summary also returns `patient_index_context` so a blank diagnosis is explicitly treated as a data-quality gap rather than as a patient without disease. It includes the total patient-index denominator for the selected year and authorized units, the number with a non-empty latest diagnosis, the number missing diagnosis, overall coverage, and unit-level coverage for reportable units. The patient-ranking cohort remains restricted to safe, analyzable diagnosis labels; its denominator is not substituted for the total patient-index denominator.

The patient-index synchronization trigger recognizes the diagnosis field variants `Diagnosa Tegak`, `Diagnosa IGD`, `Diagnosa Primer`, `Diagnosa Utama`, `Diagnosa`, and `Diagnosa Operasi`, in addition to the canonical `diagnosis` field. This ensures future episode inserts/updates using these existing field names populate the latest diagnosis in the patient index. It does not reconstruct historical diagnoses where the original episode payload is no longer present.

Top-disease questions are routed directly to the secured database function. The aggregate result bypasses external LLM providers. The response explicitly identifies the patient or episode denominator and reports episode context separately.

## ICD-10 coding governance

The NARA ICD-10 dictionary starts empty. Diagnosis labels are queued for review without MRN or patient name. Only ADMIN/PMKP can access the review queue and save a mapping. A mapping becomes `validated` only when a reviewer provides an ICD-10 code, diagnosis title, and validation reference. Ambiguous raw diagnoses are not automatically assigned definitive codes.

PMIK/DPJP review and the hospital's approved coding release/rules remain prerequisites before codes are relied upon for official reporting, claims, or clinical decisions. The review queue is sourced from the broader patient-index diagnosis cohort first, even when episode rows are also present. AI suggestions are processed in bounded batches, stored as proposed, and exposed in the NARA Validasi ICD-10 workspace. Each spelling/alias variant requires its own reviewed mapping; once validated to the same ICD-10 code, the analytics engine groups those variants under that code. Punctuation and case variants are normalized deterministically without AI.

## Security and privacy

- No patient names or MRNs are sent to Groq, NVIDIA, Gemini, DeepSeek, or LLM7.
- Direct dictionary/audit table grants are revoked; RLS is enabled.
- Aggregate functions validate the authenticated role and permitted room scope.
- Small groups are suppressed (minimum five distinct patients).
- Clinical data access writes a PHI-free audit row.
- The current controls are technical safeguards, not a substitute for formal privacy governance, lawful basis, DPIA where applicable, vendor/data-processing terms, retention rules, and approved cross-border processing.

## Operational validation

1. Authenticate as Super Admin, PMKP, and unit roles; verify role/room-scope results.
2. Test Top 10 diagnosis prompts against the secured database function; verify source basis and denominator.
3. Test ICD-10 queue and validation with an approved reviewer; validate spelling variants separately and maintain reference/evidence.
4. Test each configured AI provider with synthetic, non-PHI prompts; record provider success, latency, rate limits, quota, and fallback.
5. Populate encounter-level episode data and DPJP attribution before interpreting rankings as all-visit/all-DPJP disease burden.
6. Monitor the PHI-free audit log and Supabase security/performance advisors.

NARA must always state whether a clinical ranking is based on unique patients, episodes, or another defined denominator. It must not present latest-diagnosis-per-patient counts as visit/episode counts.
