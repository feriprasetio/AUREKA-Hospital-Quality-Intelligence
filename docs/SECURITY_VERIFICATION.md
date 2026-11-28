# Continuous security verification

This checklist describes the required controls, not a declaration of compliance or the results of a penetration test. Keep detailed findings and evidence in an access-controlled register, not this public repository.

| Domain | Required verification |
| --- | --- |
| Identity | MFA, token expiry, password security, session revocation, role assignment |
| Repository | Rulesets/branch protection, least privilege, signed commits when compatible, private reporting |
| Supply chain | Locked dependencies, dependency review, redacted history and working-tree scans, pinned CI actions |
| Application | OWASP ASVS-based review, XSS and input validation, browser storage and synthetic DAST |
| API and database | RLS deny-by-default, RPC authorization, schema/execute grants, views, Edge JWT checks, abuse limits |
| Clinical data | Cross-room denial, role matrix, minimal exports, audit trail and no production data in public assets |
| Public portal | Approved snapshots, small-cohort suppression, verification token scope, no sensitive data |
| Signatures | Asset access, authorization and revocation, integrity, QR privacy, distinction from certified signatures |
| Resilience | Backup restoration, rollback, incident response, CI and production smoke verification |

For each finding capture the exact revision, evidence, severity rationale, proposed fix, regression test, reviewer, and retest outcome. Use synthetic identities and records. Do not label an advisory as an exploitable vulnerability until demonstrated. A passing scanner alone does not establish security. Owner-only controls must be verified separately in GitHub/Supabase settings.
