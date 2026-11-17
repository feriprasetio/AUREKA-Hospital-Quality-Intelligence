-- The guarded deletion RPC must inspect proposal references in a schema
-- that is intentionally not exposed to ordinary authenticated clients.
-- Run the function as its owner, while retaining its explicit Superadmin
-- check, fixed search_path, and authenticated-only EXECUTE grant.
ALTER FUNCTION aureka_quality.delete_unused_indicator_profile(uuid)
  SECURITY DEFINER;

ALTER FUNCTION aureka_quality.delete_unused_indicator_profile(uuid)
  SET search_path TO pg_catalog, aureka_quality, aureka_governance, aureka_system, auth;

REVOKE ALL ON FUNCTION aureka_quality.delete_unused_indicator_profile(uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION aureka_quality.delete_unused_indicator_profile(uuid)
  TO authenticated;

COMMENT ON FUNCTION aureka_quality.delete_unused_indicator_profile(uuid) IS
'Security-definer administrative RPC. Executes only after verifying auth.uid() and aureka_system.is_superadmin(); checks all profile references and deletes only retired/draft inactive profiles. The fixed search_path prevents object shadowing.';
