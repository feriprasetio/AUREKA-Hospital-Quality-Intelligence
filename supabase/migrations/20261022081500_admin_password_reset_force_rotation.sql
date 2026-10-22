-- Admin password reset for accounts without a deliverable email: force rotation at next login.
DROP FUNCTION IF EXISTS public.aureka_admin_set_user_password(uuid,text);
CREATE FUNCTION public.aureka_admin_set_user_password(p_user_id uuid,p_new_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, aureka_system, auth, extensions
AS $$
BEGIN
  IF NOT public.aureka_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: hanya Super Admin yang dapat menyetel password';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password)<12 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT: Password minimal 12 karakter';
  END IF;
  UPDATE auth.users
    SET encrypted_password=extensions.crypt(p_new_password,extensions.gen_salt('bf')),
        email_confirmed_at=coalesce(email_confirmed_at,now()),
        confirmed_at=coalesce(confirmed_at,now()),
        updated_at=clock_timestamp()
    WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun tidak ditemukan'; END IF;
  UPDATE aureka_system.user_profiles
    SET must_change_password=true,must_change_password_at=clock_timestamp(),updated_at=now()
    WHERE user_id=p_user_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.aureka_admin_set_user_password(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aureka_admin_set_user_password(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
