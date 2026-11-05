-- Exact PONEK source label/code matches use AUREKA's universal response classes.
-- Unmatched, ambiguous, and conflicting options remain pending for manual review.
-- Apply before 2026 target/direction profile versioning migration.

CREATE OR REPLACE FUNCTION aureka_quality.import_ponek_logbook_batch(p_rows jsonb)
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
  v_source jsonb;
  v_source_values jsonb;
  v_source_cells jsonb;
  v_values jsonb;
  v_responses jsonb;
  v_response jsonb;
  v_indicator_id uuid;
  v_code text;
  v_header text;
  v_seen_codes text[];
  v_seen_ids uuid[];
  v_source_row integer;
  v_admission_date date;
  v_subject_key text;
  v_response_code smallint;
  v_source_code smallint;
  v_option_count integer;
  v_match_count integer;
  v_record_id uuid;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_expected_codes text[] := ARRAY['33.1','33.2','33.3','33.4'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook PONEK.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook PONEK hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(33) THEN
    RAISE EXCEPTION 'Akses ke unit PONEK tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor PONEK harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN
    RAISE EXCEPTION 'Batch impor PONEK harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch PONEK berisi kunci baris Excel kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT ip.code)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 33
       AND ip.profile_year = 2026
       AND ip.is_active = true
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
       AND jsonb_typeof(ip.options_json) = 'array'
       AND jsonb_array_length(ip.options_json) > 0
  ) <> 4 THEN
    RAISE EXCEPTION 'Empat master indikator PONEK 33.1–33.4 harus aktif dan memiliki pilihan sumber.' USING ERRCODE = '23503';
  END IF;

  -- Validate the entire batch before inserting the first episode.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_source_cells := v_source->'source_indicator_cells';
    v_values := v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_cells), '') <> 'object'
       OR coalesce(jsonb_typeof(v_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR jsonb_array_length(v_responses) > 4
       OR coalesce(jsonb_typeof(v_row->'attributions'), '') <> 'array'
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Struktur payload PONEK tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '33'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', '') NOT IN ('true', 'false')
       OR coalesce(v_core->>'room_id', '') <> '33'
       OR coalesce(v_core->>'unit_name', '') <> 'Tim Pelayanan Obstetri Neonatal Emergensi Komprehensif'
       OR coalesce(v_core->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_core->>'status', '') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status', '') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL THEN
      RAISE EXCEPTION 'Payload hanya menerima episode PONEK 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber PONEK tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5300 THEN
      RAISE EXCEPTION 'Nomor baris Excel PONEK harus berada pada rentang 3–5300.' USING ERRCODE = '22023';
    END IF;

    v_subject_key := 'excel-pmkp-ponek-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key', '') <> v_subject_key
       OR coalesce(v_source->>'idempotency_basis', '') <> 'room_year_source_excel_row' THEN
      RAISE EXCEPTION 'Kunci idempotensi PONEK harus menggunakan nomor baris Excel fisik.' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'), '') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'), '') IS NULL
       OR nullif(btrim(v_form->>'Tanggal Masuk'), '') IS NULL
       OR nullif(btrim(v_form->>'Kategori Pasien'), '') IS NULL
       OR nullif(btrim(v_form->>'Diagnosa'), '') IS NULL
       OR nullif(btrim(v_form->>'Asal Kedatangan'), '') IS NULL THEN
      RAISE EXCEPTION 'Identitas episode, Tanggal Masuk, Kategori Pasien, Diagnosa, dan Asal Kedatangan wajib diisi pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_date := (v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Masuk PONEK tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF v_admission_date::text <> coalesce(v_form->>'Tanggal Masuk', '')
       OR extract(year FROM v_admission_date)::integer <> 2026
       OR coalesce(v_payload->>'record_date', '') <> v_admission_date::text
       OR coalesce(v_core->>'admission_at', '') <> v_admission_date::text THEN
      RAISE EXCEPTION 'Tanggal Masuk dan Tanggal Pencatatan harus konsisten serta berada pada profil tahun 2026 pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '') THEN
      RAISE EXCEPTION 'Identitas pasien pada core_data tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_source_cells)) <> 4 THEN
      RAISE EXCEPTION 'Empat sel sumber indikator PONEK harus dipertahankan pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    FOREACH v_code IN ARRAY v_expected_codes
    LOOP
      SELECT header
        INTO v_header
        FROM (VALUES
          ('33.1','Petugas'),
          ('33.2','Ruptur Perineum'),
          ('33.3','Komunikasi Pra-Kedatangan'),
          ('33.4','Stabilisasi Pra-Merujuk')
        ) AS headers(code, header)
       WHERE headers.code = v_code;

      IF v_header IS NULL
         OR NOT (v_source_cells ? v_code)
         OR coalesce(v_form->>v_header, '') <> coalesce(v_source_cells->>v_code, '') THEN
        RAISE EXCEPTION 'Kolom sumber % tidak konsisten dengan form_fields pada baris Excel %.', v_header, v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_source_cells->>v_code, '') <> ''
         AND NOT (v_source_values ? v_code) THEN
        RAISE EXCEPTION 'Respons indikator % hilang dari payload meskipun nilai sumber terisi pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_source_cells->>v_code, '') = ''
         AND (v_source_values ? v_code) THEN
        RAISE EXCEPTION 'Respons indikator % tidak boleh dibuat dari sel sumber kosong pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF (
      SELECT count(*) FROM jsonb_object_keys(v_source_values)
    ) <> jsonb_array_length(v_responses)
       OR (
      SELECT count(*) FROM jsonb_object_keys(v_values)
    ) <> jsonb_array_length(v_responses)
       OR (
      SELECT count(*) FROM jsonb_each_text(v_source_cells) AS cell(code, value)
       WHERE nullif(btrim(value), '') IS NOT NULL
    ) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Jumlah sel sumber terisi, sumber indikator, nilai inti, dan respons tidak sama pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator PONEK tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;

      SELECT ip.code
        INTO v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 33
         AND ip.profile_year = 2026
         AND ip.is_active = true
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_code = ANY(v_seen_codes)
         OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator PONEK tidak aktif, salah unit/tahun, atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_indicator_id);
      v_seen_codes := array_append(v_seen_codes, v_code);

      IF nullif(v_response->>'response_label', '') IS NULL
         OR coalesce(v_source_values->>v_code, '') = ''
         OR coalesce(v_response->'raw_value'->>'source_value', '') <> coalesce(v_source_values->>v_code, '')
         OR coalesce(v_response->'raw_value'->>'answer', '') <> coalesce(v_response->>'response_label', '')
         OR coalesce(v_values->v_code->>'source_value', '') <> coalesce(v_source_values->>v_code, '')
         OR coalesce(v_values->v_code->>'answer', '') <> coalesce(v_response->>'response_label', '')
         OR v_response->'raw_value' IS DISTINCT FROM v_values->v_code
         THEN
        RAISE EXCEPTION 'Nilai sumber/inti/respons indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF (
        coalesce(v_response->'raw_value'->>'mapping_status', '') = 'mapped'
        AND (
          coalesce(v_response->>'review_status', '') <> 'not_required'
          OR coalesce(v_response->'raw_value'->>'review_required', 'true') <> 'false'
        )
      ) OR (
        coalesce(v_response->'raw_value'->>'mapping_status', '') <> 'mapped'
        AND (
          coalesce(v_response->>'review_status', '') <> 'pending'
          OR coalesce(v_response->'raw_value'->>'review_required', 'false') <> 'true'
          OR coalesce(v_response->'raw_value'->>'mapping_status', '') NOT IN (
            'mapped_pending_classification', 'not_in_master', 'ambiguous_master', 'source_code_conflict'
          )
        )
      ) THEN
        RAISE EXCEPTION 'Status klasifikasi respons indikator % tidak konsisten dengan pemetaan kode pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      v_response_code := NULL;
      IF nullif(v_response->>'response_code', '') IS NOT NULL THEN
        v_response_code := (v_response->>'response_code')::smallint;
        IF v_response_code NOT BETWEEN 1 AND 3
           OR coalesce(v_response->'raw_value'->>'code', '') <> v_response_code::text
           OR coalesce(v_response->'raw_value'->>'mapping_status', '') <> 'mapped'
           OR (
             nullif(v_response->'raw_value'->>'source_code', '') IS NOT NULL
             AND (v_response->'raw_value'->>'source_code')::smallint <> v_response_code
           ) THEN
          RAISE EXCEPTION 'Kode sumber indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*)
          INTO v_option_count
          FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id = v_indicator_id
           AND opt->>'label' = v_response->>'response_label'
           AND opt->>'code' = v_response_code::text
           AND opt->'numerator' = 'null'::jsonb
           AND opt->>'denominator' = 'true'
           AND opt->>'review_required' = 'true';

        IF v_option_count <> 1 THEN
          RAISE EXCEPTION 'Pilihan sumber indikator % tidak cocok secara unik dengan master aktif pada baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
        END IF;
      ELSE
        IF v_response->'raw_value'->'code' IS DISTINCT FROM 'null'::jsonb THEN
          RAISE EXCEPTION 'Kode indikator null tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
        END IF;

        SELECT count(*)
          INTO v_match_count
          FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id = v_indicator_id
           AND opt->>'label' = v_response->>'response_label';

        IF v_response->'raw_value'->>'mapping_status' = 'mapped_pending_classification' THEN
          SELECT count(*)
            INTO v_option_count
            FROM aureka_quality.indicator_profiles ip
            CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
           WHERE ip.id = v_indicator_id
             AND opt->>'label' = v_response->>'response_label'
             AND opt->'code' = 'null'::jsonb
             AND opt->'numerator' = 'null'::jsonb
             AND opt->>'denominator' = 'true'
             AND opt->>'review_required' = 'true';
          IF v_option_count <> 1 THEN
            RAISE EXCEPTION 'Pilihan tanpa kode indikator % tidak cocok dengan master aktif pada baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
          END IF;
        ELSIF v_response->'raw_value'->>'mapping_status' = 'source_code_conflict' THEN
          IF nullif(v_response->'raw_value'->>'source_code', '') IS NULL THEN
            RAISE EXCEPTION 'Konflik kode indikator % tidak memiliki kode sumber pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
          END IF;
          v_source_code := (v_response->'raw_value'->>'source_code')::smallint;
          SELECT count(*)
            INTO v_option_count
            FROM aureka_quality.indicator_profiles ip
            CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
           WHERE ip.id = v_indicator_id
             AND opt->>'label' = v_response->>'response_label'
             AND opt->'code' IS DISTINCT FROM to_jsonb(v_source_code)
             AND opt->'numerator' = 'null'::jsonb
             AND opt->>'denominator' = 'true'
             AND opt->>'review_required' = 'true';
          IF v_option_count <> 1 THEN
            RAISE EXCEPTION 'Konflik kode sumber indikator % tidak cocok dengan master pada baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
          END IF;
        ELSIF v_response->'raw_value'->>'mapping_status' = 'not_in_master' THEN
          IF v_match_count <> 0 THEN
            RAISE EXCEPTION 'Respons indikator % ditandai tidak ada di master tetapi label ditemukan pada master aktif, baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
          END IF;
        ELSIF v_response->'raw_value'->>'mapping_status' = 'ambiguous_master' THEN
          IF v_match_count < 2 THEN
            RAISE EXCEPTION 'Respons indikator % ditandai ambigu tetapi tidak memiliki beberapa pasangan master, baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
          END IF;
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Kode indikator PONEK berulang pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- All rows passed validation; only now write this batch.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 33
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
        RAISE EXCEPTION 'Server tidak mengembalikan identitas episode PONEK.' USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 33
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
$function$

REVOKE ALL ON FUNCTION aureka_quality.import_ponek_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_ponek_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_ponek_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_ponek_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_ponek_logbook_batch(jsonb) IS
'Imports PONEK 2026 Logbook episodes. Exact source label/code matches are automatically mapped to universal AUREKA response classes; unknown, ambiguous, or conflicting choices remain pending for review. Physical Excel row is the idempotency key.';
