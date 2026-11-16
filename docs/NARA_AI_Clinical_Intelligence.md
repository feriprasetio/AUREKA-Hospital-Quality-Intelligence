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

The function `public.aureka_nara_clinical_summary(p_year,p_room,p_limit)` ranks diagnosis labels inside PostgreSQL. It uses the normalized No. RM internally only to count distinct patients and prevent duplicate patient counting. MRNs, patient names, and patient-level rows are never returned from this function or placed in external LLM prompts.

The preferred source is patient-episode data in `aureka_quality.quality_records`. When there are no episode rows, the current implementation falls back to `aureka_quality.patient_index.diagnosis_terakhir`, which is one latest diagnosis per indexed patient. Results explicitly identify the source basis and are not described as full DPJP history or counts of every hospital visit.

**Production data state observed on 16 November 2026:**
- `aureka_quality.patient_index`: 10,913 rows.
- Populated `diagnosis_terakhir`: 1,747 rows.
- `aureka_quality.quality_records`: 0 episode rows.
- `aureka_quality.clinical_pathway_audits`: 0 rows.
- `aureka_quality.clinical_death_audits`: 0 rows.
- `aureka_quality.igd_consultation_audits`: 0 rows.
- `aureka_patient_safety.incidents`: 0 rows.
- `aureka_risk.risk_register`: 1,544 rows; `aureka_risk.fmea_analyses`: 19 rows.
- `aureka_quality.staff_directory`: 659 rows.

Thus the current top-diagnosis response is a preliminary ranking from latest diagnoses per patient. It is not a full episode/visit ranking, and does not yet represent all diagnoses entered by DPJPs. Full DPJP episode analysis depends on populating/connecting the episode sources in AUREKA.

Top-disease questions are routed directly to the secured database function. The aggregate result bypasses all external LLM providers. Diagnosis groups under five distinct patients are suppressed.

## ICD-10 coding governance

The NARA ICD-10 dictionary starts empty. Diagnosis labels are queued for review without MRN or patient name. Only ADMIN/PMKP can access the review queue and save a mapping. A mapping becomes `validated` only when a reviewer provides an ICD-10 code, diagnosis title, and validation reference. Ambiguous raw diagnoses are not automatically assigned definitive codes.

PMIK/DPJP review and the hospital's approved coding release/rules remain prerequisites before codes are relied upon for official reporting, claims, or clinical decisions.

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
3. Test ICD-10 queue and validation with an approved reviewer; maintain reference/evidence.
4. Test each configured AI provider with synthetic, non-PHI prompts; record provider success, latency, rate limits, quota, and fallback.
5. Populate encounter-level episode data and DPJP attribution before interpreting rankings as all-visit/all-DPJP disease burden.
6. Monitor the PHI-free audit log and Supabase security/performance advisors.

NARA must always state whether a clinical ranking is based on unique patients, episodes, or another defined denominator. It must not present latest-diagnosis-per-patient counts as visit/episode counts.
