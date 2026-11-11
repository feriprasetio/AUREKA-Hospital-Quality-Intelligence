-- AUREKA: protected bulk cleanup of PIC and VALIDATOR accounts.
-- Deletes only auth identities whose current profile role is PIC or VALIDATOR.
-- Admin identity and all non-auth operational records are explicitly preserved.
-- Deletion remains subject to FK protections; accounts with linked operational data
-- are deactivated instead of deleted.

CREATE OR REPLACE FUNCTION public.aureka_admin_cleanup_unit_accounts()
RETURNS TABLE(deleted_count integer, deactivated_count integer, protected_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, aureka_system, auth
AS $$
DECLARE
  v_deleted integer := 0;
  v_deactivated integer := 0;
  v_protected integer := 0;
  v_row record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.aureka_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: hanya Super Admin yang dapat membersihkan akun unit'
      USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT up.user_id, ar.code AS role_code
    FROM aureka_system.user_profiles up
    JOIN aureka_system.app_roles ar ON ar.id = up.role_id
    JOIN auth.users au ON au.id = up.user_id
    WHERE upper(ar.code) IN ('PIC', 'VALIDATOR')
      AND up.user_id <> auth.uid()
    ORDER BY up.created_at
  LOOP
    BEGIN
      -- FK-restricted operational rows cause a rollback of this individual deletion.
      DELETE FROM auth.users WHERE id = v_row.user_id;
      IF FOUND THEN
        v_deleted := v_deleted + 1;
      ELSE
        v_protected := v_protected + 1;
      END IF;
    EXCEPTION WHEN foreign_key_violation THEN
      UPDATE aureka_system.user_profiles
         SET is_active = false,
             deactivated_at = COALESCE(deactivated_at, now()),
             updated_at = now()
       WHERE user_id = v_row.user_id;
      UPDATE aureka_system.user_room_assignments
         SET is_active = false
       WHERE user_id = v_row.user_id;
      v_deactivated := v_deactivated + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_deleted, v_deactivated, v_protected;
END;
$$;

REVOKE ALL ON FUNCTION public.aureka_admin_cleanup_unit_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aureka_admin_cleanup_unit_accounts() TO authenticated;
NOTIFY pgrst, 'reload schema';
