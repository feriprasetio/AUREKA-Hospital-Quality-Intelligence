# AUREKA — Blueprint Arsitektur Final v2.0

**Tanggal keputusan:** 12 November 2026  
**Instansi:** UPT RSUD Sultan Syarif Mohamad Alkadrie  
**Status:** Architecture baseline for staged implementation

This document consolidates the approved architectural decisions for navigation, longitudinal patient quality profiles, named safety-culture surveys, indicator calculation, risk/action governance, clinical workforce and OPPE/FPPE, E-Regulasi, and access governance.

## 1. Architecture guardrails

- Preserve existing production tables, records, identifiers, routes, and approval history.
- Prefer additive schema changes, compatibility views/RPCs, staged backfills, and feature flags.
- Never rename/drop production tables or columns before dependency inventory, backup, migration rehearsal, and reconciliation.
- Static GitHub Pages frontend is not an authorization boundary. Enforce permissions in Supabase RLS, RPC, storage policies, and database constraints.
- No fake data, inferred clinical targets, silent historical recalculation, or fabricated patient attribution.
- Every sensitive access/export and workflow transition must be auditable.
- Distinguish feature implementation, migration deployed, and runtime behavior verified. A Git push alone proves none of the latter two.

## 2. Navigation

- Beranda is the landing page, shortcuts, pending tasks, and role-scoped notifications.
- Infografis is the sole visual summary page. The former Ikhtisar content is renamed Infografis; do not keep an additional duplicate Infografis menu.
- Operational forms/workspaces have one canonical route each. Home/Infografis links deep-link to the canonical workspace.
- Sidebar and contextual navigation must not duplicate identical navigation sets in the same viewport.
- Canonical route registry and authorization checks must be consistent; hidden navigation is not authorization.

## 3. Patient domain and longitudinal quality profile

- Operational search and patient traceability use No. RM.
- Use immutable internal `patient_id` as technical primary key if No. RM can change or be corrected; otherwise No. RM may be the technical PK only after stability and non-reuse are confirmed. Preserve No. RM as a unique business identifier and display/search key.
- Map historical No. RM changes with identifier history; do not orphan episode or incident links.
- Patient profile is an objective longitudinal view: episode history, outcomes, process indicators, experience, and linked incidents.
- Never label/rank patients as “good/bad”. Incident association is not evidence of patient fault.
- Each observation must retain indicator definition/version, period, source, unit, numerator, denominator, attribution rule, and episode context.
- Show observation counts and suppress/flag unstable interpretations for small n.
- Case-mix adjustment is required where valid for comparative analyses. Do not rank individual patients.
- Records that cannot be validly linked remain aggregate-only; do not force an RM match.

## 4. Indicator engine

Support distinct measurement types: proportion, rate, ratio, waiting time, mean, zero-event/sentinel, and explicitly defined special types. Numerator and denominator semantics are type-specific. Version indicator definitions and preserve historical snapshots, source data, period, engine/rule version, target, and evaluator.

## 5. Patient safety and named annual survey

- Incident and investigation links to a patient must be explicit and valid; retain patient attribution separately from incident actors.
- Named safety-culture survey requires `respondent_person_id` referencing the single HR/person directory and `submitted_by_user_id` as the authenticated account trace.
- A shared account may submit only with explicit respondent selection and confirmation. It is not proof that the selected person physically entered the response.
- Never call the survey anonymous or claim confidentiality inconsistent with named collection.
- Preserve historical anonymous records as legacy; do not fabricate respondent identities.
- Limit access to identified responses. Organizational culture reports should generally be aggregated by unit/group and must not be used as automatic individual punishment.

## 6. Risk and action governance

- A risk control action may address multiple risks via explicit relationship rows.
- RTP, FMEA actions, annual work programs, chair recommendations, and follow-up tasks should converge on one canonical action item model.
- Evaluate effectiveness after implementation; “completed” status alone is not evidence of control effectiveness.
- Risk relationship connectors represent explicit links and are not duplicate risk/action records.

## 7. Clinical quality audit and workforce

- Clinical performance-improvement workspace audits care processes; it is not an individual workforce appraisal.
- OPPE/FPPE live under the clinical workforce domain, using one canonical person identifier and one HR directory.
- Director is one person record; director role and appointment are time-bounded assignments, not duplicate people.
- Preserve historical evaluator, appointment, role, and snapshot identity.

## 8. E-Regulasi

Separate drafting, review, approval, publication, distribution, and version control.
- Approval binds to an immutable document version and file hash.
- Any post-approval content change creates a new version and requires re-approval.
- Preserve superseded/expired versions.
- Store signer identity, role, authentication evidence, time, integrity hash, and audit events.
- Internal “approve” action is not automatically certified electronic signature. Integrate an authorized certified TTE provider when required by policy and law.

## 9. Access governance

Use RBAC plus unit scope, ownership, assignment, and sensitivity; enforce on server/database. Default deny for sensitive individual patient details, named survey answers, incident investigation records, and HR/OPPE/FPPE for Dewan Pengawas and Kepala Bidang. Exceptions require formal assignment, legitimate purpose, expiry, and audit trail. Technical administrators do not automatically receive clinical-content access or audit-log deletion permission.

## 10. Core logical domains

- Patient: patient, patient_identifier_history, patient_episode, patient_quality_observation, patient_incident_link.
- Quality: indicator_master, indicator_version, indicator_logbook, indicator_validation, indicator_result.
- Safety: incident, incident_investigation, incident_action, incident_patient_link.
- Survey: survey_campaign, survey_response, survey_answer, survey_instrument_version.
- Risk: risk_record, risk_assessment, risk_relationship, fmea_record, risk_control_action, control_effectiveness_review.
- Program/action: annual_program, recommendation, action_item, action_assignment, action_evaluation.
- Regulation: regulation_document, regulation_version, approval_workflow, approval_task, electronic_approval, distribution_record, regulation_audit_log.
- Workforce: person, person_profession, person_assignment, team, team_membership, user_account, user_role.
- OPPE/FPPE: oppe_cycle, oppe_result, fppe_case, fppe_evaluation.

Align names to existing database conventions. Do not create a parallel workforce or patient master.

## 11. Staged delivery criteria

0. Baseline, backup, rollback rehearsal, dependency inventory.
1. Navigation and one canonical Infografis.
2. Patient identity mapping and read-only longitudinal profile.
3. Named survey with respondent/person and submitter/account identity.
4. Unified risk/action relationships and effectiveness review.
5. Workforce, appointments, OPPE and FPPE single-person identity.
6. E-Regulasi immutable versioning and approval workflow.
7. Granular RBAC/RLS, audit of sensitive reads/exports and break-glass.
8. Unit acceptance, negative authorization tests, reconciliation, rollback, gradual release.

## 12. Decisions requiring institutional confirmation

- Stability and reuse policy of No. RM in SIMRS.
- Master source and sync/reconciliation contracts for patient, episode, workforce, unit, indicator, and account.
- Whether shared accounts remain allowed for named survey collection; stronger identity proof requires personal accounts or step-up confirmation.
- Whether E-Regulasi approval requires certified TTE and which authorized provider is used.
- Final granular permission matrix, acting Director policy, and data scope for Dewas/Kabid.
