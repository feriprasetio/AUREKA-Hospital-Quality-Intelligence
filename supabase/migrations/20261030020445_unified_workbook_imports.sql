-- Unify workbook imports: adaptive, smaller IBS transactions and a dedicated daily Farmasi importer.
-- The timeout is scoped to the two import RPCs; ordinary logbook saves keep their existing role timeout.

ALTER FUNCTION aureka_quality.import_ibs_logbook_batch(jsonb)
  SET statement_timeout TO '60s';

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_pharmacy_daily_metric_2026
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 5
    AND profile_year = 2026
    AND measurement_grain = 'daily_metric'
    AND status <> 'archived'
    AND subject_key IS NOT NULL;

CREATE OR REPLACE FUNCTION aureka_quality.import_pharmacy_logbook_batch(p_rows jsonb)
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
  v_payload jsonb;
  v_core jsonb;
  v_form jsonb;
  v_source jsonb;
  v_source_rows jsonb;
  v_indicator_values jsonb;
  v_responses jsonb;
  v_attributions jsonb;
  v_response jsonb;
  v_metric jsonb;
  v_code text;
  v_codes text[];
  v_seen_codes text[];
  v_indicator_id uuid;
  v_actual_code text;
  v_record_id uuid;
  v_subject_key text;
  v_stream text;
  v_expected_sheets text[];
  v_date date;
  v_n numeric;
  v_d numeric;
  v_source_n numeric;
  v_source_d numeric;
  v_noncompliant numeric;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Instalasi Farmasi.'
      USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Farmasi hanya diizinkan bagi role ADMIN atau PMKP.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(5) THEN
    RAISE EXCEPTION 'Akses ke Instalasi Farmasi tidak tersedia.'
      USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor Farmasi harus berupa daftar baris yang valid.'
      USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 25 THEN
    RAISE EXCEPTION 'Jumlah baris per batch Farmasi harus antara 1 dan 25.'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Farmasi berisi kunci tanggal/alur layanan yang kosong atau duplikat.'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 5
       AND ip.profile_year = 2026
       AND ip.is_active = true
       AND ip.status = 'published'
       AND ip.code = ANY (ARRAY['5.2','5.3','5.4','5.5'])
  ) <> 4 OR (
    SELECT count(DISTINCT ip.code)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 5
       AND ip.profile_year = 2026
       AND ip.is_active = true
       AND ip.status = 'published'
       AND ip.code = ANY (ARRAY['5.2','5.3','5.4','5.5'])
  ) <> 4 THEN
    RAISE EXCEPTION 'Master indikator Farmasi 5.2–5.5 harus aktif dan terbit sebelum impor.'
      USING ERRCODE = '23503';
  END IF;

  -- Validate the complete batch first. No record is written if any row is malformed.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR jsonb_array_length(v_responses) <> 4
       OR coalesce(jsonb_typeof(v_attributions), '') <> 'array'
       OR jsonb_array_length(v_attributions) <> 0 THEN
      RAISE EXCEPTION 'Payload Farmasi harus berisi tepat empat respons dan tanpa atribusi tenaga.'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '5'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'daily_metric'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true' THEN
      RAISE EXCEPTION 'Batch Farmasi hanya menerima metrik harian tahun 2026 berstatus Ready for Review.'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'record_date', '') !~ '^2026-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Tanggal catatan Farmasi wajib berada pada tahun 2026.'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_date := (v_payload->>'record_date')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal catatan Farmasi tidak valid.'
        USING ERRCODE = '22007';
    END;

    IF v_date::text <> v_payload->>'record_date' OR extract(year FROM v_date) <> 2026 THEN
      RAISE EXCEPTION 'Tanggal catatan Farmasi tidak valid atau tidak konsisten.'
        USING ERRCODE = '22007';
    END IF;

    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_rows := v_source->'source_rows';
    v_indicator_values := v_core->'indicator_values';
    v_stream := v_form->>'Alur layanan';
    v_subject_key := v_payload->>'subject_key';

    IF coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_rows), '') <> 'object'
       OR jsonb_object_length(v_source_rows) <> 4
       OR coalesce(jsonb_typeof(v_indicator_values), '') <> 'object'
       OR jsonb_object_length(v_indicator_values) <> 4
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL THEN
      RAISE EXCEPTION 'Informasi sumber workbook, empat sheet sumber, atau empat indikator Farmasi tidak lengkap.'
        USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_stream, '') NOT IN ('Rawat Jalan', 'Rawat Inap')
       OR coalesce(v_form->>'Tanggal pengamatan', '') <> v_date::text
       OR coalesce(v_core->>'unit_name', '') <> 'Instalasi Farmasi'
       OR coalesce(v_core->>'room_id', '') <> '5'
       OR coalesce(v_core->>'measurement_grain', '') <> 'daily_metric'
       OR v_subject_key <> '5:' || v_date::text || ':' || v_stream
       OR coalesce(v_payload->>'subject_key', '') <> v_subject_key THEN
      RAISE EXCEPTION 'Tanggal, alur layanan, unit, atau kunci sumber Farmasi tidak konsisten.'
        USING ERRCODE = '22023';
    END IF;

    v_expected_sheets := CASE v_stream
      WHEN 'Rawat Jalan' THEN ARRAY['Copy Resep Rajal','High Alert Rajal','Fornas Rajal','Forumkit Rajal']::text[]
      ELSE ARRAY['Copy Resep Ranap','High Alert Ranap','Fornas Ranap','Forumkit Ranap']::text[]
    END;

    IF NOT (v_source_rows ?& v_expected_sheets) THEN
      RAISE EXCEPTION 'Jejak empat sheet sumber tidak sesuai dengan alur layanan %.', v_stream
        USING ERRCODE = '22023';
    END IF;

    v_seen_codes := ARRAY[]::text[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator pada batch Farmasi tidak valid.'
          USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_actual_code := NULL;

      SELECT ip.code INTO v_actual_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 5
         AND ip.profile_year = 2026
         AND ip.is_active = true
         AND ip.status = 'published'
         AND ip.code = ANY (ARRAY['5.2','5.3','5.4','5.5']);

      IF v_actual_code IS NULL OR v_actual_code = ANY(v_seen_codes) THEN
        RAISE EXCEPTION 'ID/kode indikator Farmasi tidak valid atau berulang.'
          USING ERRCODE = '23503';
      END IF;

      v_seen_codes := array_append(v_seen_codes, v_actual_code);
      v_code := v_actual_code;
      v_metric := v_indicator_values->v_code;

      IF coalesce(jsonb_typeof(v_metric), '') <> 'object'
         OR coalesce(jsonb_typeof(v_response->'raw_value'), '') <> 'object'
         OR coalesce(v_response->>'review_status', '') <> 'not_required'
         OR v_response->'raw_value' IS DISTINCT FROM v_metric THEN
        RAISE EXCEPTION 'Respons dan nilai sumber indikator % tidak konsisten.', v_code
          USING ERRCODE = '22023';
      END IF;

      IF coalesce(jsonb_typeof(v_metric->'numerator'), '') <> 'number'
         OR coalesce(jsonb_typeof(v_metric->'denominator'), '') <> 'number'
         OR coalesce(jsonb_typeof(v_metric->'source_numerator'), '') <> 'number'
         OR coalesce(jsonb_typeof(v_metric->'source_denominator'), '') <> 'number' THEN
        RAISE EXCEPTION 'Numerator/denominator indikator % wajib berupa angka.', v_code
          USING ERRCODE = '22023';
      END IF;

      v_n := (v_metric->>'numerator')::numeric;
      v_d := (v_metric->>'denominator')::numeric;
      v_source_n := (v_metric->>'source_numerator')::numeric;
      v_source_d := (v_metric->>'source_denominator')::numeric;

      IF v_n < 0 OR v_d <= 0 OR v_source_n < 0 OR v_source_d <= 0
         OR trunc(v_n) <> v_n OR trunc(v_d) <> v_d
         OR trunc(v_source_n) <> v_source_n OR trunc(v_source_d) <> v_source_d
         OR v_n > v_d OR v_source_n > v_source_d
         OR v_d <> v_source_d THEN
        RAISE EXCEPTION 'Nilai indikator % berada di luar rentang atau tidak berupa bilangan bulat yang sah.', v_code
          USING ERRCODE = '22023';
      END IF;

      IF v_code = '5.3' THEN
        IF coalesce(jsonb_typeof(v_metric->'noncompliant'), '') <> 'number' THEN
          RAISE EXCEPTION 'Nilai ketidakpatuhan High Alert wajib dicatat untuk indikator 5.3.'
            USING ERRCODE = '22023';
        END IF;
        v_noncompliant := (v_metric->>'noncompliant')::numeric;
        IF v_noncompliant < 0 OR trunc(v_noncompliant) <> v_noncompliant
           OR v_noncompliant > v_d
           OR v_source_n <> v_noncompliant
           OR v_n <> v_d - v_noncompliant THEN
          RAISE EXCEPTION 'Konversi ketidakpatuhan menjadi kepatuhan pada indikator 5.3 tidak konsisten.'
            USING ERRCODE = '22023';
        END IF;
      ELSE
        IF v_n <> v_source_n THEN
          RAISE EXCEPTION 'Nilai sumber dan nilai indikator % tidak konsisten.', v_code
            USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> 4
       OR NOT ('5.2' = ANY(v_seen_codes))
       OR NOT ('5.3' = ANY(v_seen_codes))
       OR NOT ('5.4' = ANY(v_seen_codes))
       OR NOT ('5.5' = ANY(v_seen_codes)) THEN
      RAISE EXCEPTION 'Setiap catatan Farmasi harus memuat tepat indikator 5.2, 5.3, 5.4, dan 5.5.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Save only after full-batch validation. The unique index and source key make re-upload idempotent.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 5
         AND qr.profile_year = 2026
         AND qr.measurement_grain = 'daily_metric'
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
        RAISE EXCEPTION 'Server tidak mengembalikan identitas catatan Farmasi.'
          USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 5
           AND qr.profile_year = 2026
           AND qr.measurement_grain = 'daily_metric'
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

REVOKE ALL ON FUNCTION aureka_quality.import_pharmacy_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_pharmacy_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_pharmacy_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_pharmacy_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_pharmacy_logbook_batch(jsonb)
  IS 'Validates and idempotently imports daily Instalasi Farmasi workbook records for Rawat Jalan and Rawat Inap; all new entries remain Ready for Review.';
