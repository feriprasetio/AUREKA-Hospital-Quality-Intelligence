BEGIN;

DO $migration$
DECLARE
  v_profile_count integer;
  v_distinct_codes integer;
  v_bad_headers integer;
BEGIN
  SELECT count(*), count(DISTINCT code),
         count(*) FILTER (
           WHERE (code = '9.1' AND coalesce(schema_json->>'header_label', '') <> 'Darah Terbuang')
              OR (code = '9.2' AND coalesce(schema_json->>'header_label', '') <> 'Unordered Specimen')
              OR (code = '9.3' AND coalesce(schema_json->>'header_label', '') <> 'Delay Sampling')
              OR (code = '9.4' AND coalesce(schema_json->>'header_label', '') <> 'Lapor Tes Kritis')
              OR (code = '9.5' AND coalesce(schema_json->>'header_label', '') <> 'Histopatologi')
         )
    INTO v_profile_count, v_distinct_codes, v_bad_headers
    FROM aureka_quality.indicator_profiles
   WHERE room_id = 9
     AND profile_year = 2026
     AND is_active = true
     AND status = 'published'
     AND code = ANY (ARRAY['9.1', '9.2', '9.3', '9.4', '9.5']);

  IF v_profile_count <> 5 OR v_distinct_codes <> 5 OR v_bad_headers <> 0 THEN
    RAISE EXCEPTION 'Master indikator Laboratorium 9.1–9.5 harus tepat lima, aktif, published, dan memiliki header sumber yang cocok.';
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_laboratorium_excel_row
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE room_id = 9
    AND profile_year = 2026
    AND subject_key LIKE 'excel-pmkp-laboratorium-2026:row:%';

CREATE OR REPLACE FUNCTION aureka_quality.import_laboratorium_logbook_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb;
  v_response jsonb;
  v_payload jsonb;
  v_responses jsonb;
  v_attributions jsonb;
  v_core jsonb;
  v_form jsonb;
  v_source jsonb;
  v_source_values jsonb;
  v_indicator_values jsonb;
  v_core_value jsonb;
  v_raw_value jsonb;
  v_options jsonb;
  v_key text;
  v_source_row integer;
  v_record_id uuid;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_imported_ids jsonb := '[]'::jsonb;
  v_indicator_id uuid;
  v_seen_ids uuid[];
  v_seen_codes text[];
  v_code text;
  v_source_text text;
  v_response_label text;
  v_response_code text;
  v_match_status text;
  v_answer text;
  v_request_at timestamp without time zone;
  v_completed_at timestamp without time zone;
  v_record_date date;
  v_expected_codes text[] := ARRAY['9.1', '9.2', '9.3', '9.4', '9.5'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook Instalasi Laboratorium.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Laboratorium hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(9) THEN
    RAISE EXCEPTION 'Akses ke unit Instalasi Laboratorium tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor Laboratorium harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 500 THEN
    RAISE EXCEPTION 'Jumlah baris per batch harus antara 1 dan 500.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*) FILTER (WHERE nullif(x.item->'payload'->>'subject_key', '') IS NULL)
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) > 0 OR (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Laboratorium berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 9
       AND ip.profile_year = 2026
       AND ip.is_active
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
  ) <> 5 OR (
    SELECT count(DISTINCT ip.code)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 9
       AND ip.profile_year = 2026
       AND ip.is_active
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
  ) <> 5 THEN
    RAISE EXCEPTION 'Master indikator Laboratorium 9.1–9.5 harus aktif dan published.' USING ERRCODE = '23503';
  END IF;

  -- Validate every event and all five indicator responses before the first insert.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_attributions), '') <> 'array'
       OR jsonb_array_length(v_attributions) <> 0 THEN
      RAISE EXCEPTION 'Payload event atau atribusi Laboratorium tidak valid.' USING ERRCODE = '22023';
    END IF;
    IF coalesce(jsonb_typeof(v_responses), '') <> 'array' THEN
      RAISE EXCEPTION 'Respons indikator Laboratorium harus berbentuk array.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_responses) <> 5 THEN
      RAISE EXCEPTION 'Setiap event Laboratorium harus memuat tepat lima respons indikator.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '9'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'event'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true' THEN
      RAISE EXCEPTION 'Batch Laboratorium hanya menerima event profil 2026 berstatus Ready for Review.' USING ERRCODE = '22023';
    END IF;

    v_key := v_payload->>'subject_key';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_indicator_values := v_core->'indicator_values';

    IF v_key IS NULL
       OR v_key !~ '^excel-pmkp-laboratorium-2026:row:[0-9]+$'
       OR coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_indicator_values), '') <> 'object'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL
       OR coalesce(jsonb_typeof(v_source->'source_warnings'), '') <> 'array'
       OR coalesce(v_source->>'idempotency_basis', '') <> 'physical_excel_row_number'
       OR v_source IS DISTINCT FROM v_core->'source_import'
       OR v_source IS DISTINCT FROM v_payload->'subject_json'->'source_import' THEN
      RAISE EXCEPTION 'Identitas sumber workbook/Logbook Laboratorium tidak valid.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_source_row := (v_source->>'source_excel_row')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Nomor baris fisik Excel pada sumber Laboratorium tidak valid.' USING ERRCODE = '22023';
    END;

    IF v_source_row < 3
       OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-laboratorium-2026:row:' || v_source_row THEN
      RAISE EXCEPTION 'Nomor baris fisik Excel tidak konsisten dengan kunci impor Laboratorium.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_core->>'unit_name', '') <> 'Instalasi Laboratorium'
       OR coalesce(v_core->>'room_id', '') <> '9'
       OR coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '') THEN
      RAISE EXCEPTION 'Identitas pasien/unit tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Waktu Permintaan', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
       OR coalesce(v_payload->>'record_date', '') <> left(v_form->>'Waktu Permintaan', 10)
       OR coalesce(v_core->>'admission_at', '') <> (v_form->>'Waktu Permintaan') THEN
      RAISE EXCEPTION 'Waktu Permintaan atau record_date tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_request_at := (v_form->>'Waktu Permintaan')::timestamp without time zone;
      v_record_date := (v_payload->>'record_date')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Waktu Permintaan tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF to_char(v_request_at, 'YYYY-MM-DD"T"HH24:MI:SS') <> v_form->>'Waktu Permintaan'
       OR v_record_date::text <> left(v_form->>'Waktu Permintaan', 10)
       OR extract(year FROM v_record_date) <> 2026 THEN
      RAISE EXCEPTION 'Waktu Permintaan harus valid dan berada pada profil tahun 2026 (baris Excel %).', v_source_row USING ERRCODE = '22007';
    END IF;

    IF nullif(v_form->>'Waktu Selesai', '') IS NOT NULL
       AND v_form->>'Waktu Selesai' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' THEN
      BEGIN
        v_completed_at := (v_form->>'Waktu Selesai')::timestamp without time zone;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        v_completed_at := NULL;
      END;
    ELSE
      v_completed_at := NULL;
    END IF;

    IF coalesce(v_source_values ? '9.1', false) IS NOT TRUE
       OR coalesce(v_source_values ? '9.2', false) IS NOT TRUE
       OR coalesce(v_source_values ? '9.3', false) IS NOT TRUE
       OR coalesce(v_source_values ? '9.4', false) IS NOT TRUE
       OR coalesce(v_source_values ? '9.5', false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Provenance harus memuat nilai sumber untuk seluruh indikator 9.1–9.5 pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID indikator tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;
      v_options := NULL;

      SELECT ip.code, ip.options_json
        INTO v_code, v_options
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 9
         AND ip.profile_year = 2026
         AND ip.is_active
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_indicator_id = ANY(v_seen_ids)
         OR v_code = ANY(v_seen_codes)
         OR coalesce(jsonb_typeof(v_options), '') <> 'array' THEN
        RAISE EXCEPTION 'ID/kode indikator Laboratorium tidak valid atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_indicator_id);
      v_seen_codes := array_append(v_seen_codes, v_code);
      v_source_text := coalesce(v_source_values->>v_code, '');
      v_response_label := nullif(v_response->>'response_label', '');
      v_response_code := nullif(v_response->>'response_code', '');
      v_raw_value := v_response->'raw_value';
      v_core_value := v_indicator_values->v_code;
      v_match_status := coalesce(v_raw_value->>'match_status', '');
      v_answer := coalesce(v_raw_value->>'answer', '');

      IF coalesce(jsonb_typeof(v_raw_value), '') <> 'object'
         OR coalesce(jsonb_typeof(v_core_value), '') <> 'object'
         OR coalesce(v_raw_value->>'source_value', '') <> v_source_text
         OR coalesce(v_core_value->>'source_value', '') <> v_source_text
         OR coalesce(v_raw_value->>'answer', '') <> coalesce(v_core_value->>'answer', '')
         OR v_raw_value->>'code' IS DISTINCT FROM v_response_code
         OR v_core_value->>'code' IS DISTINCT FROM v_response_code
         OR coalesce(v_core_value->>'match_status', '') <> v_match_status
         OR coalesce(v_response->>'review_status', '') <> 'pending' THEN
        RAISE EXCEPTION 'Provenance atau respons indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF v_source_text = '' THEN
        IF v_response_label IS NOT NULL
           OR v_response_code IS NOT NULL
           OR nullif(v_response->>'other_text', '') IS NOT NULL
           OR v_answer <> ''
           OR v_match_status <> 'missing' THEN
          RAISE EXCEPTION 'Respons kosong indikator % harus tetap kosong dan ditandai missing (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      ELSIF v_response_code IS NOT NULL THEN
        IF v_response_code !~ '^[1-3]$'
           OR v_response_label IS NULL
           OR v_match_status <> 'matched'
           OR v_answer <> v_response_label
           OR nullif(v_response->>'other_text', '') IS NOT NULL
           OR lower(regexp_replace(btrim(regexp_replace(v_source_text, '[[:space:]]*[(]code[[:space:]]*[0-9]+[)]$', '', 'i')), '[[:space:]]+', ' ', 'g'))
              <> lower(regexp_replace(btrim(v_response_label), '[[:space:]]+', ' ', 'g'))
           OR NOT EXISTS (
             SELECT 1
               FROM jsonb_array_elements(v_options) opt
              WHERE opt->>'label' = v_response_label
                AND opt->>'code' = v_response_code
           ) THEN
          RAISE EXCEPTION 'Pilihan respons indikator % tidak cocok dengan opsi master aktif pada baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
        END IF;
      ELSIF v_response_label IS NOT NULL THEN
        IF v_match_status <> 'needs_review'
           OR coalesce(v_response->>'other_text', '') <> v_source_text
           OR v_answer <> v_response_label
           OR lower(regexp_replace(btrim(v_source_text), '[[:space:]]+', ' ', 'g'))
              <> lower(regexp_replace(btrim(v_response_label), '[[:space:]]+', ' ', 'g'))
           OR NOT EXISTS (
             SELECT 1
               FROM jsonb_array_elements(v_options) opt
              WHERE opt->>'label' = v_response_label
                AND opt->'code' = 'null'::jsonb
                AND coalesce((opt->>'review_required')::boolean, false)
           ) THEN
          RAISE EXCEPTION 'Pilihan indikator % yang memerlukan review tidak cocok dengan master pada baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
        END IF;
      ELSE
        IF v_match_status <> 'unmatched'
           OR coalesce(v_response->>'other_text', '') <> v_source_text
           OR v_answer <> '' THEN
          RAISE EXCEPTION 'Nilai sumber indikator % yang tidak dikenal harus dipertahankan sebagai unmatched (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> 5
       OR NOT ('9.1' = ANY(v_seen_codes))
       OR NOT ('9.2' = ANY(v_seen_codes))
       OR NOT ('9.3' = ANY(v_seen_codes))
       OR NOT ('9.4' = ANY(v_seen_codes))
       OR NOT ('9.5' = ANY(v_seen_codes)) THEN
      RAISE EXCEPTION 'Setiap event Laboratorium harus memuat tepat satu respons untuk indikator 9.1–9.5.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Save only after the complete batch passes all checks. The existing RPC applies room access and audit rules.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 9
         AND qr.profile_year = 2026
         AND qr.subject_key = v_key
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_record_id := aureka_quality.save_quality_logbook(
        NULL,
        v_payload,
        v_row->'responses',
        coalesce(v_row->'attributions', '[]'::jsonb)
      );
      v_imported := v_imported + 1;
      v_imported_ids := v_imported_ids || jsonb_build_array(
        jsonb_build_object('subject_key', v_key, 'record_id', v_record_id)
      );
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 9
           AND qr.profile_year = 2026
           AND qr.subject_key = v_key
      ) THEN
        v_skipped := v_skipped + 1;
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'received_count', v_received,
    'imported_count', v_imported,
    'skipped_existing_count', v_skipped,
    'imported_records', v_imported_ids
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_laboratorium_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_laboratorium_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_laboratorium_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_laboratorium_logbook_batch(jsonb) TO authenticated;

COMMIT;
