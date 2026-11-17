-- Unit-scoped live profile editing and guarded permanent deletion.
-- Edited profiles are versioned; audit records and earlier versions remain intact.

CREATE OR REPLACE FUNCTION aureka_quality.publish_indicator_profile_batch(
  p_profile_year integer,
  p_room_id bigint,
  p_profiles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_prior_id uuid;
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_new_id uuid;
  v_new_version integer;
  v_code text;
  v_title text;
  v_grain text;
  v_measurement_type text;
  v_direction text;
  v_seen_ids text[] := ARRAY[]::text[];
  v_seen_codes text[] := ARRAY[]::text[];
  v_results jsonb := '[]'::jsonb;
  v_updated integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menyimpan perubahan profil indikator.' USING ERRCODE = '28000';
  END IF;

  IF NOT aureka_system.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya Superadmin yang dapat mengubah profil indikator.' USING ERRCODE = '42501';
  END IF;

  IF p_profile_year IS NULL OR p_profile_year < 1900 OR p_profile_year > 2200
     OR p_room_id IS NULL OR p_room_id < 1
     OR NOT EXISTS (SELECT 1 FROM public.master_rooms r WHERE r.id = p_room_id) THEN
    RAISE EXCEPTION 'Tahun atau unit profil indikator tidak valid.' USING ERRCODE = '22023';
  END IF;

  IF p_profiles IS NULL OR jsonb_typeof(p_profiles) <> 'array'
     OR jsonb_array_length(p_profiles) < 1
     OR jsonb_array_length(p_profiles) > 250 THEN
    RAISE EXCEPTION 'Batch harus memuat 1 sampai 250 profil yang diubah.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('aureka_quality.indicator_profile_batch:' || p_profile_year::text || ':' || p_room_id::text, 0)
  );

  -- Validate and lock every current profile before writing any new version.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_profiles)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Setiap perubahan harus berupa objek profil.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_item->>'prior_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Identitas profil sumber tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_prior_id := (v_item->>'prior_id')::uuid;

    IF v_prior_id::text = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'Profil yang sama muncul lebih dari sekali dalam batch.' USING ERRCODE = '23505';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_prior_id::text);

    SELECT *
      INTO v_old
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.id = v_prior_id
       AND ip.profile_year = p_profile_year
       AND ip.room_id = p_room_id
       AND ip.status = 'published'
       AND ip.is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil aktif berubah atau tidak ditemukan. Muat ulang editor unit sebelum menyimpan.' USING ERRCODE = '40001';
    END IF;

    v_code := btrim(coalesce(v_item->>'code', ''));
    v_title := btrim(coalesce(v_item->>'title', ''));
    v_grain := coalesce(nullif(btrim(v_item->>'measurement_grain'), ''), 'activity');
    v_measurement_type := lower(btrim(coalesce(v_item->'schema_json'->>'measurement_type', '')));
    v_direction := lower(btrim(coalesce(v_item->'schema_json'->>'indicator_direction', '')));

    -- Codes are immutable in live batch editing. Use the dedicated XLSX set-transfer
    -- workflow when an approved code migration and history re-keying are required.
    IF v_code = '' OR v_code <> v_old.code OR v_title = '' THEN
      RAISE EXCEPTION 'Kode indikator tidak boleh diubah melalui editor batch; nama indikator wajib diisi.' USING ERRCODE = '22023';
    END IF;

    IF v_code = ANY(v_seen_codes) THEN
      RAISE EXCEPTION 'Kode indikator duplikat dalam batch: %.', v_code USING ERRCODE = '23505';
    END IF;
    v_seen_codes := array_append(v_seen_codes, v_code);

    IF coalesce(v_item->>'profile_year', '') <> p_profile_year::text
       OR coalesce(v_item->>'room_id', '') <> p_room_id::text
       OR coalesce(v_item->>'version', '') !~ '^[0-9]+$'
       OR (v_item->>'version')::integer <> v_old.version + 1
       OR coalesce(v_item->>'status', '') <> 'published'
       OR coalesce(v_item->>'is_active', 'false') <> 'true' THEN
      RAISE EXCEPTION 'Identitas unit/tahun, status, atau nomor versi profil % tidak konsisten.', v_code USING ERRCODE = '22023';
    END IF;

    IF v_grain NOT IN ('patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate') THEN
      RAISE EXCEPTION 'Grain pengukuran indikator % tidak valid.', v_code USING ERRCODE = '22023';
    END IF;

    IF v_measurement_type NOT IN ('ratio', 'compliance', 'visit', 'door', 'minutes', 'numeric', 'occurrence') THEN
      RAISE EXCEPTION 'Tipe pengukuran indikator % wajib dipilih dari daftar tipe yang didukung.', v_code USING ERRCODE = '22023';
    END IF;

    IF v_direction NOT IN ('positive', 'negative') THEN
      RAISE EXCEPTION 'Arah indikator % wajib Positif atau Negatif.', v_code USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_item->'schema_json') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'options_json') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Konfigurasi teknis atau opsi indikator % tidak valid.', v_code USING ERRCODE = '22023';
    END IF;

    IF coalesce(nullif(v_item->>'target_operator', ''), '=') NOT IN ('=', '>=', '<=', '>', '<') THEN
      RAISE EXCEPTION 'Operator target indikator % tidak valid.', v_code USING ERRCODE = '22023';
    END IF;

    IF nullif(v_item->>'target_value', '') IS NOT NULL
       AND (v_item->>'target_value')::numeric IS NULL THEN
      RAISE EXCEPTION 'Nilai target indikator % harus numerik atau kosong.', v_code USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Only after all rows pass validation, create versioned replacements.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_profiles)
  LOOP
    v_prior_id := (v_item->>'prior_id')::uuid;
    SELECT *
      INTO v_old
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.id = v_prior_id
     FOR UPDATE;

    UPDATE aureka_quality.indicator_profiles
       SET status = 'retired',
           is_active = false,
           updated_by = v_user_id,
           updated_at = now()
     WHERE id = v_prior_id
       AND status = 'published'
       AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil % berubah saat penyimpanan batch; seluruh transaksi dibatalkan.', v_old.code USING ERRCODE = '40001';
    END IF;

    INSERT INTO aureka_quality.indicator_profiles (
      profile_year, code, room_id, unit_name, title, indicator_type, category,
      unit_of_measure, target_text, target_operator, target_value,
      numerator_definition, denominator_definition, measurement_grain,
      schema_json, options_json, version, status, is_active, created_by, updated_by
    )
    VALUES (
      p_profile_year,
      v_old.code,
      p_room_id,
      coalesce(nullif(btrim(v_item->>'unit_name'), ''), v_old.unit_name),
      btrim(v_item->>'title'),
      nullif(btrim(v_item->>'indicator_type'), ''),
      nullif(btrim(v_item->>'category'), ''),
      nullif(btrim(v_item->>'unit_of_measure'), ''),
      nullif(btrim(v_item->>'target_text'), ''),
      coalesce(nullif(btrim(v_item->>'target_operator'), ''), '='),
      nullif(v_item->>'target_value', '')::numeric,
      nullif(btrim(v_item->>'numerator_definition'), ''),
      nullif(btrim(v_item->>'denominator_definition'), ''),
      coalesce(nullif(btrim(v_item->>'measurement_grain'), ''), 'activity'),
      v_item->'schema_json',
      v_item->'options_json',
      v_old.version + 1,
      'published',
      true,
      v_user_id,
      v_user_id
    )
    RETURNING id, version INTO v_new_id, v_new_version;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'prior_id', v_prior_id,
      'id', v_new_id,
      'code', v_old.code,
      'version', v_new_version
    ));
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'profile_year', p_profile_year,
    'room_id', p_room_id,
    'updated_profiles', v_updated,
    'profiles', v_results
  );
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.delete_unused_indicator_profile(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_governance', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile aureka_quality.indicator_profiles%ROWTYPE;
  v_responses integer := 0;
  v_oppe_rules integer := 0;
  v_proposals integer := 0;
  v_json_records integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menghapus profil indikator.' USING ERRCODE = '28000';
  END IF;

  IF NOT aureka_system.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya Superadmin yang dapat menghapus profil indikator.' USING ERRCODE = '42501';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Identitas profil yang akan dihapus wajib diisi.' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_profile
    FROM aureka_quality.indicator_profiles ip
   WHERE ip.id = p_profile_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil indikator tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF v_profile.is_active = true OR v_profile.status NOT IN ('retired', 'draft') THEN
    RAISE EXCEPTION 'Hanya profil nonaktif berstatus retired atau draft yang dapat dihapus permanen. Pensiunkan profil aktif terlebih dahulu.' USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_responses
    FROM aureka_quality.quality_record_responses rr
   WHERE rr.indicator_id = p_profile_id;

  SELECT count(*) INTO v_oppe_rules
    FROM aureka_quality.oppe_indicator_rules op
   WHERE op.profile_id = p_profile_id;

  SELECT count(*) INTO v_proposals
    FROM aureka_governance.indicator_proposals pr
   WHERE pr.activated_profile_id = p_profile_id;

  SELECT count(*) INTO v_json_records
    FROM aureka_quality.quality_records qr
   WHERE qr.profile_year = v_profile.profile_year
     AND qr.room_id = v_profile.room_id
     AND (
       (jsonb_typeof(qr.core_data->'indicator_values') = 'object'
         AND ((qr.core_data->'indicator_values') ? v_profile.code
           OR (qr.core_data->'indicator_values') ? p_profile_id::text))
       OR
       (jsonb_typeof(qr.subject_json->'indicator_values') = 'object'
         AND ((qr.subject_json->'indicator_values') ? v_profile.code
           OR (qr.subject_json->'indicator_values') ? p_profile_id::text))
     );

  IF v_responses > 0 OR v_oppe_rules > 0 OR v_proposals > 0 OR v_json_records > 0 THEN
    RAISE EXCEPTION 'Profil tidak dapat dihapus karena masih memiliki referensi: % respons, % aturan OPPE, % proposal aktif, dan % catatan audit terkait kode/ID.',
      v_responses, v_oppe_rules, v_proposals, v_json_records USING ERRCODE = '23503';
  END IF;

  DELETE FROM aureka_quality.indicator_profiles
   WHERE id = p_profile_id
     AND is_active = false
     AND status IN ('retired', 'draft');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil berubah selama penghapusan; muat ulang halaman dan coba lagi.' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'id', p_profile_id,
    'code', v_profile.code,
    'title', v_profile.title,
    'room_id', v_profile.room_id,
    'profile_year', v_profile.profile_year
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.publish_indicator_profile_batch(integer, bigint, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.publish_indicator_profile_batch(integer, bigint, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION aureka_quality.delete_unused_indicator_profile(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.delete_unused_indicator_profile(uuid) TO authenticated;

COMMENT ON FUNCTION aureka_quality.publish_indicator_profile_batch(integer, bigint, jsonb) IS
'Publishes a unit-scoped batch of changed indicator profiles as new versions in one transaction; preserves previous profile rows and their historical references.';

COMMENT ON FUNCTION aureka_quality.delete_unused_indicator_profile(uuid) IS
'Permanently deletes only retired/draft profiles that have no normalized response, OPPE rule, proposal, or code/ID JSON audit references; audit trigger records the deletion.';
