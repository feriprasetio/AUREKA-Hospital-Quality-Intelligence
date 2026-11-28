-- Make every authorization predicate total: only true grants access.
CREATE OR REPLACE FUNCTION aureka_system.can_approve_documents()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_manage_assets()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','MANAGEMENT','KABID']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_manage_controlled_documents()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_manage_education()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP','MANAGEMENT','KABID']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_manage_pmkp_workspace()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP','MANAGEMENT']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_process_spo()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_read_realcost()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','VALIDATOR']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_write_realcost()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP','MANAGEMENT','KABID']::text[]), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.can_access_room_or_global(p_room_id bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND (
    (p_room_id IS NOT NULL AND aureka_system.has_quality_room_access(p_room_id))
    OR (p_room_id IS NULL AND aureka_system.current_role_code() = ANY(ARRAY['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']::text[]))
  ), false);
$$;
CREATE OR REPLACE FUNCTION aureka_system.has_quality_room_access(p_room_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    auth.uid() IS NOT NULL
    AND aureka_system.password_rotation_complete()
    AND aureka_system.current_role_code() IS NOT NULL
    AND (
      aureka_system.current_role_code() IN ('ADMIN','PMKP')
      OR EXISTS (
        SELECT 1 FROM aureka_system.user_profiles AS p
        WHERE p.user_id=(SELECT auth.uid()) AND p.is_active=true AND p.deactivated_at IS NULL
          AND NOT coalesce(p.must_change_password,false) AND p.primary_room_id=p_room_id
      )
      OR EXISTS (
        SELECT 1 FROM aureka_system.user_room_assignments AS a
        WHERE a.user_id=(SELECT auth.uid()) AND a.room_id=p_room_id AND a.is_active=true
      )
    ), false);
$$;
CREATE OR REPLACE FUNCTION public.aureka_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(aureka_system.current_role_code()='ADMIN',false);
$$;
