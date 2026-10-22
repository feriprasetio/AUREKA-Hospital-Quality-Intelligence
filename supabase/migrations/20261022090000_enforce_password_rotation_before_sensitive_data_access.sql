-- Block data API access for newly provisioned users until they change their initial password.
CREATE OR REPLACE FUNCTION aureka_system.password_rotation_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT coalesce((
    SELECT p.is_active AND NOT p.must_change_password
    FROM aureka_system.user_profiles p
    WHERE p.user_id = (SELECT auth.uid())
  ), false);
$$;

REVOKE ALL ON FUNCTION aureka_system.password_rotation_complete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_system.password_rotation_complete() TO authenticated;

-- Restrictive policies are ANDed with existing per-table policies: the normal
-- room/role rules still apply after the password-rotation gate opens.
DO $$
DECLARE
  r record;
  policy_exists boolean;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('aureka_quality','aureka_patient_safety','aureka_risk','aureka_analytics')
    ORDER BY schemaname, tablename
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname=r.schemaname
        AND tablename=r.tablename
        AND policyname='require_password_rotation_complete'
    ) INTO policy_exists;
    IF NOT policy_exists THEN
      EXECUTE format(
        'CREATE POLICY require_password_rotation_complete ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (aureka_system.password_rotation_complete()) WITH CHECK (aureka_system.password_rotation_complete())',
        r.schemaname, r.tablename
      );
    END IF;
  END LOOP;
END $$;

-- The first-login completion RPC remains the only route for clearing the flag;
-- it verifies the Auth account updated_at timestamp before updating the profile.
NOTIFY pgrst, 'reload schema';
