-- Privileged role helpers must return no access while the first-password flag is set.
CREATE OR REPLACE FUNCTION aureka_system.current_role_code()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT r.code
  FROM aureka_system.user_profiles p
  JOIN aureka_system.app_roles r ON r.id=p.role_id
  WHERE p.user_id=(SELECT auth.uid())
    AND p.is_active=true
    AND r.is_active=true
    AND NOT coalesce(p.must_change_password,false)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION aureka_risk.current_role_code()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT ar.code
  FROM aureka_system.user_profiles up
  JOIN aureka_system.app_roles ar ON ar.id=up.role_id
  WHERE up.user_id=(SELECT auth.uid())
    AND up.is_active=true
    AND ar.is_active=true
    AND NOT coalesce(up.must_change_password,false)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION aureka_risk.current_primary_room_id()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT up.primary_room_id
  FROM aureka_system.user_profiles up
  WHERE up.user_id=(SELECT auth.uid())
    AND up.is_active=true
    AND NOT coalesce(up.must_change_password,false)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION aureka_patient_safety.can_manage_workflow()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM aureka_system.user_profiles up
    JOIN aureka_system.app_roles ar ON ar.id=up.role_id
    WHERE up.user_id=(SELECT auth.uid())
      AND up.is_active=true
      AND NOT coalesce(up.must_change_password,false)
      AND ar.is_active=true
      AND ar.code IN ('ADMIN','PMKP','MANAGEMENT')
  );
$$;

CREATE OR REPLACE FUNCTION public.aureka_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, aureka_system
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM aureka_system.user_profiles up
    JOIN aureka_system.app_roles ar ON ar.id=up.role_id
    WHERE up.user_id=(SELECT auth.uid())
      AND up.is_active=true
      AND NOT coalesce(up.must_change_password,false)
      AND ar.code='ADMIN'
      AND ar.is_active=true
  );
$$;

NOTIFY pgrst, 'reload schema';
