-- Secure, idempotent workbook import for Instalasi Bedah Sentral (room 4).
-- Correct indicator 4.1 classification before the importer relies on its option codes.
DO $migration$
DECLARE
  v_updated integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles ip
     SET options_json = jsonb_build_array(
       jsonb_build_object('label', 'Pasien Dirawat Tanpa Kendala', 'code', 1, 'numerator', false, 'denominator', true),
       jsonb_build_object('label', 'Pasien Dirawat Dengan Kekosongan Linen', 'code', 3, 'numerator', true, 'denominator', true),
       jsonb_build_object('label', 'Pasien Dirawat Dengan Kekosongan BHP', 'code', 3, 'numerator', true, 'denominator', true),
       jsonb_build_object('label', 'Pasien Dirawat Dengan Kekosongan BHP dan Linen', 'code', 3, 'numerator', true, 'denominator', true),
       jsonb_build_object('label', 'Pasien Dirawat Dengan Kendala Penunjang Lainnya', 'code', 3, 'numerator', true, 'denominator', true),
       jsonb_build_object('label', 'Lainnya — tuliskan alasan/temuan', 'code', NULL, 'numerator', NULL, 'denominator', true, 'review_required', true)
     ),
     schema_json = coalesce(ip.schema_json, '{}'::jsonb) ||
       jsonb_build_object('header_label', 'Kekosongan BHP/Linen', 'header_source', 'Header Aureka.xlsx'),
     updated_at = now()
   WHERE ip.room_id = 4
     AND ip.profile_year = 2026
     AND ip.code = '4.1'
     AND ip.is_active = true
     AND ip.status = 'published';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Master aktif indikator IBS 4.1 harus tepat satu baris; ditemukan %.', v_updated;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_ibs_excel_row
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE room_id = 4
    AND profile_year = 2026
    AND subject_key LIKE 'excel-pmkp-ibs-2026:row:%';

CREATE OR REPLACE FUNCTION aureka_quality.import_ibs_logbook_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
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
  v_key text;
  v_source_row integer;
  v_source_no integer;
  v_record_id uuid;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_imported_ids jsonb := '[]'::jsonb;
  v_indicator_id uuid;
  v_seen_ids uuid[];
  v_seen_codes text[];
  v_code text;
  v_expected_codes text[] := ARRAY['4.1','4.2','4.3','4.4','4.5'];
  v_request_date date;
  v_source_values jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook Instalasi Bedah Sentral.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook IBS hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(4) THEN
    RAISE EXCEPTION 'Akses ke unit Instalasi Bedah Sentral tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor IBS harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 500 THEN
    RAISE EXCEPTION 'Jumlah baris per batch harus antara 1 dan 500.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch IBS berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 4
       AND ip.profile_year = 2026
       AND ip.is_active
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
  ) <> 5 OR (
    SELECT count(DISTINCT ip.code)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 4
       AND ip.profile_year = 2026
       AND ip.is_active
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
  ) <> 5 THEN
    RAISE EXCEPTION 'Master indikator IBS 4.1–4.5 harus aktif dan terbit sebelum impor.' USING ERRCODE = '23503';
  END IF;

  -- Validate the entire batch before the first insert to avoid partial writes inside a batch.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR jsonb_array_length(v_responses) <> 5
       OR coalesce(jsonb_typeof(v_attributions), '') <> 'array'
       OR jsonb_array_length(v_attributions) <> 0 THEN
      RAISE EXCEPTION 'Bentuk payload, lima respons indikator, atau atribusi IBS tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '4'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true' THEN
      RAISE EXCEPTION 'Batch IBS hanya menerima episode pasien profil 2026 yang perlu ditinjau.' USING ERRCODE = '22023';
    END IF;

    v_key := v_payload->>'subject_key';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';

    IF v_key IS NULL
       OR v_key !~ '^excel-pmkp-ibs-2026:row:[0-9]+$'
       OR coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values), '') <> 'object'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no', '') !~ '^[0-9]+$'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL
       OR coalesce(jsonb_typeof(v_source->'source_warnings'), '') <> 'array' THEN
      RAISE EXCEPTION 'Identitas sumber workbook/logbook IBS tidak valid.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_source_row := (v_source->>'source_excel_row')::integer;
      v_source_no := (v_source->>'source_excel_no')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Nomor sumber Excel pada baris IBS tidak valid.' USING ERRCODE = '22023';
    END;

    IF v_source_row < 3
       OR v_source_no IS NULL
       OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-ibs-2026:row:' || v_source_row
       OR v_source_no <> v_source_row - 2 THEN
      RAISE EXCEPTION 'Nomor baris Excel tidak konsisten dengan kunci impor IBS.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_core->>'unit_name', '') <> 'Instalasi Bedah Sentral'
       OR coalesce(v_core->>'room_id', '') <> '4'
       OR coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '') THEN
      RAISE EXCEPTION 'Identitas pasien/unit pada data inti dan formulir IBS tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Tanggal Masuk', '') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(v_payload->>'record_date', '') <> coalesce(v_form->>'Tanggal Masuk', '')
       OR coalesce(v_core->>'admission_at', '') <> coalesce(v_form->>'Tanggal Masuk', '')
       OR coalesce(v_source->>'allow_cross_year', 'false') <> (substring(v_form->>'Tanggal Masuk' from 1 for 4) <> '2026')::text
       OR coalesce(v_source->>'exclude_from_profile_year_metrics', 'false') <> (substring(v_form->>'Tanggal Masuk' from 1 for 4) <> '2026')::text THEN
      RAISE EXCEPTION 'Tanggal masuk atau penanda lintas tahun tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_request_date := (v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal masuk tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF v_request_date::text <> (v_form->>'Tanggal Masuk')
       OR (v_payload->>'record_date')::date <> v_request_date THEN
      RAISE EXCEPTION 'Tanggal masuk tidak valid/tidak cocok pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END IF;

    IF coalesce(jsonb_typeof(v_core->'indicator_values'), '') <> 'object' THEN
      RAISE EXCEPTION 'Nilai indikator inti pada baris Excel % tidak valid.', v_source_row USING ERRCODE = '22023';
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

      SELECT ip.code
        INTO v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 4
         AND ip.profile_year = 2026
         AND ip.is_active
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_indicator_id = ANY(v_seen_ids)
         OR v_code = ANY(v_seen_codes) THEN
        RAISE EXCEPTION 'ID/kode indikator IBS tidak valid atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_indicator_id);
      v_seen_codes := array_append(v_seen_codes, v_code);

      IF nullif(v_response->>'response_label', '') IS NULL
         OR coalesce(v_response->>'response_code', '') !~ '^[1-3]$'
         OR coalesce(v_source_values->>v_code, '') = ''
         OR coalesce(v_source_values->>v_code, '') !~* ('[(]code[[:space:]]*' || coalesce(v_response->>'response_code', '') || '[)]$')
         OR regexp_replace(v_source_values->>v_code, '[[:space:]]*[(]code[[:space:]]*[0-9]+[)]$', '', 'i') <> v_response->>'response_label'
         OR coalesce(v_response->'raw_value'->>'source_value', '') <> coalesce(v_source_values->>v_code, '') THEN
        RAISE EXCEPTION 'Respons atau nilai sumber indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_response->'raw_value'->>'answer', '') <> coalesce(v_response->>'response_label', '')
         OR coalesce(v_response->'raw_value'->>'code', '') <> coalesce(v_response->>'response_code', '')
         OR coalesce(v_core->'indicator_values'->v_code->>'answer', '') <> coalesce(v_response->>'response_label', '')
         OR coalesce(v_core->'indicator_values'->v_code->>'code', '') <> coalesce(v_response->>'response_code', '')
         OR coalesce(v_core->'indicator_values'->v_code->>'source_value', '') <> coalesce(v_source_values->>v_code, '') THEN
        RAISE EXCEPTION 'Respons dan nilai indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF NOT EXISTS (
        SELECT 1
          FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id = v_indicator_id
           AND opt->>'label' = v_response->>'response_label'
           AND opt->>'code' = v_response->>'response_code'
      ) THEN
        RAISE EXCEPTION 'Pilihan respons tidak ditemukan pada master indikator % di baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> 5
       OR NOT ('4.1' = ANY(v_seen_codes))
       OR NOT ('4.2' = ANY(v_seen_codes))
       OR NOT ('4.3' = ANY(v_seen_codes))
       OR NOT ('4.4' = ANY(v_seen_codes))
       OR NOT ('4.5' = ANY(v_seen_codes)) THEN
      RAISE EXCEPTION 'Setiap episode IBS harus memiliki tepat satu respons indikator 4.1–4.5.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Save only after all rows in this batch pass validation. The existing RPC preserves room authorization and audit triggers.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 4
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
         WHERE qr.room_id = 4
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

REVOKE ALL ON FUNCTION aureka_quality.import_ibs_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_ibs_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_ibs_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_ibs_logbook_batch(jsonb) TO authenticated;
