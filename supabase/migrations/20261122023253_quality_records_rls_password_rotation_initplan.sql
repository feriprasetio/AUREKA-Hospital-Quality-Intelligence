-- Statement-level caching for the password-rotation guard on quality_records.
-- Applied to production via Supabase migration 20261122023253.
-- No access rule changes: the existing RESTRICTIVE / authenticated / ALL
-- policy and both USING / WITH CHECK predicates remain enforced.
-- The STABLE, row-independent function is evaluated as an InitPlan,
-- instead of once per row. The room-specific RLS condition remains unchanged.
ALTER POLICY require_password_rotation_complete
ON aureka_quality.quality_records
USING ((SELECT aureka_system.password_rotation_complete()))
WITH CHECK ((SELECT aureka_system.password_rotation_complete()));
