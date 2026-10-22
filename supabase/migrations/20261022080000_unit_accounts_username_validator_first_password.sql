-- Unit PIC/Validator accounts, username login, and enforced first-login password rotation.
BEGIN;

ALTER TABLE aureka_system.user_profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS must_change_password_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE OR REPLACE FUNCTION aureka_system.normalize_username(p text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = aureka_system, public
AS $$
  SELECT NULLIF(trim(both '.' from regexp_replace(lower(trim(coalesce(p,''))), '[^a-z0-9._-]+', '', 'g')), '');
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_lower_uidx
  ON aureka_system.user_profiles (lower(username))
  WHERE username IS NOT NULL;

-- Existing accounts keep working; assign a unique username only when absent.
DO $$
DECLARE r record; base text; candidate text; suffix integer;
BEGIN
  FOR r IN SELECT user_id,email FROM aureka_system.user_profiles WHERE username IS NULL ORDER BY created_at LOOP
    base := left(coalesce(aureka_system.normalize_username(split_part(coalesce(r.email,''),'@',1)),''),24);
    IF length(coalesce(base,'')) < 3 THEN base := 'user'; END IF;
    candidate := base; suffix := 1;
    WHILE EXISTS(SELECT 1 FROM aureka_system.user_profiles p WHERE lower(p.username)=lower(candidate) AND p.user_id<>r.user_id) LOOP
      suffix := suffix + 1;
      candidate := left(base, greatest(3, 29-length(suffix::text))) || suffix::text;
    END LOOP;
    UPDATE aureka_system.user_profiles SET username=candidate WHERE user_id=r.user_id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION aureka_system.fill_username_from_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aureka_system, auth, public
AS $$
DECLARE v text;
BEGIN
  IF NEW.username IS NULL THEN
    SELECT aureka_system.normalize_username(u.raw_user_meta_data->>'username')
      INTO v FROM auth.users u WHERE u.id=NEW.user_id;
    IF v IS NOT NULL AND length(v) BETWEEN 3 AND 30
       AND NOT EXISTS (SELECT 1 FROM aureka_system.user_profiles p WHERE lower(p.username)=v AND p.user_id<>NEW.user_id) THEN
      NEW.username := v;
    END IF;
  ELSE
    NEW.username := aureka_system.normalize_username(NEW.username);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_username_from_signup ON aureka_system.user_profiles;
CREATE TRIGGER fill_username_from_signup
BEFORE INSERT OR UPDATE OF username ON aureka_system.user_profiles
FOR EACH ROW EXECUTE FUNCTION aureka_system.fill_username_from_signup();

INSERT INTO aureka_system.app_roles(code,name,description,is_active)
VALUES ('VALIDATOR','Validator unit','Memeriksa dan memvalidasi catatan mutu pada unit yang ditetapkan.',true)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, description=EXCLUDED.description, is_active=true, updated_at=now();

CREATE OR REPLACE FUNCTION aureka_system.guard_user_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, aureka_system
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.aureka_is_admin() THEN
    NEW.role_id := OLD.role_id;
    NEW.is_active := OLD.is_active;
    NEW.primary_room_id := OLD.primary_room_id;
    IF current_setting('aureka.allow_password_flag_reset', true) IS DISTINCT FROM 'on' THEN
      NEW.must_change_password := OLD.must_change_password;
      NEW.must_change_password_at := OLD.must_change_password_at;
    END IF;
  END IF;
  IF NEW.username IS NOT NULL THEN
    NEW.username := aureka_system.normalize_username(NEW.username);
    IF length(NEW.username) < 3 OR length(NEW.username) > 30 OR NEW.username !~ '^[a-z0-9][a-z0-9._-]*$' THEN
      RAISE EXCEPTION 'USERNAME_INVALID: Username 3–30 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_profile_security_fields ON aureka_system.user_profiles;
CREATE TRIGGER guard_user_profile_security_fields
BEFORE UPDATE ON aureka_system.user_profiles
FOR EACH ROW EXECUTE FUNCTION aureka_system.guard_user_profile_security_fields();

CREATE OR REPLACE FUNCTION public.aureka_login_email(p_username text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT up.email
  FROM aureka_system.user_profiles up
  WHERE lower(up.username)=aureka_system.normalize_username(p_username)
    AND up.is_active=true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.aureka_username_available(p_username text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT aureka_system.normalize_username(p_username) IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM aureka_system.user_profiles up
                   WHERE lower(up.username)=aureka_system.normalize_username(p_username));
$$;

DROP FUNCTION IF EXISTS public.aureka_get_my_profile();
CREATE FUNCTION public.aureka_get_my_profile()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  primary_room_id bigint,
  role_id uuid,
  is_active boolean,
  role_code text,
  role_name text,
  role_description text,
  username text,
  must_change_password boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, aureka_system
AS $$
  SELECT up.user_id, up.full_name, up.email, up.primary_room_id, up.role_id,
         up.is_active, ar.code, ar.name, ar.description, up.username, up.must_change_password
  FROM aureka_system.user_profiles up
  LEFT JOIN aureka_system.app_roles ar ON ar.id=up.role_id
  WHERE up.user_id=(SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.aureka_get_my_account()
RETURNS TABLE(username text,email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, auth, public
AS $$
  SELECT up.username, coalesce(u.email,up.email)
  FROM aureka_system.user_profiles up
  LEFT JOIN auth.users u ON u.id=up.user_id
  WHERE up.user_id=(SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.aureka_set_my_username(p_username text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
DECLARE v text := aureka_system.normalize_username(p_username);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Belum login'; END IF;
  IF v IS NULL OR length(v)<3 OR length(v)>30 OR v !~ '^[a-z0-9][a-z0-9._-]*$' THEN
    RAISE EXCEPTION 'USERNAME_INVALID: Username 3–30 karakter.';
  END IF;
  BEGIN
    UPDATE aureka_system.user_profiles SET username=v,updated_at=now() WHERE user_id=auth.uid();
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'USERNAME_TAKEN: Username sudah dipakai akun lain.';
  END;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.aureka_complete_first_login_password_change()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, aureka_system, auth
AS $$
DECLARE v_required boolean; v_flag_at timestamptz; v_auth_updated timestamptz; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Belum login'; END IF;
  SELECT up.must_change_password,up.must_change_password_at,u.updated_at
    INTO v_required,v_flag_at,v_auth_updated
  FROM aureka_system.user_profiles up
  JOIN auth.users u ON u.id=up.user_id
  WHERE up.user_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil akun tidak ditemukan'; END IF;
  IF NOT v_required THEN RETURN true; END IF;
  IF v_auth_updated IS NULL OR (v_flag_at IS NOT NULL AND v_auth_updated<=v_flag_at) THEN
    RAISE EXCEPTION 'PASSWORD_CHANGE_REQUIRED: Ubah password akun terlebih dahulu.';
  END IF;
  PERFORM set_config('aureka.allow_password_flag_reset','on',true);
  UPDATE aureka_system.user_profiles
    SET must_change_password=false,must_change_password_at=NULL,updated_at=now()
    WHERE user_id=v_uid;
  PERFORM set_config('aureka.allow_password_flag_reset','off',true);
  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.aureka_admin_list_users_v3();
CREATE FUNCTION public.aureka_admin_list_users_v3()
RETURNS TABLE(
  user_id uuid,full_name text,email text,username text,primary_room_id bigint,role_id uuid,
  is_active boolean,created_at timestamptz,deactivated_at timestamptz,must_change_password boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = aureka_system, public
AS $$
  SELECT up.user_id,up.full_name,up.email,up.username,up.primary_room_id,up.role_id,
         up.is_active,up.created_at,up.deactivated_at,up.must_change_password
  FROM aureka_system.user_profiles up
  WHERE public.aureka_is_admin()
  ORDER BY up.is_active,lower(up.full_name);
$$;

CREATE OR REPLACE FUNCTION public.aureka_admin_update_user_profile(
  p_user_id uuid,p_full_name text,p_primary_room_id bigint,p_role_id uuid,p_is_active boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, aureka_system
AS $$
BEGIN
  IF NOT public.aureka_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN: administrator role required'; END IF;
  UPDATE aureka_system.user_profiles
  SET full_name=nullif(trim(p_full_name),''), primary_room_id=p_primary_room_id,
      role_id=p_role_id, is_active=p_is_active,
      deactivated_at=CASE WHEN p_is_active THEN NULL ELSE coalesce(deactivated_at,now()) END,
      updated_at=now()
  WHERE user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;
  RETURN true;
END;
$$;

ALTER TABLE aureka_quality.quality_records
  ADD COLUMN IF NOT EXISTS validation_note text;

CREATE OR REPLACE FUNCTION public.aureka_validator_review_quality_record(
  p_record_id uuid,p_decision text,p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, aureka_system, aureka_quality
AS $$
DECLARE v_room bigint; v_entered uuid; v_status text; v_role text := aureka_system.current_role_code();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Belum login'; END IF;
  IF v_role NOT IN ('VALIDATOR','ADMIN','PMKP') THEN RAISE EXCEPTION 'FORBIDDEN: role validator diperlukan' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('validated','reopened') THEN RAISE EXCEPTION 'Keputusan validasi tidak dikenal'; END IF;
  SELECT room_id,entered_by,status INTO v_room,v_entered,v_status
  FROM aureka_quality.quality_records WHERE id=p_record_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catatan mutu tidak ditemukan'; END IF;
  IF NOT aureka_system.has_quality_room_access(v_room) THEN RAISE EXCEPTION 'FORBIDDEN: tidak memiliki akses ke unit ini' USING ERRCODE='42501'; END IF;
  IF v_role='VALIDATOR' AND v_entered=auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN: validator tidak dapat memvalidasi catatannya sendiri' USING ERRCODE='42501'; END IF;
  IF v_status='archived' THEN RAISE EXCEPTION 'Catatan arsip tidak dapat divalidasi'; END IF;
  UPDATE aureka_quality.quality_records
  SET status=p_decision,
      review_required=(p_decision<>'validated'),
      validated_by=auth.uid(),
      validated_at=now(),
      validation_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  WHERE id=p_record_id;
  INSERT INTO aureka_quality.audit_log(actor_id,action,table_name,record_id,before_json,after_json,created_at)
  VALUES(
    auth.uid(),
    CASE WHEN p_decision='validated' THEN 'UNIT_VALIDATED' ELSE 'UNIT_RETURNED_FOR_CORRECTION' END,
    'quality_records',
    p_record_id,
    jsonb_build_object('status',v_status),
    jsonb_build_object('status',p_decision,'validation_note',nullif(trim(coalesce(p_note,'')),''),'room_id',v_room),
    now()
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.aureka_login_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aureka_username_available(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aureka_get_my_profile() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.aureka_get_my_account() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.aureka_set_my_username(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.aureka_complete_first_login_password_change() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.aureka_admin_list_users_v3() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.aureka_admin_update_user_profile(uuid,text,bigint,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.aureka_validator_review_quality_record(uuid,text,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.aureka_login_email(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_username_available(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_get_my_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_set_my_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_complete_first_login_password_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_admin_list_users_v3() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_admin_update_user_profile(uuid,text,bigint,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aureka_validator_review_quality_record(uuid,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
