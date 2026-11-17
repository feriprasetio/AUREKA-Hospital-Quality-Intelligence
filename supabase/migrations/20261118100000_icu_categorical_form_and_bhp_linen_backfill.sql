-- Secure ICU/HCU 2026 workbook import.
-- Source identity is the physical Excel row, not the workbook's non-unique sequence column.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_icu_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 14
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-icu-2026:row:%'
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_icu_logbook_batch(p_rows jsonb)
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
  v_source_columns jsonb;
  v_bhp_source jsonb;
  v_values jsonb;
  v_responses jsonb;
  v_response jsonb;
  v_option_count integer;
  v_indicator_id uuid;
  v_code text;
  v_seen_codes text[];
  v_seen_ids uuid[];
  v_source_row integer;
  v_admission_date date;
  v_discharge_date date;
  v_los integer;
  v_subject_key text;
  v_response_code smallint;
  v_review_status text;
  v_record_id uuid;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_expected_codes text[] := ARRAY['14.1','14.2','14.3','14.4','14.5','14.6','14.7','14.8','14.9'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook ICU.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook ICU hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(14) THEN
    RAISE EXCEPTION 'Akses ke Intensive Care Unit & High Care Unit tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor ICU harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN
    RAISE EXCEPTION 'Batch impor ICU harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch ICU berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT ip.code)
    FROM aureka_quality.indicator_profiles ip
    WHERE ip.room_id = 14
      AND ip.profile_year = 2026
      AND ip.is_active = true
      AND ip.status = 'published'
      AND ip.code = ANY (v_expected_codes)
  ) <> 9 THEN
    RAISE EXCEPTION 'Sembilan master indikator ICU 14.1–14.9 harus aktif dan terbit sebelum impor.' USING ERRCODE = '23503';
  END IF;

  -- Validate the entire batch before the first write.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_calc := v_core->'calculated_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_source_columns := v_source->'source_indicator_columns';
    v_bhp_source := v_source->'source_bhp_linen';
    v_values := v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_calc), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_columns), '') <> 'object'
       OR coalesce(jsonb_typeof(v_bhp_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR jsonb_array_length(v_responses) <> 9
       OR coalesce(jsonb_typeof(v_row->'attributions'), '') <> 'array'
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Struktur payload ICU harus memiliki delapan respons indikator dan tanpa atribusi otomatis.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '14'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true'
       OR coalesce(v_core->>'room_id', '') <> '14'
       OR coalesce(v_core->>'unit_name', '') <> 'Intensive Care Unit & High Care Unit'
       OR coalesce(v_core->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_core->>'status', '') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status', '') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL THEN
      RAISE EXCEPTION 'Payload hanya menerima episode ICU/HCU 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber ICU tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003 THEN
      RAISE EXCEPTION 'Nomor baris Excel ICU harus berada pada rentang 3–5003.' USING ERRCODE = '22023';
    END IF;

    v_subject_key := 'excel-pmkp-icu-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key', '') <> v_subject_key
       OR coalesce(v_source->>'idempotency_basis', '') <> 'room_year_source_excel_row' THEN
      RAISE EXCEPTION 'Kunci idempotensi ICU harus menggunakan nomor baris sumber Excel.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_date := (v_form->>'Tanggal Masuk')::date;
      v_discharge_date := (v_form->>'Tanggal Keluar')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal masuk/keluar ICU tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF v_admission_date::text <> coalesce(v_form->>'Tanggal Masuk', '')
       OR v_discharge_date::text <> coalesce(v_form->>'Tanggal Keluar', '')
       OR extract(year FROM v_admission_date)::integer <> 2026
       OR v_discharge_date < v_admission_date
       OR coalesce(v_payload->>'record_date', '') <> v_admission_date::text
       OR coalesce(v_core->>'admission_at', '') <> v_admission_date::text
       OR coalesce(v_core->>'discharge_at', '') <> v_discharge_date::text THEN
      RAISE EXCEPTION 'Tanggal episode ICU harus konsisten, tidak terbalik, dan memiliki tanggal masuk tahun 2026 pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_los := v_discharge_date - v_admission_date;
    IF coalesce(v_form->>'Lenght of Stay', '') !~ '^[0-9]+$'
       OR coalesce(v_calc->>'Lenght of Stay', '') <> v_los::text
       OR coalesce(v_form->>'Lenght of Stay', '') <> v_los::text THEN
      RAISE EXCEPTION 'LOS ICU harus sama dengan selisih tanggal masuk dan keluar pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'), '') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'), '') IS NULL
       OR nullif(btrim(v_form->>'Diagnosa Tegak'), '') IS NULL
       OR nullif(btrim(v_form->>'Status Pulang'), '') IS NULL
       OR nullif(btrim(v_form->>'Perawat Penerima'), '') IS NULL
       OR nullif(btrim(v_form->>'DPJP'), '') IS NULL
       OR coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '') THEN
      RAISE EXCEPTION 'Identitas dan informasi episode pada form_fields ICU tidak lengkap/konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_bhp_source->>'source_header'), '') IS NULL
       OR coalesce(v_bhp_source->>'indicator_code', '') <> '14.1'
       OR nullif(btrim(v_bhp_source->>'source_value'), '') IS NULL
       OR coalesce(v_bhp_source->>'source_value', '') <> coalesce(v_form->>'Kekosongan BHP/Linen', '')
       OR coalesce(v_bhp_source->>'source_value', '') <> coalesce(v_source_values->>'14.1', '')
       OR coalesce(v_source_columns->>'14.1', '') <> coalesce(v_bhp_source->>'source_header', '')
       OR coalesce(v_values->'14.1'->>'source_value', '') <> coalesce(v_bhp_source->>'source_value', '') THEN
      RAISE EXCEPTION 'Kolom Excel Kekosongan BHP/Linen harus dipetakan ke indikator 14.1 dengan nilai dan header sumber yang konsisten.' USING ERRCODE = '22023';
    END IF;

    IF (
      SELECT count(*)
      FROM jsonb_object_keys(v_source_values)
    ) <> 9
       OR (
         SELECT count(*)
         FROM jsonb_object_keys(v_values)
       ) <> 9 THEN
      RAISE EXCEPTION 'Sumber dan nilai inti ICU harus memuat tepat sembilan indikator 14.1–14.9.' USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator ICU tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;

      SELECT ip.code
      INTO v_code
      FROM aureka_quality.indicator_profiles ip
      WHERE ip.id = v_indicator_id
        AND ip.room_id = 14
        AND ip.profile_year = 2026
        AND ip.is_active = true
        AND ip.status = 'published'
        AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_code = ANY(v_seen_codes)
         OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada master indikator ICU yang tidak aktif, bukan milik unit/tahun, atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_indicator_id);
      v_seen_codes := array_append(v_seen_codes, v_code);

      IF nullif(v_response->>'response_label', '') IS NULL
         OR coalesce(v_source_values->>v_code, '') = ''
         OR coalesce(v_response->'raw_value'->>'source_value', '') <> coalesce(v_source_values->>v_code, '')
         OR coalesce(v_response->'raw_value'->>'answer', '') <> coalesce(v_response->>'response_label', '')
         OR coalesce(v_values->v_code->>'source_value', '') <> coalesce(v_source_values->>v_code, '')
         OR coalesce(v_values->v_code->>'answer', '') <> coalesce(v_response->>'response_label', '')
         OR v_response->'raw_value' IS DISTINCT FROM v_values->v_code THEN
        RAISE EXCEPTION 'Nilai sumber/inti/respons indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      v_review_status := coalesce(v_response->>'review_status', '');
      IF nullif(v_response->>'response_code', '') IS NULL THEN
        IF v_review_status <> 'pending'
           OR coalesce(v_response->'raw_value'->>'review_required', 'false') <> 'true'
           OR coalesce(v_response->'raw_value'->>'mapping_status', '') NOT IN ('master_pending', 'source_master_conflict', 'not_in_master', 'ambiguous_master') THEN
          RAISE EXCEPTION 'Respons indikator % tanpa kode master harus berstatus pending dengan alasan pemetaan pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      ELSE
        v_response_code := (v_response->>'response_code')::smallint;
        IF v_response_code NOT BETWEEN 1 AND 3
           OR v_review_status <> 'not_required'
           OR coalesce(v_response->'raw_value'->>'review_required', 'true') <> 'false'
           OR coalesce(v_response->'raw_value'->>'mapping_status', '') <> 'mapped'
           OR coalesce(v_response->'raw_value'->>'code', '') <> v_response_code::text THEN
          RAISE EXCEPTION 'Respons indikator % memiliki kode atau status telaah yang tidak valid pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*)
        INTO v_option_count
        FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
        WHERE ip.id = v_indicator_id
          AND opt->>'label' = v_response->>'response_label'
          AND opt->>'code' = v_response_code::text
          AND jsonb_typeof(opt->'numerator') = 'boolean'
          AND jsonb_typeof(opt->'denominator') = 'boolean'
          AND coalesce((opt->>'review_required')::boolean, false) = false;

        IF v_option_count <> 1 THEN
          RAISE EXCEPTION 'Pilihan indikator % tidak ditemukan secara unik pada master aktif untuk baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> 9
       OR NOT ('14.1' = ANY(v_seen_codes))
       OR NOT ('14.2' = ANY(v_seen_codes))
       OR NOT ('14.3' = ANY(v_seen_codes))
       OR NOT ('14.4' = ANY(v_seen_codes))
       OR NOT ('14.5' = ANY(v_seen_codes))
       OR NOT ('14.6' = ANY(v_seen_codes))
       OR NOT ('14.7' = ANY(v_seen_codes))
       OR NOT ('14.8' = ANY(v_seen_codes))
       OR NOT ('14.9' = ANY(v_seen_codes)) THEN
      RAISE EXCEPTION 'Setiap episode ICU wajib memiliki tepat satu respons untuk indikator 14.1–14.9.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Write only after every row in this batch passes all validations.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
      FROM aureka_quality.quality_records qr
      WHERE qr.room_id = 14
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
        RAISE EXCEPTION 'Server tidak mengembalikan identitas episode ICU.' USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
        FROM aureka_quality.quality_records qr
        WHERE qr.room_id = 14
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

REVOKE ALL ON FUNCTION aureka_quality.import_icu_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_icu_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_icu_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_icu_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_icu_logbook_batch(jsonb) IS
'Imports ICU/HCU 2026 Logbook episodes from the authenticated AUREKA workspace. The physical Excel row is the idempotency key; the BHP/Linen column maps to indicator 14.1 and unmatched labels remain pending for review.';


-- ICU/HCU logbook answers are categorical observations per patient episode.
UPDATE aureka_quality.indicator_profiles
SET schema_json = jsonb_set(
  coalesce(schema_json, '{}'::jsonb),
  '{response_capture_mode}',
  '"categorical"'::jsonb,
  true
)
WHERE room_id = 14
  AND profile_year = 2026
  AND is_active = true
  AND status = 'published'
  AND code = ANY (ARRAY['14.1','14.2','14.3','14.4','14.5','14.6','14.7','14.8','14.9']);



-- Backfills only the missing combined BHP/Linen profile (14.1) on existing
-- ICU episodes. All other patient fields and indicator responses are untouched.
CREATE OR REPLACE FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_source jsonb;
  v_source_values jsonb;
  v_source_columns jsonb;
  v_bhp jsonb;
  v_values jsonb;
  v_response jsonb;
  v_profile_id uuid;
  v_record_id uuid;
  v_source_row integer;
  v_subject_key text;
  v_existing_core jsonb;
  v_existing_subject jsonb;
  v_existing_bhp text;
  v_backfilled integer := 0;
  v_preserved integer := 0;
  v_not_found integer := 0;
  v_response_inserted integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk memperbarui sumber BHP/Linen ICU.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Pembaruan sumber BHP/Linen hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(14) THEN
    RAISE EXCEPTION 'Akses ke Intensive Care Unit & High Care Unit tidak tersedia.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 20 THEN
    RAISE EXCEPTION 'Batch backfill BHP/Linen harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  SELECT ip.id INTO v_profile_id
  FROM aureka_quality.indicator_profiles ip
  WHERE ip.room_id = 14 AND ip.profile_year = 2026
    AND ip.code = '14.1' AND ip.is_active = true AND ip.status = 'published'
  ORDER BY ip.version DESC
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profil indikator ICU 14.1 belum aktif dan terbit.' USING ERRCODE = '23503';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_source_columns := v_source->'source_indicator_columns';
    v_bhp := v_source->'source_bhp_linen';
    v_values := v_core->'indicator_values';

    IF coalesce(v_payload->>'room_id','') <> '14'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR coalesce(v_source->>'idempotency_basis','') <> 'room_year_source_excel_row'
       OR coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR coalesce(v_bhp->>'indicator_code','') <> '14.1'
       OR nullif(btrim(v_bhp->>'source_header'),'') IS NULL
       OR nullif(btrim(v_bhp->>'source_value'),'') IS NULL
       OR coalesce(v_source_values->>'14.1','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_source_columns->>'14.1','') <> coalesce(v_bhp->>'source_header','')
       OR coalesce(v_form->>'Kekosongan BHP/Linen','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_values->'14.1'->>'source_value','') <> coalesce(v_bhp->>'source_value','') THEN
      RAISE EXCEPTION 'Sumber BHP/Linen tidak konsisten dengan profil 14.1 atau metadata baris Excel.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003 THEN
      RAISE EXCEPTION 'Nomor baris sumber Excel ICU tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_subject_key := 'excel-pmkp-icu-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key','') <> v_subject_key THEN
      RAISE EXCEPTION 'Kunci idempotensi tidak sesuai dengan nomor baris Excel.' USING ERRCODE = '22023';
    END IF;

    SELECT item.value INTO v_response
    FROM jsonb_array_elements(coalesce(v_row->'responses','[]'::jsonb)) item(value)
    WHERE item.value->>'indicator_id' = v_profile_id::text;

    IF v_response IS NULL
       OR coalesce(v_response->>'response_label','') <> coalesce(v_values->'14.1'->>'answer','')
       OR v_response->'raw_value' IS DISTINCT FROM v_values->'14.1'
       OR coalesce(v_response->'raw_value'->>'source_value','') <> coalesce(v_bhp->>'source_value','')
       OR coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN ('mapped','master_pending','source_master_conflict','not_in_master','ambiguous_master') THEN
      RAISE EXCEPTION 'Respons 14.1 tidak cocok dengan nilai sumber BHP/Linen.' USING ERRCODE = '22023';
    END IF;

    SELECT qr.id, qr.core_data, qr.subject_json
      INTO v_record_id, v_existing_core, v_existing_subject
    FROM aureka_quality.quality_records qr
    WHERE qr.room_id = 14
      AND qr.profile_year = 2026
      AND qr.measurement_grain = 'patient_episode'
      AND qr.subject_key = v_subject_key
      AND qr.status <> 'archived'
    FOR UPDATE;

    IF v_record_id IS NULL THEN
      v_not_found := v_not_found + 1;
      CONTINUE;
    END IF;

    v_existing_bhp := coalesce(
      v_existing_core->'form_fields'->>'Kekosongan BHP/Linen',
      v_existing_core->'form_fields'->>'Kekosongan BHP/Linen (sumber belum dipetakan)',
      ''
    );

    IF nullif(btrim(v_existing_bhp),'') IS NOT NULL
       OR coalesce(v_existing_core->'indicator_values','{}'::jsonb) ? '14.1'
       OR EXISTS (
         SELECT 1 FROM aureka_quality.quality_record_responses rr
         WHERE rr.record_id = v_record_id AND rr.indicator_id = v_profile_id
       )
       OR (SELECT qr.status FROM aureka_quality.quality_records qr WHERE qr.id = v_record_id) <> 'ready' THEN
      v_preserved := v_preserved + 1;
      CONTINUE;
    END IF;

    UPDATE aureka_quality.quality_records qr
    SET core_data =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(qr.core_data,'{}'::jsonb),
            '{form_fields}',
            coalesce(qr.core_data->'form_fields','{}'::jsonb) ||
              jsonb_build_object(
                'Kekosongan BHP/Linen', v_bhp->>'source_value',
                'Kekosongan BHP/Linen (sumber belum dipetakan)', v_bhp->>'source_value'
              ),
            true
          ),
          '{indicator_values}',
          coalesce(qr.core_data->'indicator_values','{}'::jsonb) ||
            jsonb_build_object('14.1', v_values->'14.1'),
          true
        ),
        '{source_import}',
        coalesce(qr.core_data->'source_import','{}'::jsonb) ||
          jsonb_build_object(
            'source_indicator_values',
              coalesce(qr.core_data->'source_import'->'source_indicator_values','{}'::jsonb) ||
                jsonb_build_object('14.1', v_bhp->>'source_value'),
            'source_indicator_columns',
              coalesce(qr.core_data->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                jsonb_build_object('14.1', v_bhp->>'source_header'),
            'source_bhp_linen', v_bhp,
            'source_bhp_linen_backfill_at', now()
          ),
        true
      ),
      subject_json =
        jsonb_set(
          coalesce(qr.subject_json,'{}'::jsonb),
          '{source_import}',
          coalesce(qr.subject_json->'source_import','{}'::jsonb) ||
            jsonb_build_object(
              'source_indicator_values',
                coalesce(qr.subject_json->'source_import'->'source_indicator_values','{}'::jsonb) ||
                  jsonb_build_object('14.1', v_bhp->>'source_value'),
              'source_indicator_columns',
                coalesce(qr.subject_json->'source_import'->'source_indicator_columns','{}'::jsonb) ||
                  jsonb_build_object('14.1', v_bhp->>'source_header'),
              'source_bhp_linen', v_bhp
            ),
          true
        ),
      updated_at = now()
    WHERE qr.id = v_record_id;

    INSERT INTO aureka_quality.quality_record_responses (
      record_id, indicator_id, response_label, response_code,
      raw_value, other_text, review_status
    )
    VALUES (
      v_record_id,
      v_profile_id,
      nullif(v_response->>'response_label',''),
      nullif(v_response->>'response_code','')::smallint,
      v_response->'raw_value',
      CASE WHEN coalesce((v_response->'raw_value'->>'review_required')::boolean,false)
        THEN v_bhp->>'source_value' ELSE NULL END,
      coalesce(v_response->>'review_status','pending')
    )
    ON CONFLICT (record_id, indicator_id) DO NOTHING;

    GET DIAGNOSTICS v_response_inserted = ROW_COUNT;
    IF v_response_inserted <> 1 THEN
      RAISE EXCEPTION 'Respons indikator ICU 14.1 sudah ada saat backfill; transaksi dibatalkan agar data tidak tertimpa.' USING ERRCODE = '23505';
    END IF;

    v_backfilled := v_backfilled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'backfilled_count', v_backfilled,
    'preserved_count', v_preserved,
    'not_found_count', v_not_found
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION aureka_quality.backfill_icu_logbook_bhp_linen_batch(jsonb) IS
'Backfills only missing ICU/HCU 2026 indicator 14.1 BHP/Linen source values on existing ready episodes matched by physical Excel row. It preserves every other field and existing indicator response.';
