BEGIN;

DO $migration$
DECLARE
  v_profile_count integer;
  v_existing_label text;
BEGIN
  SELECT count(*), max(nullif(btrim(schema_json->>'header_label'), ''))
    INTO v_profile_count, v_existing_label
    FROM aureka_quality.indicator_profiles
   WHERE room_id = 7
     AND profile_year = 2026
     AND code = '7.2'
     AND is_active = true
     AND status = 'published';

  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION 'Master indikator Gizi 7.2 harus tepat satu, aktif, dan published sebelum migrasi impor.';
  END IF;

  IF v_existing_label IS NOT NULL AND v_existing_label <> 'Instruksi DPJP' THEN
    RAISE EXCEPTION 'Header master Gizi 7.2 sudah memiliki label berbeda (%); migrasi dihentikan agar pemetaan tidak tertimpa.', v_existing_label;
  END IF;

  UPDATE aureka_quality.indicator_profiles
     SET schema_json = jsonb_set(
       coalesce(schema_json, '{}'::jsonb),
       '{header_label}',
       to_jsonb('Instruksi DPJP'::text),
       true
     )
   WHERE room_id = 7
     AND profile_year = 2026
     AND code = '7.2'
     AND is_active = true
     AND status = 'published';
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_gizi_excel_row
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE room_id = 7
    AND profile_year = 2026
    AND subject_key LIKE 'excel-pmkp-gizi-2026:row:%';

CREATE OR REPLACE FUNCTION aureka_quality.import_gizi_logbook_batch(p_rows jsonb)
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
  v_request_date date;
  v_expected_codes text[] := ARRAY['7.1', '7.2'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook Instalasi Gizi.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Instalasi Gizi hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(7) THEN
    RAISE EXCEPTION 'Akses ke unit Instalasi Gizi tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor Gizi harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 500 THEN
    RAISE EXCEPTION 'Jumlah baris per batch harus antara 1 dan 500.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Gizi berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 7
       AND ip.profile_year = 2026
       AND ip.is_active
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
  ) <> 2 OR (
    SELECT count(DISTINCT ip.code)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 7
       AND ip.profile_year = 2026
       AND ip.is_active
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
  ) <> 2 THEN
    RAISE EXCEPTION 'Master indikator Gizi 7.1 dan 7.2 harus aktif dan published sebelum impor.' USING ERRCODE = '23503';
  END IF;

  -- Validate every record and its two indicator responses before the first insert.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR jsonb_array_length(v_responses) <> 2
       OR coalesce(jsonb_typeof(v_attributions), '') <> 'array'
       OR jsonb_array_length(v_attributions) <> 0 THEN
      RAISE EXCEPTION 'Bentuk payload, dua respons indikator, atau atribusi Gizi tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '7'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true' THEN
      RAISE EXCEPTION 'Batch Gizi hanya menerima episode pasien profil 2026 berstatus Ready for Review.' USING ERRCODE = '22023';
    END IF;

    v_key := v_payload->>'subject_key';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_indicator_values := v_core->'indicator_values';

    IF v_key IS NULL
       OR v_key !~ '^excel-pmkp-gizi-2026:row:[0-9]+$'
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
       OR v_source IS DISTINCT FROM v_payload->'subject_json'->'source_import'
       OR NOT (v_source_values ? '7.1' AND v_source_values ? '7.2') THEN
      RAISE EXCEPTION 'Identitas sumber workbook/Logbook Gizi tidak valid.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_source_row := (v_source->>'source_excel_row')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Nomor baris fisik Excel pada sumber Gizi tidak valid.' USING ERRCODE = '22023';
    END;

    IF v_source_row < 3
       OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-gizi-2026:row:' || v_source_row THEN
      RAISE EXCEPTION 'Nomor baris fisik Excel tidak konsisten dengan kunci impor Gizi.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_core->>'unit_name', '') <> 'Instalasi Gizi'
       OR coalesce(v_core->>'room_id', '') <> '7'
       OR coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '')
       OR coalesce(v_form->>'Instruksi', '') <> coalesce(v_source_values->>'7.2', '') THEN
      RAISE EXCEPTION 'Identitas pasien/unit atau nilai Instruksi DPJP tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Tanggal Masuk', '') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(v_payload->>'record_date', '') <> coalesce(v_form->>'Tanggal Masuk', '')
       OR coalesce(v_core->>'admission_at', '') <> coalesce(v_form->>'Tanggal Masuk', '') THEN
      RAISE EXCEPTION 'Tanggal masuk atau record_date tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_request_date := (v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal masuk tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF v_request_date::text <> (v_form->>'Tanggal Masuk')
       OR (v_payload->>'record_date')::date <> v_request_date
       OR extract(year FROM v_request_date) <> 2026 THEN
      RAISE EXCEPTION 'Tanggal masuk harus valid dan berada pada profil tahun 2026 (baris Excel %).', v_source_row USING ERRCODE = '22007';
    END IF;

    IF coalesce(v_source_values->>'7.1', '') <> coalesce(v_indicator_values->'7.1'->>'source_value', '')
       OR coalesce(v_source_values->>'7.2', '') <> coalesce(v_indicator_values->'7.2'->>'source_value', '') THEN
      RAISE EXCEPTION 'Nilai sumber indikator dan core_data tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
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
         AND ip.room_id = 7
         AND ip.profile_year = 2026
         AND ip.is_active
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_indicator_id = ANY(v_seen_ids)
         OR v_code = ANY(v_seen_codes)
         OR coalesce(jsonb_typeof(v_options), '') <> 'array' THEN
        RAISE EXCEPTION 'ID/kode indikator Gizi tidak valid atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_indicator_id);
      v_seen_codes := array_append(v_seen_codes, v_code);
      v_source_text := coalesce(v_source_values->>v_code, '');
      v_response_label := nullif(v_response->>'response_label', '');
      v_response_code := nullif(v_response->>'response_code', '');
      v_raw_value := v_response->'raw_value';
      v_match_status := coalesce(v_raw_value->>'match_status', '');

      IF coalesce(jsonb_typeof(v_raw_value), '') <> 'object'
         OR coalesce(v_raw_value->>'source_value', '') <> v_source_text
         OR coalesce(v_response->>'review_status', '') <> 'pending'
         OR coalesce(v_indicator_values->v_code->>'source_value', '') <> v_source_text
         OR coalesce(v_indicator_values->v_code->>'answer', '') <> coalesce(v_raw_value->>'answer', '') THEN
        RAISE EXCEPTION 'Provenance atau respons indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF v_source_text = '' THEN
        IF v_response_label IS NOT NULL
           OR v_response_code IS NOT NULL
           OR nullif(v_response->>'other_text', '') IS NOT NULL
           OR coalesce(v_raw_value->>'answer', '') <> ''
           OR v_match_status <> 'missing'
           OR coalesce(v_indicator_values->v_code->>'match_status', '') <> 'missing' THEN
          RAISE EXCEPTION 'Respons kosong indikator % harus tetap kosong dan ditandai untuk review (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      ELSIF v_response_code IS NOT NULL THEN
        IF v_response_code !~ '^[1-3]$'
           OR v_response_label IS NULL
           OR v_match_status NOT IN ('matched', 'needs_review')
           OR coalesce(v_raw_value->>'answer', '') <> v_response_label
           OR coalesce(v_raw_value->>'code', '') <> v_response_code
           OR coalesce(v_indicator_values->v_code->>'code', '') <> v_response_code
           OR coalesce(v_indicator_values->v_code->>'answer', '') <> v_response_label
           OR (v_source_text ~* '[(]code[[:space:]]*[0-9]+[)]$' AND v_source_text !~* ('[(]code[[:space:]]*' || v_response_code || '[)]$'))
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
           OR nullif(v_response->>'other_text', '') IS NULL
           OR coalesce(v_response->>'other_text', '') <> v_source_text
           OR coalesce(v_raw_value->>'answer', '') <> v_response_label
           OR coalesce(v_raw_value->>'code', '') <> ''
           OR coalesce(v_indicator_values->v_code->>'answer', '') <> v_response_label
           OR coalesce(v_indicator_values->v_code->>'match_status', '') <> 'needs_review'
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
           OR coalesce(v_raw_value->>'answer', '') <> ''
           OR coalesce(v_raw_value->>'code', '') <> ''
           OR coalesce(v_indicator_values->v_code->>'answer', '') <> ''
           OR coalesce(v_indicator_values->v_code->>'match_status', '') <> 'unmatched' THEN
          RAISE EXCEPTION 'Nilai sumber indikator % yang tidak dikenal harus dipertahankan sebagai unmatched dan menunggu klasifikasi (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> 2
       OR NOT ('7.1' = ANY(v_seen_codes))
       OR NOT ('7.2' = ANY(v_seen_codes)) THEN
      RAISE EXCEPTION 'Setiap episode Gizi harus memuat tepat satu respons untuk indikator 7.1 dan 7.2.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Save only after the complete batch passes all checks. The existing RPC enforces authenticated room access and audit handling.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 7
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
         WHERE qr.room_id = 7
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

REVOKE ALL ON FUNCTION aureka_quality.import_gizi_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_gizi_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_gizi_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_gizi_logbook_batch(jsonb) TO authenticated;

COMMIT;
