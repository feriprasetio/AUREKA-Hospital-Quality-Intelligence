-- Secure, idempotent Rawat Inap Saraf 2026 patient-episode workbook import.
-- Seven indicators without published choices remain not_in_master; Linen/Medicine
-- use only the existing published options and preserve their current classifications.

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_saraf_inpatient_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 26
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-rawat-inap-saraf-2026:row:%'
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_saraf_inpatient_logbook_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb;
  v_payload jsonb;
  v_core jsonb;
  v_form jsonb;
  v_calc jsonb;
  v_source jsonb;
  v_source_values jsonb;
  v_source_cells jsonb;
  v_values jsonb;
  v_responses jsonb;
  v_response jsonb;
  v_map record;
  v_indicator_id uuid;
  v_code text;
  v_subject_key text;
  v_source_row integer;
  v_admission_date date;
  v_discharge_date date;
  v_start_date_text text;
  v_end_date_text text;
  v_source_code smallint;
  v_response_code smallint;
  v_source_cell_count integer;
  v_response_count integer;
  v_option_count integer;
  v_record_id uuid;
  v_seen_codes text[];
  v_seen_ids uuid[];
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_expected_codes text[] := ARRAY['26.1','26.2','26.3','26.4','26.5','26.6','26.7','26.8','26.9','26.10','26.11','26.12','26.13','26.14','26.15','26.16'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Rawat Inap Saraf.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Rawat Inap Saraf hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(26) THEN
    RAISE EXCEPTION 'Akses ke unit Rawat Inap Saraf tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch Rawat Inap Saraf harus berupa array baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN
    RAISE EXCEPTION 'Batch impor Rawat Inap Saraf harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Rawat Inap Saraf berisi kunci baris Excel kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT ip.code)
    FROM aureka_quality.indicator_profiles ip
    WHERE ip.room_id = 26
      AND ip.profile_year = 2026
      AND ip.is_active = true
      AND ip.status = 'published'
      AND ip.code = ANY(v_expected_codes)
  ) <> 16 THEN
    RAISE EXCEPTION 'Enam belas profil indikator Rawat Inap Saraf 26.1–26.16 harus aktif dan terbit.' USING ERRCODE = '23503';
  END IF;

-- Validate the complete batch before the first write. Invalid source rows are
  -- disclosed by the preview parser and are not sent in this batch.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_calc := v_core->'calculated_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_source_cells := v_source->'source_indicator_cells';
    v_values := v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload),'') <> 'object'
       OR coalesce(jsonb_typeof(v_core),'') <> 'object'
       OR coalesce(jsonb_typeof(v_form),'') <> 'object'
       OR coalesce(jsonb_typeof(v_calc),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source_cells),'') <> 'object'
       OR coalesce(jsonb_typeof(v_values),'') <> 'object'
       OR coalesce(jsonb_typeof(v_responses),'') <> 'array'
       OR coalesce(jsonb_typeof(v_row->'attributions'),'') <> 'array' THEN
      RAISE EXCEPTION 'Struktur payload episode Rawat Inap Saraf tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Atribusi episode Saraf tidak diizinkan pada impor workbook.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(v_responses) > 16 THEN
      RAISE EXCEPTION 'Respons indikator melebihi enam belas indikator Rawat Inap Saraf.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id','') <> '26'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_payload->>'status','') <> 'ready'
       OR coalesce(v_payload->>'review_required','false') <> 'true'
       OR coalesce(v_payload->>'entered_by','') <> v_user_id::text
       OR v_payload->'subject_json'->'source_import' IS DISTINCT FROM v_source
       OR coalesce(v_core->>'room_id','') <> '26'
       OR coalesce(v_core->>'unit_name','') <> 'Rawat Inap Saraf'
       OR coalesce(v_core->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_core->>'status','') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status','') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL
       OR coalesce(v_source->>'idempotency_basis','') <> 'room_year_source_excel_row'
       OR coalesce(jsonb_typeof(v_source->'source_warnings'),'') <> 'array' THEN
      RAISE EXCEPTION 'Payload hanya menerima episode Rawat Inap Saraf 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR (nullif(btrim(v_source->>'source_excel_no'),'') IS NOT NULL
           AND btrim(v_source->>'source_excel_no') !~ '^[0-9]+$') THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber Rawat Inap Saraf tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    v_subject_key := 'excel-pmkp-rawat-inap-saraf-2026:row:' || v_source_row::text;

    IF v_source_row < 3 OR v_source_row > 5102
       OR coalesce(v_payload->>'subject_key','') <> v_subject_key
       OR nullif(btrim(v_form->>'No.'),'') IS DISTINCT FROM nullif(btrim(v_source->>'source_excel_no'),'') THEN
      RAISE EXCEPTION 'Kunci idempotensi harus memakai nomor baris fisik Excel 3–5102.' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'),'') IS NULL
       OR nullif(btrim(v_form->>'Diagnosa Tegak'),'') IS NULL
       OR nullif(btrim(v_form->>'Tanggal Masuk'),'') IS NULL THEN
      RAISE EXCEPTION 'Nama Pasien, No. Rekam Medis, Diagnosa Tegak, dan Tanggal Masuk wajib tersedia (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    v_start_date_text := v_form->>'Tanggal Masuk';
    IF v_start_date_text !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Tanggal Masuk harus ISO YYYY-MM-DD (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_date := v_start_date_text::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Masuk tidak valid (baris Excel %).', v_source_row USING ERRCODE = '22007';
    END;

    IF v_admission_date::text <> v_start_date_text
       OR extract(year FROM v_admission_date)::integer <> 2026
       OR coalesce(v_payload->>'record_date','') <> v_admission_date::text
       OR coalesce(v_core->>'admission_at','') <> v_admission_date::text THEN
      RAISE EXCEPTION 'Tanggal Masuk harus konsisten dan berada pada profil 2026 (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    v_end_date_text := nullif(btrim(v_form->>'Tanggal Keluar'),'');
    v_discharge_date := NULL;

    IF v_end_date_text IS NOT NULL THEN
      IF v_end_date_text !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Tanggal Keluar terisi tetapi bukan ISO YYYY-MM-DD (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;

      BEGIN
        v_discharge_date := v_end_date_text::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Tanggal Keluar tidak valid (baris Excel %).', v_source_row USING ERRCODE = '22007';
      END;

      IF v_discharge_date::text <> v_end_date_text
         OR extract(year FROM v_discharge_date)::integer <> 2026
         OR v_discharge_date < v_admission_date
         OR coalesce(v_core->>'discharge_at','') <> v_discharge_date::text THEN
        RAISE EXCEPTION 'Tanggal Keluar harus valid, tidak sebelum Tanggal Masuk, dan konsisten pada profil 2026 (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_form->>'Lenght of Stay','') <> (v_discharge_date - v_admission_date)::text
         OR coalesce(v_calc->>'Lenght of Stay','') <> (v_discharge_date - v_admission_date)::text THEN
        RAISE EXCEPTION 'LOS turunan harus sama dengan selisih tanggal sumber (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;
    ELSE
      IF v_core->'discharge_at' IS DISTINCT FROM 'null'::jsonb
         OR v_form->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb
         OR v_calc->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'Episode ongoing harus mempertahankan Tanggal Keluar dan LOS sebagai null (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;

    IF coalesce(v_core->>'patient_name','') <> coalesce(v_form->>'Nama Pasien','')
       OR coalesce(v_core->>'medical_record_no','') <> coalesce(v_form->>'No. Rekam Medis','') THEN
      RAISE EXCEPTION 'Identitas pasien pada core_data tidak konsisten (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_source_cells)) <> 16 THEN
      RAISE EXCEPTION 'Sembilan sel sumber indikator Rawat Inap Saraf harus dipertahankan (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    FOR v_map IN
      SELECT * FROM (VALUES
        ('26.7','Visite Spesialis'),
        ('26.16','Validitas Asesmen Keperawatan'),
        ('26.6','Transfer IGD'),
        ('26.4','Kekosongan Linen'),
        ('26.5','Kekosongan Obat'),
        ('26.1','(STEMI) EKG di IGD'),
        ('26.2','(STEMI) Killip Stratifikasi2'),
        ('26.3','(STEMI) Door-to-Balloon ≤90 Menit'),
        ('26.15','(STEMI) Revaskularisasi'),
        ('26.8','(STEMI) LOS <5 Hari'),
        ('26.14','(STEMI) Survival RS'),
        ('26.10','(SNH) rTPA <4,5h'),
        ('26.11','(SNH) CT Scan ≤30’'),
        ('26.12','(SNH) Antiplatelet/Antikoagulan'),
        ('26.13','(SNH) Pulang Hidup'),
        ('26.9','(SNH) LOS <7')
      ) AS mapping(code, header)
    LOOP
      IF NOT (v_source_cells ? v_map.code)
         OR coalesce(v_form->>v_map.header,'') <> coalesce(v_source_cells->>v_map.code,'') THEN
        RAISE EXCEPTION 'Sel sumber indikator % tidak konsisten dengan form_fields (baris Excel %).', v_map.header, v_source_row USING ERRCODE = '22023';
      END IF;

      IF nullif(btrim(v_source_cells->>v_map.code),'') IS NOT NULL
         AND (
           NOT (v_source_values ? v_map.code)
           OR coalesce(v_source_values->>v_map.code,'') <> coalesce(v_source_cells->>v_map.code,'')
         ) THEN
        RAISE EXCEPTION 'Nilai sumber indikator % hilang/tidak konsisten (baris Excel %).', v_map.code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF nullif(btrim(v_source_cells->>v_map.code),'') IS NULL
         AND (v_source_values ? v_map.code) THEN
        RAISE EXCEPTION 'Respons indikator % dibuat dari sel sumber kosong (baris Excel %).', v_map.code, v_source_row USING ERRCODE = '22023';
      END IF;
    END LOOP;

    SELECT count(*) INTO v_source_cell_count
    FROM jsonb_each_text(v_source_cells) AS cell(key,value)
    WHERE key = ANY(v_expected_codes)
      AND nullif(btrim(value),'') IS NOT NULL;

    v_response_count := jsonb_array_length(v_responses);
    IF (SELECT count(*) FROM jsonb_object_keys(v_source_values)) <> v_response_count
       OR (SELECT count(*) FROM jsonb_object_keys(v_values)) <> v_response_count
       OR v_source_cell_count <> v_response_count THEN
      RAISE EXCEPTION 'Jumlah sel indikator terisi, source values, indicator values, dan respons tidak sama (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_codes := ARRAY[]::text[];
    v_seen_ids := ARRAY[]::uuid[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id','') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator tidak valid (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;

      SELECT ip.code INTO v_code
      FROM aureka_quality.indicator_profiles ip
      WHERE ip.id = v_indicator_id
        AND ip.room_id = 26
        AND ip.profile_year = 2026
        AND ip.is_active = true
        AND ip.status = 'published'
        AND ip.code = ANY(v_expected_codes);

      IF v_code IS NULL
         OR v_code = ANY(v_seen_codes)
         OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator tidak aktif, salah unit/tahun, atau duplikat (baris Excel %).', v_source_row USING ERRCODE = '23503';
      END IF;

      v_seen_codes := array_append(v_seen_codes,v_code);
      v_seen_ids := array_append(v_seen_ids,v_indicator_id);

      IF nullif(btrim(v_response->>'response_label'),'') IS NULL
         OR coalesce(v_response->>'review_status','') <> 'pending'
         OR coalesce(v_response->'raw_value'->>'review_required','false') <> 'true'
         OR coalesce(v_response->'raw_value'->>'answer','') <> coalesce(v_response->>'response_label','')
         OR coalesce(v_response->'raw_value'->>'source_value','') <> coalesce(v_source_values->>v_code,'')
         OR v_response->'raw_value'->'code' IS DISTINCT FROM v_response->'response_code'
         OR v_response->'raw_value' IS DISTINCT FROM v_values->v_code
         OR coalesce(v_response->>'other_text','') <> coalesce(v_source_values->>v_code,'') THEN
        RAISE EXCEPTION 'Nilai sumber, respons, provenance, atau status review indikator % tidak konsisten (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN (
        'mapped_pending_classification',
        'mapped_existing_master',
        'not_in_master',
        'ambiguous_master',
        'source_code_conflict'
      ) THEN
        RAISE EXCEPTION 'Status pemetaan indikator % tidak didukung (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      v_response_code := NULL;
      v_source_code := NULL;

      IF nullif(v_response->>'response_code','') IS NOT NULL THEN
        v_response_code := (v_response->>'response_code')::smallint;
        IF v_response_code NOT BETWEEN 1 AND 3 THEN
          RAISE EXCEPTION 'Kode respons indikator % di luar rentang yang diizinkan (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      END IF;

      IF nullif(v_response->'raw_value'->>'source_code','') IS NOT NULL THEN
        IF coalesce(v_response->'raw_value'->>'source_code','') !~ '^[1-3]$' THEN
          RAISE EXCEPTION 'Kode sumber indikator % tidak valid (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
        v_source_code := (v_response->'raw_value'->>'source_code')::smallint;
      END IF;

      IF v_response->'raw_value'->>'mapping_status' = 'mapped_existing_master' THEN
        IF v_code NOT IN ('26.1','26.2','26.3','26.4','26.5','26.6','26.9','26.10','26.11','26.12','26.13','26.14')
           OR v_response_code IS NULL
           OR (v_source_code IS NOT NULL AND v_source_code IS DISTINCT FROM v_response_code) THEN
          RAISE EXCEPTION 'Pemetaan master existing hanya diizinkan untuk alias Linen/Obat dengan kode sumber yang cocok (baris Excel %).', v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*) INTO v_option_count
        FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
        WHERE ip.id = v_indicator_id
          AND opt->>'label' = v_response->>'response_label'
          AND opt->>'code' = v_response_code::text
          AND opt->'numerator' IS NOT DISTINCT FROM v_response->'raw_value'->'numerator'
          AND opt->'denominator' IS NOT DISTINCT FROM v_response->'raw_value'->'denominator';

        IF v_option_count <> 1 THEN
          RAISE EXCEPTION 'Alias indikator % tidak cocok unik dengan pilihan master aktif (baris Excel %).', v_code, v_source_row USING ERRCODE = '23503';
        END IF;
      ELSIF v_response->'raw_value'->>'mapping_status' = 'mapped_pending_classification' THEN
        IF (v_source_code IS NOT NULL AND v_response_code IS DISTINCT FROM v_source_code)
           OR v_response->'raw_value'->'numerator' IS DISTINCT FROM 'null'::jsonb
           OR coalesce(v_response->'raw_value'->>'denominator','') <> 'true' THEN
          RAISE EXCEPTION 'Klasifikasi indikator % harus tetap pending tanpa numerator (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*) INTO v_option_count
        FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
        WHERE ip.id = v_indicator_id
          AND opt->>'label' = v_response->>'response_label'
          AND opt->'code' IS NOT DISTINCT FROM v_response->'response_code'
          AND opt->'numerator' = 'null'::jsonb
          AND opt->>'denominator' = 'true'
          AND opt->>'review_required' = 'true';

        IF v_option_count <> 1 THEN
          RAISE EXCEPTION 'Pilihan indikator % yang menunggu klasifikasi tidak cocok unik dengan master (baris Excel %).', v_code, v_source_row USING ERRCODE = '23503';
        END IF;
      ELSIF v_response->'raw_value'->>'mapping_status' = 'not_in_master' THEN
        IF v_response_code IS NOT NULL
           OR v_response->'raw_value'->'numerator' IS DISTINCT FROM 'null'::jsonb
           OR coalesce(v_response->'raw_value'->>'denominator','') <> 'true' THEN
          RAISE EXCEPTION 'Nilai not_in_master indikator % tidak boleh diberi kode numerator/denominator (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*) INTO v_option_count
        FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
        WHERE ip.id = v_indicator_id
          AND opt->>'label' = v_response->>'response_label';

        IF v_option_count <> 0 THEN
          RAISE EXCEPTION 'Respons indikator % ditandai not_in_master tetapi label ditemukan pada pilihan master (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      ELSIF v_response->'raw_value'->>'mapping_status' = 'ambiguous_master' THEN
        IF v_response_code IS NOT NULL
           OR v_response->'raw_value'->'numerator' IS DISTINCT FROM 'null'::jsonb
           OR coalesce(v_response->'raw_value'->>'denominator','') <> 'true' THEN
          RAISE EXCEPTION 'Respons ambigu indikator % tidak boleh diberi klasifikasi (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*) INTO v_option_count
        FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
        WHERE ip.id = v_indicator_id
          AND opt->>'label' = v_response->>'response_label';

        IF v_option_count < 2 THEN
          RAISE EXCEPTION 'Respons indikator % ditandai ambigu tanpa dua pilihan master yang cocok (baris Excel %).', v_code, v_source_row USING ERRCODE = '23503';
        END IF;
      ELSIF v_response->'raw_value'->>'mapping_status' = 'source_code_conflict' THEN
        IF v_response_code IS NOT NULL
           OR v_source_code IS NULL
           OR v_response->'raw_value'->'numerator' IS DISTINCT FROM 'null'::jsonb
           OR coalesce(v_response->'raw_value'->>'denominator','') <> 'true' THEN
          RAISE EXCEPTION 'Konflik kode indikator % harus tetap tanpa klasifikasi (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*) INTO v_option_count
        FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
        WHERE ip.id = v_indicator_id
          AND opt->>'label' = v_response->>'response_label'
          AND opt->>'code' IS DISTINCT FROM v_source_code::text;

        IF v_option_count < 1 THEN
          RAISE EXCEPTION 'Kode sumber indikator % tidak bertentangan dengan pilihan master (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> v_response_count THEN
      RAISE EXCEPTION 'Jumlah indikator unik dan respons tidak sama (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Every row in the batch has passed validation. Idempotency is keyed by its
  -- physical Excel row, not patient name, MRN, or the workbook's sequence number.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
      FROM aureka_quality.quality_records qr
      WHERE qr.room_id = 26
        AND qr.profile_year = 2026
        AND qr.measurement_grain = 'patient_episode'
        AND qr.subject_key = v_subject_key
        AND qr.status <> 'archived'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_record_id := aureka_quality.save_quality_logbook(
        NULL,
        v_payload,
        v_row->'responses',
        '[]'::jsonb
      );
      IF v_record_id IS NULL THEN
        RAISE EXCEPTION 'Server tidak mengembalikan identitas episode Rawat Inap Saraf.' USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
        FROM aureka_quality.quality_records qr
        WHERE qr.room_id = 26
          AND qr.profile_year = 2026
          AND qr.measurement_grain = 'patient_episode'
          AND qr.subject_key = v_subject_key
          AND qr.status <> 'archived'
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
    'skipped_existing_count', v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_saraf_inpatient_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_saraf_inpatient_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_saraf_inpatient_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_saraf_inpatient_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_saraf_inpatient_logbook_batch(jsonb) IS
'Imports Rawat Inap Saraf 2026 patient episodes from the authenticated UI. Mismatched 26.8 and profiles without published options 26.15/26.16 remain not_in_master; no numerator is inferred; all responses require review; physical Excel row is the idempotency key.';
