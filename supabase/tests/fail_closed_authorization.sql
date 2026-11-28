-- Read-only, synthetic authorization checks. Run in a transaction on the database.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated"}',true);
DO $$
BEGIN
  IF auth.uid() IS NULL OR aureka_system.current_role_code() IS NOT NULL THEN RAISE EXCEPTION 'Synthetic test identity is not isolated'; END IF;
  IF aureka_system.can_approve_documents() IS DISTINCT FROM false
     OR aureka_system.can_manage_assets() IS DISTINCT FROM false
     OR aureka_system.can_manage_controlled_documents() IS DISTINCT FROM false
     OR aureka_system.can_manage_education() IS DISTINCT FROM false
     OR aureka_system.can_manage_pmkp_workspace() IS DISTINCT FROM false
     OR aureka_system.can_process_spo() IS DISTINCT FROM false
     OR aureka_system.can_read_realcost() IS DISTINCT FROM false
     OR aureka_system.can_write_realcost() IS DISTINCT FROM false
     OR aureka_system.can_access_room_or_global(NULL) IS DISTINCT FROM false
     OR aureka_system.has_quality_room_access(1) IS DISTINCT FROM false
     OR public.aureka_is_admin() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Fail-closed authorization regression';
  END IF;
  IF has_function_privilege('anon','public.aureka_login_email(text)','EXECUTE') OR has_function_privilege('authenticated','public.aureka_login_email(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous email lookup regression';
  END IF;
END $$;
ROLLBACK;
