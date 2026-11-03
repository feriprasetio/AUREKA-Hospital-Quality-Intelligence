---
name: aureka-domain-engineering
description: Use when designing, implementing, reviewing, or testing AUREKA hospital PMKP workflows, indicator calculations, patient-safety events, risk management, clinical workforce evaluation, clinical pathways, audits, analytics, or exports.
---

# AUREKA Domain Engineering

## Purpose
Keep AUREKA's hospital quality and patient-safety workflows substantively correct, auditable, and aligned with approved hospital governance. This skill supplements (never overrides) current regulations, approved hospital policies, indicator profiles, and domain-owner decisions.

## General rules
- Identify the authoritative source for every master, rule, target, and workflow transition before coding.
- Separate presentation, domain calculation, persistence, authorization, and reporting.
- Do not infer or fabricate clinical definitions, targets, thresholds, scoring weights, effective dates, or responsible professions.
- Preserve provenance: source record, unit, reporting period, evaluator/actor, timestamp, rule/profile version, and review status as appropriate.
- Distinguish draft, submitted, reviewed, validated, and approved states. A saved draft is not a validated report.
- Never report success until the server confirms persistence.
- Handle empty, incomplete, invalid, duplicate, late, and out-of-period data explicitly.

## Indicator quality and audit
- Treat numerator (N), denominator (D), operational definition, inclusion/exclusion criteria, measurement period, target, direction, and aggregation method as separate metadata.
- Validate denominator > 0 before computing a proportion; represent not evaluable separately from zero performance.
- Distinguish percentage, rate, count, duration, and compliance indicators. Do not apply percentage logic to a mean or count.
- Respect whether higher or lower values are better and the approved comparator/operator.
- Do not aggregate monthly values by taking an unweighted mean when the approved methodology requires pooling numerators and denominators.
- Preserve raw audit observations and their source; derived results must be reproducible.
- Record auditor, unit, date, reporting period, evidence, validation status, and correction history.

## Patient safety
- Keep incident report, classification, grading, investigation, root-cause analysis, action plan, and effectiveness review as distinct but linked concepts.
- Do not infer incident severity or harm classification from narrative text without an approved rule and human review.
- Protect sensitive event narratives and restrict access by role and operational need.
- Track action owner, due date, completion evidence, reviewer, and effectiveness assessment.

## Risk management
- Keep probability, impact, controllability, inherent risk, residual risk, risk appetite/tolerance, and treatment plan semantically distinct.
- Do not invent scoring matrices or thresholds. Use the approved risk methodology and version.
- Connect risks only when the relationship is explicitly justified and traceable; preserve source risk identity.
- Treatment plans need activity, target period, accountable owner, expected residual score, and monitoring evidence.

## Clinical workforce and pathway
- Resolve staff identity from the approved workforce master; do not create a second identity from free-text names when a stable identity exists.
- Keep OPPE and FPPE distinct, with instrument/version, evaluator, period, score, evidence, and individual export traceability.
- Clinical pathway audit must preserve phase, responsible profession, expected length of stay, variance, and documented rationale.
- Never assign a clinical task to a profession based only on an inferred abbreviation or code.

## Statistics and analytics
- State the unit of analysis, denominator, missingness, time window, aggregation, and uncertainty where relevant.
- Avoid misleading averages, duplicate counting, truncated datasets, and mixing patient-level with encounter-level denominators.
- Use server-side aggregation for large datasets and enforce authorization before aggregation.
- Label descriptive indicators as descriptive; do not imply causal inference from operational trends.

## Excel import/export
- Validate workbook structure, headers, data types, required fields, date/time formats, duplicates, and row-level errors before committing.
- Prefer preview + explicit confirmation + atomic server-side persistence.
- Return row-level actionable errors; do not silently discard invalid rows.
- Neutralize spreadsheet formula injection in text exports.
- Preserve source workbook provenance and import batch identity.

## Acceptance checklist
- Domain owner and authoritative rule identified.
- Calculation tested for normal, boundary, zero-denominator, missing, duplicate, and invalid cases as applicable.
- Role/unit access tested.
- Persistence and audit trail verified.
- Export/import round-trip tested when relevant.
- UI state clearly distinguishes saved, pending, rejected, and validated.
- Regression tests protect existing modules.
