-- Authenticated, idempotent import for the Ambulance quality logbook.
-- Writes delegate to save_quality_logbook so the existing access rules and audit trail remain in force.

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_ambulance_excel_row
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE room_id = 3
    AND subject_key LIKE 'excel-pmkp-ambulance-2026:row:%';

CREATE OR REPLACE FUNCTION aureka_quality.import_ambulance_logbook_batch(p_rows jsonb)
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
  v_code text;
  v_expected_codes text[] := ARRAY['3.1'];
  v_request_date date;
  v_request_time text;
  v_delivered_time text;
  v_start_minute integer;
  v_end_minute integer;
  v_response_minutes numeric;
  v_rollover boolean;
  v_day_carry boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook Ambulance.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Ambulance hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(3) THEN
    RAISE EXCEPTION 'Akses ke unit Ambulance tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor Ambulance harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 500 THEN
    RAISE EXCEPTION 'Jumlah baris per batch harus antara 1 dan 500.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(DISTINCT x.item->'payload'->>'subject_key')
        FROM jsonb_array_elements(p_rows) AS x(item)) <> v_received THEN
    RAISE EXCEPTION 'Batch Ambulance berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*)
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.room_id = 3
         AND ip.profile_year = 2026
         AND ip.is_active
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes)) <> 1 THEN
    RAISE EXCEPTION 'Master indikator 3.1 harus aktif dan terbit sebelum impor Ambulance.' USING ERRCODE = '23503';
  END IF;

  -- Validate the complete batch before the first write to avoid partial imports.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);

    IF coalesce(jsonb_typeof(v_payload),'') <> 'object'
       OR coalesce(jsonb_typeof(v_responses),'') <> 'array'
       OR jsonb_array_length(v_responses) <> 1
       OR coalesce(jsonb_typeof(v_attributions),'') <> 'array'
       OR jsonb_array_length(v_attributions) <> 0 THEN
      RAISE EXCEPTION 'Bentuk payload, respons indikator, atau atribusi Ambulance tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id','') <> '3'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'event'
       OR coalesce(v_payload->>'status','') <> 'ready'
       OR coalesce(v_payload->>'review_required','false') <> 'true' THEN
      RAISE EXCEPTION 'Batch Ambulance hanya menerima catatan event profil 2026 yang perlu ditinjau.' USING ERRCODE = '22023';
    END IF;

    v_key := v_payload->>'subject_key';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';

    IF v_key IS NULL
       OR v_key !~ '^excel-pmkp-ambulance-2026:row:[0-9]+$'
       OR coalesce(jsonb_typeof(v_core),'') <> 'object'
       OR coalesce(jsonb_typeof(v_form),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source),'') <> 'object'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL
       OR coalesce(jsonb_typeof(v_source->'source_warnings'),'') <> 'array' THEN
      RAISE EXCEPTION 'Identitas sumber workbook/logbook Ambulance tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    BEGIN
      v_source_no := (v_source->>'source_excel_no')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Nomor sumber pada baris Excel % tidak valid.', v_source_row USING ERRCODE = '22023';
    END;
    IF v_source_row < 3 OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-ambulance-2026:row:' || v_source_row
       OR v_source_no <> v_source_row - 2 THEN
      RAISE EXCEPTION 'Nomor baris Excel tidak konsisten dengan kunci impor Ambulance.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_core->>'unit_name','') <> 'Ambulance'
       OR coalesce(v_core->>'room_id','') <> '3'
       OR coalesce(v_core->>'patient_name','') <> coalesce(v_form->>'Nama Pasien','')
       OR coalesce(v_core->>'admission_at','') <> coalesce(v_form->>'Tanggal Permintaan','') THEN
      RAISE EXCEPTION 'Identitas unit/tanggal antara data inti dan formulir tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Tanggal Permintaan','') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(v_payload->>'record_date','') <> coalesce(v_form->>'Tanggal Permintaan','')
       OR coalesce(v_source->>'allow_cross_year','false') <> (substring(v_form->>'Tanggal Permintaan' from 1 for 4) <> '2026')::text THEN
      RAISE EXCEPTION 'Tanggal permintaan atau penanda lintas tahun tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_request_date := (v_form->>'Tanggal Permintaan')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal permintaan tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;
    IF v_request_date::text <> (v_form->>'Tanggal Permintaan')
       OR (v_payload->>'record_date')::date <> v_request_date THEN
      RAISE EXCEPTION 'Tanggal permintaan tidak valid/tidak cocok pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END IF;

    v_request_time := nullif(v_form->>'Waktu Permintaan','');
    v_delivered_time := nullif(v_form->>'Waktu Diantar','');
    IF (v_request_time IS NOT NULL AND v_request_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
       OR (v_delivered_time IS NOT NULL AND v_delivered_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
      RAISE EXCEPTION 'Format jam harus HH:MM setelah normalisasi pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_rollover := coalesce((v_source->>'overnight_rollover')::boolean, false);
    v_day_carry := coalesce((v_source->>'arrival_time_day_carry')::boolean, false);
    IF v_rollover AND NOT v_day_carry THEN
      RAISE EXCEPTION 'Penanda pergantian hari tidak didukung oleh metadata sel waktu pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF v_request_time IS NOT NULL AND v_delivered_time IS NOT NULL THEN
      v_start_minute := split_part(v_request_time, ':', 1)::integer * 60 + split_part(v_request_time, ':', 2)::integer;
      v_end_minute := split_part(v_delivered_time, ':', 1)::integer * 60 + split_part(v_delivered_time, ':', 2)::integer;
      IF v_end_minute >= v_start_minute THEN
        v_response_minutes := v_end_minute - v_start_minute;
      ELSIF v_rollover AND v_day_carry THEN
        v_response_minutes := v_end_minute + 1440 - v_start_minute;
      ELSE
        v_response_minutes := NULL;
      END IF;
    ELSE
      v_response_minutes := NULL;
    END IF;

    IF coalesce(jsonb_typeof(v_core->'calculated_fields'),'') <> 'object'
       OR coalesce(jsonb_typeof(v_core->'indicator_values'),'') <> 'object' THEN
      RAISE EXCEPTION 'Kolom kalkulasi atau respons indikator belum berbentuk objek yang valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      v_indicator_id := NULL;
      v_code := NULL;
      SELECT ip.id, ip.code
        INTO v_indicator_id, v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = nullif(v_response->>'indicator_id','')::uuid
         AND ip.room_id = 3
         AND ip.profile_year = 2026
         AND ip.is_active
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_indicator_id IS NULL OR v_code IS NULL OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'ID indikator Ambulance tidak valid/berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_indicator_id);

      IF nullif(v_response->>'response_label','') IS NULL
         OR coalesce(v_response->>'response_code','') !~ '^[1-3]$' THEN
        RAISE EXCEPTION 'Respons Pelayanan Ambulance baris Excel % belum memiliki label/kode yang valid.', v_source_row USING ERRCODE = '22023';
      END IF;

      IF NOT EXISTS (
        SELECT 1
          FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id = v_indicator_id
           AND opt->>'label' = v_response->>'response_label'
           AND opt->>'code' = v_response->>'response_code'
      ) THEN
        RAISE EXCEPTION 'Pilihan respons tidak ditemukan pada opsi indikator Ambulance yang terbit pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;

      IF coalesce(v_response->'raw_value'->>'source_value','') <> coalesce(v_source->>'source_indicator_value','') THEN
        RAISE EXCEPTION 'Nilai sumber dan payload respons indikator tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF cardinality(v_seen_ids) <> 1 OR NOT EXISTS (
      SELECT 1 FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = ANY(v_seen_ids) AND ip.code = '3.1'
    ) THEN
      RAISE EXCEPTION 'Setiap baris Ambulance harus memiliki satu respons indikator 3.1.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Compute response minutes on the server rather than trusting workbook formulas or client-calculated values.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_key := v_payload->>'subject_key';

    v_request_time := nullif(v_form->>'Waktu Permintaan','');
    v_delivered_time := nullif(v_form->>'Waktu Diantar','');
    v_response_minutes := NULL;

    IF v_request_time IS NOT NULL AND v_delivered_time IS NOT NULL THEN
      v_start_minute := split_part(v_request_time, ':', 1)::integer * 60 + split_part(v_request_time, ':', 2)::integer;
      v_end_minute := split_part(v_delivered_time, ':', 1)::integer * 60 + split_part(v_delivered_time, ':', 2)::integer;
      IF v_end_minute >= v_start_minute THEN
        v_response_minutes := v_end_minute - v_start_minute;
      ELSIF coalesce((v_source->>'overnight_rollover')::boolean, false)
         AND coalesce((v_source->>'arrival_time_day_carry')::boolean, false) THEN
        v_response_minutes := v_end_minute + 1440 - v_start_minute;
      END IF;
    END IF;

    v_core := jsonb_set(
      v_core,
      '{calculated_fields}',
      coalesce(v_core->'calculated_fields','{}'::jsonb) ||
        jsonb_build_object('Kecepatan Respon (Menit)', v_response_minutes),
      true
    );
    v_payload := jsonb_set(v_payload, '{core_data}', v_core, true);

    IF EXISTS (
      SELECT 1 FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 3 AND qr.profile_year = 2026 AND qr.subject_key = v_key
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);
    BEGIN
      v_record_id := aureka_quality.save_quality_logbook(NULL, v_payload, v_responses, v_attributions);
      v_imported := v_imported + 1;
      v_imported_ids := v_imported_ids || jsonb_build_array(
        jsonb_build_object('subject_key', v_key, 'record_id', v_record_id)
      );
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1 FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 3 AND qr.profile_year = 2026 AND qr.subject_key = v_key
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

REVOKE ALL ON FUNCTION aureka_quality.import_ambulance_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_ambulance_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_ambulance_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_ambulance_logbook_batch(jsonb) TO authenticated;
