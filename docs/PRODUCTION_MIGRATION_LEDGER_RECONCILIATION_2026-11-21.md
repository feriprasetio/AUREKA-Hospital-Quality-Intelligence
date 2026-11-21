# Production migration ledger reconciliation · 21 November 2026

Source: live project `ktukmjscopggkzrkgnzp`, GitHub `main`, inspected with read-only Supabase queries. These counts reflect a point-in-time snapshot, **not** proof that the SQL bodies match.

| Category | Count |
| --- | ---: |
| Applied migration versions in production | 212 |
| Versioned SQL files in GitHub | 206 |
| Matching version IDs | 90 |
| Different version IDs with the same migration name | 81 |
| Applied versions without same-version or same-name file | 41 |
| GitHub files without same-version or same-name production entry | 35 |
| Version ID collision with different displayed name | 2 |

**WARNING:** One migration name (`enforce_pdsa_pdca_cycle_completeness`) appears in multiple production versions. This is ambiguous and must not be automatically reconciled.

The version mismatches largely reflect timestamp-at-apply behavior. Examples:

| Production version | Repo filename version | Name |
|---|---|---|
| 20261121142958 | 20261122140000 | recommendation_code_sequence_integrity |
| 20261121142925 | 20261122150000 | signup_active_rooms_column_rls |
| 20261121143335 | 20261122160000 | admin_password_reset_server_rate_limit |
| 20261121145428 | 20261122170000 | quality_records_room_year_sort_performance |

## Safely diagnose

1. Export the production migration ledger as JSON `{"migrations":[{"version":"20261121142958","name":"recommendation_code_sequence_integrity"}]}`, including **all** entries, without credentials.
2. Run `node scripts/audit-supabase-migration-ledger.mjs path/to/migrations.json`. It returns a machine-readable comparison and exits nonzero if drift remains.
3. Distinguish timestamp aliases from source changes by checking the SQL definition, function signatures, constraints, grants, RLS and index state on an isolated staging copy. **A name match does not verify a checksum.**
4. Review unapplied production-only and repo-only changes individually, respecting dependencies and effective schema.
5. Establish a new versioned baseline only after approved backup and schema comparison; never replay all files or insert fake migration-history rows.

## Guardrails

- Read-only checker; no database credentials, SQL execution, migrations, or auth data in this repository script.
- Do not run `supabase db reset`, force schema push, or modify `supabase_migrations.schema_migrations` to cosmetically clear drift.
- Post-release follow-up must compare the actual live schema, not only migration names.
- Real production counts are recorded in issue #586. Run the checker on a fresh ledger export after any future schema change.
