-- Atomic replacement of a year's indicator profile set with audit-history relinking.
-- The caller must be a superadmin. Old profile rows are retired, never deleted.

CREATE OR REPLACE FUNCTION aureka_quality.replace_indicator_profile_set(
  p_profile_year integer,
  p_scope_room_id bigint,
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
  v_prepared jsonb := '[]'::jsonb;
  v_id_map jsonb := '[]'::jsonb;
  v_code_map jsonb := '[]'::jsonb;
  v_seen_codes text[] := ARRAY[]::text[];
  v_seen_source_ids text[] := ARRAY[]::text[];
  v_matched_old_ids text[] := ARRAY[]::text[];
  v_room_id bigint;
  v_source_id uuid;
  v_source_id_text text;
  v_source_code text;
  v_code text;
  v_title text;
  v_grain text;
  v_previous_id uuid;
  v_previous_code text;
  v_previous_version integer;
  v_old_profile_id uuid;
  v_new_id uuid;
  v_next_version integer;
  v_retired integer := 0;
  v_inserted integer := 0;
  v_relinked integer := 0;
  v_rekeyed integer := 0;
  v_conflict_old_code text;
  v_conflict_new_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengganti profil indikator.' USING ERRCODE = '28000';
  END IF;

  IF NOT aureka_system.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya Superadmin yang dapat mengganti seluruh profil indikator.' USING ERRCODE = '42501';
  END IF;

  IF p_profile_year IS NULL OR p_profile_year < 1900 OR p_profile_year > 2200 THEN
    RAISE EXCEPTION 'Tahun profil indikator tidak valid.' USING ERRCODE = '22023';
  END IF;

  IF p_profiles IS NULL OR jsonb_typeof(p_profiles) <> 'array'
     OR jsonb_array_length(p_profiles) = 0 THEN
    RAISE EXCEPTION 'Impor profil kosong ditolak. Tidak ada profil aktif yang diubah.' USING ERRCODE = '22023';
  END IF;

  -- Serialize every replacement operation for the same year, including overlapping unit/all-unit scopes.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('aureka_quality.indicator_profile_set:' || p_profile_year::text, 0)
  );

  IF p_scope_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.master_rooms r WHERE r.id = p_scope_room_id
  ) THEN
    RAISE EXCEPTION 'Unit tujuan tidak ditemukan pada master ruangan.' USING ERRCODE = '23503';
  END IF;

  -- Lock current profiles before building stable ID/code mappings.
  PERFORM 1
    FROM aureka_quality.indicator_profiles ip
   WHERE ip.profile_year = p_profile_year
     AND (p_scope_room_id IS NULL OR ip.room_id = p_scope_room_id)
     AND ip.is_active = true
     AND ip.status IN ('published', 'draft')
   FOR UPDATE;

  -- Validate the complete incoming set and resolve the old profile each row replaces.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_profiles)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Setiap profil harus berupa objek metadata.' USING ERRCODE = '22023';
    END IF;

    v_code := btrim(coalesce(v_item->>'code', ''));
    v_title := btrim(coalesce(v_item->>'title', ''));
    v_grain := coalesce(nullif(btrim(v_item->>'measurement_grain'), ''), 'activity');

    IF v_code = '' OR v_title = '' THEN
      RAISE EXCEPTION 'Kode dan nama indikator wajib diisi.' USING ERRCODE = '22023';
    END IF;

    IF v_code = ANY(v_seen_codes) THEN
      RAISE EXCEPTION 'Kode indikator % muncul lebih dari satu kali pada berkas impor.', v_code USING ERRCODE = '23505';
    END IF;
    v_seen_codes := array_append(v_seen_codes, v_code);

    IF coalesce(v_item->>'room_id', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Unit pemilik indikator % tidak valid.', v_code USING ERRCODE = '22023';
    END IF;
    v_room_id := (v_item->>'room_id')::bigint;

    IF p_scope_room_id IS NOT NULL AND v_room_id <> p_scope_room_id THEN
      RAISE EXCEPTION 'Indikator % berada di luar cakupan unit yang dipilih.', v_code USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.master_rooms r WHERE r.id = v_room_id) THEN
      RAISE EXCEPTION 'Unit pemilik indikator % tidak ditemukan.', v_code USING ERRCODE = '23503';
    END IF;

    IF v_grain NOT IN ('patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate') THEN
      RAISE EXCEPTION 'Metode pengukuran indikator % tidak valid.', v_code USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_item->'schema_json') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'options_json') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Struktur instrumen indikator % tidak valid.', v_code USING ERRCODE = '22023';
    END IF;

    v_source_id_text := nullif(btrim(coalesce(v_item->>'source_id', '')), '');
    v_source_id := NULL;
    IF v_source_id_text IS NOT NULL THEN
      IF v_source_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Identitas sumber indikator % tidak valid.', v_code USING ERRCODE = '22023';
      END IF;
      IF lower(v_source_id_text) = ANY(v_seen_source_ids) THEN
        RAISE EXCEPTION 'Identitas sumber indikator ganda ditemukan pada berkas.' USING ERRCODE = '23505';
      END IF;
      v_seen_source_ids := array_append(v_seen_source_ids, lower(v_source_id_text));
      v_source_id := v_source_id_text::uuid;
    END IF;

    v_previous_id := NULL;
    v_previous_code := NULL;
    v_previous_version := NULL;
    v_source_code := NULL;

    IF v_source_id IS NOT NULL THEN
      SELECT ip.id, ip.code, ip.version
        INTO v_previous_id, v_previous_code, v_previous_version
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_source_id
         AND ip.profile_year = p_profile_year
         AND ip.room_id = v_room_id
         AND ip.is_active = true
         AND ip.status IN ('published', 'draft')
       FOR UPDATE;
    END IF;

    IF v_previous_id IS NULL THEN
      v_source_code := coalesce(nullif(btrim(v_item->>'source_code'), ''), v_code);
      SELECT ip.id, ip.code, ip.version
        INTO v_previous_id, v_previous_code, v_previous_version
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.profile_year = p_profile_year
         AND ip.room_id = v_room_id
         AND ip.code = v_source_code
         AND ip.is_active = true
         AND ip.status IN ('published', 'draft')
       ORDER BY ip.version DESC
       LIMIT 1
       FOR UPDATE;
    END IF;

    -- Also allow a backup from another year to match the target year's current code.
    IF v_previous_id IS NULL AND v_source_code IS DISTINCT FROM v_code THEN
      SELECT ip.id, ip.code, ip.version
        INTO v_previous_id, v_previous_code, v_previous_version
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.profile_year = p_profile_year
         AND ip.room_id = v_room_id
         AND ip.code = v_code
         AND ip.is_active = true
         AND ip.status IN ('published', 'draft')
       ORDER BY ip.version DESC
       LIMIT 1
       FOR UPDATE;
    END IF;

    IF v_previous_id IS NOT NULL THEN
      IF v_previous_id::text = ANY(v_matched_old_ids) THEN
        RAISE EXCEPTION 'Satu profil lama dipetakan ke lebih dari satu indikator baru (%).', v_code USING ERRCODE = '23505';
      END IF;
      v_matched_old_ids := array_append(v_matched_old_ids, v_previous_id::text);
    END IF;

    v_prepared := v_prepared || jsonb_build_array(
      v_item || jsonb_build_object(
        '_import_room_id', v_room_id,
        '_matched_profile_id', v_previous_id,
        '_matched_profile_code', v_previous_code
      )
    );
  END LOOP;

  -- Retire the complete active/draft set in the chosen scope; keep all history rows.
  UPDATE aureka_quality.indicator_profiles ip
     SET status = 'retired',
         is_active = false,
         updated_by = v_user_id,
         updated_at = now()
   WHERE ip.profile_year = p_profile_year
     AND (p_scope_room_id IS NULL OR ip.room_id = p_scope_room_id)
     AND ip.is_active = true
     AND ip.status IN ('published', 'draft');
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  -- Insert a fresh active version for every row in the imported set.
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_prepared)
  LOOP
    v_room_id := (v_item->>'_import_room_id')::bigint;
    v_code := btrim(v_item->>'code');

    SELECT coalesce(max(ip.version), 0) + 1
      INTO v_next_version
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.profile_year = p_profile_year
       AND ip.code = v_code;

    INSERT INTO aureka_quality.indicator_profiles (
      profile_year, code, room_id, unit_name, title, indicator_type, category,
      unit_of_measure, target_text, target_operator, target_value,
      numerator_definition, denominator_definition, measurement_grain,
      schema_json, options_json, version, status, is_active, created_by, updated_by
    )
    VALUES (
      p_profile_year,
      v_code,
      v_room_id,
      coalesce(nullif(btrim(v_item->>'unit_name'), ''), (SELECT r.name FROM public.master_rooms r WHERE r.id = v_room_id)),
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
      v_next_version,
      'published',
      true,
      v_user_id,
      v_user_id
    )
    RETURNING id INTO v_new_id;

    v_inserted := v_inserted + 1;

    IF nullif(v_item->>'_matched_profile_id', '') IS NOT NULL THEN
      v_previous_id := (v_item->>'_matched_profile_id')::uuid;
      v_previous_code := v_item->>'_matched_profile_code';

      -- Versioned profiles can have audit responses linked to any historical ID.
      -- Relink every same-code version for this room/year, not only the active row.
      FOR v_old_profile_id IN
        SELECT ip.id
          FROM aureka_quality.indicator_profiles ip
         WHERE ip.profile_year = p_profile_year
           AND ip.room_id = v_room_id
           AND ip.code = v_previous_code
           AND ip.id <> v_new_id
      LOOP
        v_id_map := v_id_map || jsonb_build_array(jsonb_build_object(
          'old_id', v_old_profile_id,
          'new_id', v_new_id,
          'room_id', v_room_id
        ));
      END LOOP;

      IF v_previous_code IS DISTINCT FROM v_code THEN
        v_code_map := v_code_map || jsonb_build_array(jsonb_build_object(
          'room_id', v_room_id,
          'old_code', v_previous_code,
          'new_code', v_code
        ));
      END IF;
    END IF;
  END LOOP;

  -- Do not silently overwrite an unrelated value already stored under a destination code.
  IF jsonb_array_length(v_code_map) > 0 THEN
    SELECT m.value->>'old_code', m.value->>'new_code'
      INTO v_conflict_old_code, v_conflict_new_code
      FROM jsonb_array_elements(v_code_map) AS m(value)
     WHERE EXISTS (
       SELECT 1
         FROM aureka_quality.quality_records qr
        WHERE qr.profile_year = p_profile_year
          AND qr.room_id = (m.value->>'room_id')::bigint
          AND (
            (
              jsonb_typeof(qr.core_data->'indicator_values') = 'object'
              AND (qr.core_data->'indicator_values') ? (m.value->>'old_code')
              AND (qr.core_data->'indicator_values') ? (m.value->>'new_code')
            )
            OR
            (
              jsonb_typeof(qr.subject_json->'indicator_values') = 'object'
              AND (qr.subject_json->'indicator_values') ? (m.value->>'old_code')
              AND (qr.subject_json->'indicator_values') ? (m.value->>'new_code')
            )
          )
          AND NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(v_code_map) AS next_map(value)
             WHERE next_map.value->>'room_id' = m.value->>'room_id'
               AND next_map.value->>'old_code' = m.value->>'new_code'
          )
     )
     LIMIT 1;

    IF v_conflict_old_code IS NOT NULL THEN
      RAISE EXCEPTION 'Pemetaan kode % ke % berpotensi menimpa nilai indikator lain pada data audit. Koreksi berkas atau data konflik sebelum impor.',
        v_conflict_old_code, v_conflict_new_code USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Relink normalized audit responses to the new profile IDs without changing their values.
  IF jsonb_array_length(v_id_map) > 0 THEN
    UPDATE aureka_quality.quality_record_responses rr
       SET indicator_id = (mapping.value->>'new_id')::uuid,
           updated_at = now()
      FROM jsonb_array_elements(v_id_map) AS mapping(value)
     WHERE rr.indicator_id = (mapping.value->>'old_id')::uuid
       AND EXISTS (
         SELECT 1
           FROM aureka_quality.quality_records qr
          WHERE qr.id = rr.record_id
            AND qr.profile_year = p_profile_year
            AND (p_scope_room_id IS NULL OR qr.room_id = p_scope_room_id)
            AND qr.room_id = (mapping.value->>'room_id')::bigint
       );
    GET DIAGNOSTICS v_relinked = ROW_COUNT;
  END IF;

  -- Re-key indicator_values in both copies of the logbook JSON (including archived records).
  IF jsonb_array_length(v_code_map) > 0 THEN
    UPDATE aureka_quality.quality_records qr
       SET core_data = CASE
             WHEN jsonb_typeof(qr.core_data) = 'object'
              AND jsonb_typeof(qr.core_data->'indicator_values') = 'object'
             THEN jsonb_set(
               qr.core_data,
               '{indicator_values}',
               (
                 SELECT coalesce(
                   jsonb_object_agg(
                     coalesce((
                       SELECT mapping.value->>'new_code'
                         FROM jsonb_array_elements(v_code_map) AS mapping(value)
                        WHERE mapping.value->>'room_id' = qr.room_id::text
                          AND mapping.value->>'old_code' = entry.key
                        LIMIT 1
                     ), entry.key),
                     entry.value
                   ),
                   '{}'::jsonb
                 )
                   FROM jsonb_each(qr.core_data->'indicator_values') AS entry(key, value)
               ),
               true
             )
             ELSE qr.core_data
           END,
           subject_json = CASE
             WHEN jsonb_typeof(qr.subject_json) = 'object'
              AND jsonb_typeof(qr.subject_json->'indicator_values') = 'object'
             THEN jsonb_set(
               qr.subject_json,
               '{indicator_values}',
               (
                 SELECT coalesce(
                   jsonb_object_agg(
                     coalesce((
                       SELECT mapping.value->>'new_code'
                         FROM jsonb_array_elements(v_code_map) AS mapping(value)
                        WHERE mapping.value->>'room_id' = qr.room_id::text
                          AND mapping.value->>'old_code' = entry.key
                        LIMIT 1
                     ), entry.key),
                     entry.value
                   ),
                   '{}'::jsonb
                 )
                   FROM jsonb_each(qr.subject_json->'indicator_values') AS entry(key, value)
               ),
               true
             )
             ELSE qr.subject_json
           END,
           updated_at = now()
     WHERE qr.profile_year = p_profile_year
       AND (p_scope_room_id IS NULL OR qr.room_id = p_scope_room_id)
       AND EXISTS (
         SELECT 1
           FROM jsonb_array_elements(v_code_map) AS mapping(value)
          WHERE mapping.value->>'room_id' = qr.room_id::text
            AND (
              (
                jsonb_typeof(qr.core_data->'indicator_values') = 'object'
                AND (qr.core_data->'indicator_values') ? (mapping.value->>'old_code')
              )
              OR
              (
                jsonb_typeof(qr.subject_json->'indicator_values') = 'object'
                AND (qr.subject_json->'indicator_values') ? (mapping.value->>'old_code')
              )
            )
       );
    GET DIAGNOSTICS v_rekeyed = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'profile_year', p_profile_year,
    'scope_room_id', p_scope_room_id,
    'imported_profiles', v_inserted,
    'retired_profiles', v_retired,
    'relinked_responses', v_relinked,
    'rekeyed_audit_records', v_rekeyed
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.replace_indicator_profile_set(integer, bigint, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.replace_indicator_profile_set(integer, bigint, jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.replace_indicator_profile_set(integer, bigint, jsonb) IS
'Superadmin-only atomic replacement of an indicator profile set for a year/unit scope. Retires prior profiles, inserts fresh versions, relinks normalized quality audit responses, and re-keys code-based audit JSON while retaining all audit records and values.';
