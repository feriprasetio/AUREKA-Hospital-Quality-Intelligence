# Security review: exact historical scanner exceptions

Nine Gitleaks generic-api-key findings were individually reviewed against the original commit and line. Seven were Supabase publishable browser keys (not privileged keys), and two were synthetic publishable-key test fixtures. Current fixtures are assembled without a literal that triggers generic scanning. The nine exact historical fingerprints in .gitleaksignore are the only exceptions; no rule, path, or key-prefix blanket allowlist is used.

A browser publishable key is intentionally public; it must never replace RLS, role checks, or server-only credentials. Future scan findings must be reviewed independently. Never print actual secret values to CI logs, commit a service-role key, or suppress an unverified finding. No Git history rewriting or credential rotation was needed for these specific verified false positives.
