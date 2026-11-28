# AUREKA Security Policy

## Supported versions
The current production release from `main` is supported. Security fixes should be tested against a synthetic-data environment before production deployment.

## Reporting a vulnerability
Use GitHub private vulnerability reporting on the repository Security tab if enabled. Otherwise contact the repository owner through an established private channel. Do not disclose vulnerability details, real patient data, credentials, signature images, or other confidential information in a public issue, pull request, CI log, or attachment.

Include a minimal reproduction using synthetic records, affected component and commit, impact, and suggested mitigation. Do not probe production with destructive tests or access records outside your authorization.

## Response
Triage suspected exposure immediately; contain access, rotate compromised credentials, preserve restricted evidence, assess impact and required notification, then remediate and verify. Target acknowledgement within two working days; critical containment as soon as practicable. Coordinate disclosure privately.

## Release security
- Require least privilege, owner MFA, short-lived credentials, and tested backup/rollback.
- Run dependency review, redacted secret scanning, CodeQL, application tests and database authorization tests.
- Keep publishable client keys distinct from privileged secrets; never publish real health records or signature source assets.
- Treat public certificate verification and portal reporting as intentionally public only within their approved scope.
- Do not disable RLS, revoke required RPC permissions indiscriminately, or change clinical calculations solely to silence scanners.
