# AUREKA migration reconciliation and performance verification

## Why automatic replay is blocked

The Supabase migration history and the repository contain different timestamp versions for many migrations that have the same name. A timestamp mismatch is **not** proof that a migration has not been applied. Never run `supabase db reset`, blindly run `db push`, or bulk-repair the migration table in production. Do not replay cleanup/reset or backup-restore migrations.

## Read-only reconciliation procedure

1. Export `supabase_migrations.schema_migrations` from production (versions only) and list `supabase/migrations/*.sql` in GitHub.
2. Compare **version and name**, not version alone. Confirm each matched-name migration's effects against `pg_catalog` and the corresponding SQL; identical names are not proof of identical content.
3. Review migrations that exist only in production separately from those that exist only in GitHub. Do not mark either side applied merely to silence a drift warning.
4. Take and verify a database backup and restoration plan before changing schema or migration history.
5. Apply **one reviewed additive migration** at a time using Supabase's migration tool, which records the actual applied version; verify `pg_indexes`, RLS, permissions, and logs after each step.
6. Preserve existing patient, quality, and audit data. Treat destructive migration history changes as a separate reviewed operation.

## Index verification

The additive migration `20261122170000_quality_records_room_year_sort_performance.sql` creates `quality_records_room_year_created_desc_idx`. It supports the common `room_id = ? AND profile_year = ? ORDER BY created_at DESC` read path. It is **not** intended to resolve all timeout causes.

Read-only verification:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'aureka_quality'
  AND tablename = 'quality_records'
  AND indexname = 'quality_records_room_year_created_desc_idx';

SELECT calls, round(mean_exec_time::numeric, 1) AS mean_ms,
       round(max_exec_time::numeric, 1) AS max_ms,
       left(query, 220) AS query
FROM pg_stat_statements
WHERE query ILIKE '%quality_records%'
ORDER BY total_exec_time DESC
LIMIT 15;
```

Historical `pg_stat_statements` data mixes before/after samples. Compare new time windows under equivalent load; check `EXPLAIN (ANALYZE, BUFFERS)` only on non-mutating SELECT statements with appropriately restricted access. Do not treat a green CI build as a production latency benchmark.

## Remaining independent checks

- Verify responsive UI, login, registration, all modules, and accessibility in a real browser at mobile and desktop widths.
- Review auth leaked-password protection in the Supabase Auth dashboard.
- Verify authorization for every public RPC and role, especially `SECURITY DEFINER` routines; avoid revoking privileges on trigger functions without checking dependencies.
- Confirm data counts and backup availability before running data migrations or imports.
- Monitor PostgREST timeouts and query plans after the new index is applied.
