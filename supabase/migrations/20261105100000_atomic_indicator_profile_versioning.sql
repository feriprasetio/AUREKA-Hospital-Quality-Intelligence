-- Atomically retire the active indicator profile and publish its replacement.
-- RLS remains active: this SECURITY INVOKER function only runs with the caller's grants/policies.

CREATE OR REPLACE FUNCTION aureka_quality.publish_indicator_profile_version(
  p_prior_id uuid,
  p_profile jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_old_version integer;
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menerbitkan versi indikator.' USING ERRCODE = '28000';
  END IF;

  IF NOT aureka_system.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya Superadmin yang dapat menerbitkan versi Kamus Indikator.' USING ERRCODE = '42501';
  END IF;

  IF p_prior_id IS NULL OR p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Identitas versi lama dan metadata versi baru wajib valid.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_profile->>'code', '') = ''
     OR coalesce(p_profile->>'title', '') = ''
     OR coalesce(p_profile->>'room_id', '') !~ '^[0-9]+$'
     OR coalesce(p_profile->>'profile_year', '') !~ '^[0-9]{4}$'
     OR coalesce(p_profile->>'version', '') !~ '^[0-9]+$'
     OR coalesce(p_profile->>'status', '') <> 'published'
     OR coalesce(p_profile->>'is_active', 'false') <> 'true'
     OR coalesce(jsonb_typeof(p_profile->'schema_json'), '') <> 'object'
     OR coalesce(jsonb_typeof(p_profile->'options_json'), '') <> 'array' THEN
    RAISE EXCEPTION 'Metadata versi baru tidak lengkap atau tidak valid.' USING ERRCODE = '22023';
  END IF;

  SELECT version
    INTO v_old_version
    FROM aureka_quality.indicator_profiles
   WHERE id = p_prior_id
     AND status = 'published'
     AND is_active = true
   FOR UPDATE;

  IF v_old_version IS NULL THEN
    RAISE EXCEPTION 'Versi indikator aktif tidak ditemukan. Muat ulang Kamus Indikator.' USING ERRCODE = 'P0002';
  END IF;

  IF (p_profile->>'version')::integer <> v_old_version + 1 THEN
    RAISE EXCEPTION 'Nomor versi baru tidak berurutan. Muat ulang Kamus Indikator sebelum menerbitkan.' USING ERRCODE = '22023';
  END IF;

  UPDATE aureka_quality.indicator_profiles
     SET status = 'retired',
         is_active = false,
         updated_by = v_user_id
   WHERE id = p_prior_id
     AND status = 'published'
     AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versi aktif berubah selama publikasi; transaksi dibatalkan.' USING ERRCODE = '40001';
  END IF;

  INSERT INTO aureka_quality.indicator_profiles (
    profile_year, code, room_id, unit_name, title, indicator_type, category,
    unit_of_measure, target_text, target_operator, target_value,
    numerator_definition, denominator_definition, measurement_grain,
    schema_json, options_json, version, status, is_active, created_by, updated_by
  )
  VALUES (
    (p_profile->>'profile_year')::integer,
    p_profile->>'code',
    (p_profile->>'room_id')::bigint,
    coalesce(p_profile->>'unit_name', ''),
    p_profile->>'title',
    nullif(p_profile->>'indicator_type', ''),
    nullif(p_profile->>'category', ''),
    nullif(p_profile->>'unit_of_measure', ''),
    nullif(p_profile->>'target_text', ''),
    coalesce(nullif(p_profile->>'target_operator', ''), '='),
    nullif(p_profile->>'target_value', '')::numeric,
    nullif(p_profile->>'numerator_definition', ''),
    nullif(p_profile->>'denominator_definition', ''),
    coalesce(nullif(p_profile->>'measurement_grain', ''), 'activity'),
    coalesce(p_profile->'schema_json', '{}'::jsonb),
    coalesce(p_profile->'options_json', '[]'::jsonb),
    (p_profile->>'version')::integer,
    'published',
    true,
    v_user_id,
    v_user_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.publish_indicator_profile_version(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.publish_indicator_profile_version(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.publish_indicator_profile_version(uuid, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.publish_indicator_profile_version(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.publish_indicator_profile_version(uuid, jsonb) IS
'Atomically retires and replaces an active published indicator profile version. SECURITY INVOKER, superadmin-only, and protected by existing RLS policies.';
