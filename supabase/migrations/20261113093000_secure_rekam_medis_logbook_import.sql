-- Secure 2026 workbook import for Instalasi Rekam Medis (room 13).
-- Records are inserted as ready for review; this function never changes patient_index.

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_rekam_medis_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE room_id = 13 AND profile_year = 2026
    AND subject_key LIKE 'excel-pmkp-rekam-medis-2026:row:%';

CREATE OR REPLACE FUNCTION aureka_quality.import_rekam_medis_logbook_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb;
  v_payload jsonb;
  v_responses jsonb;
  v_core jsonb;
  v_form jsonb;
  v_source jsonb;
  v_response jsonb;
  v_raw jsonb;
  v_option jsonb;
  v_options jsonb;
  v_indicator_id uuid;
  v_record_id uuid;
  v_key text;
  v_source_row integer;
  v_code text;
  v_label text;
  v_source_value text;
  v_response_code text;
  v_source_only boolean;
  v_expected_review boolean;
  v_review_required boolean;
  v_review_status text;
  v_seen_ids uuid[];
  v_seen_codes text[];
  v_record_date date;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_imported_ids jsonb := '[]'::jsonb;
  v_expected_codes text[] := ARRAY['13.1', '13.2'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook Rekam Medis.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Rekam Medis hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(13) THEN
    RAISE EXCEPTION 'Akses ke unit Instalasi Rekam Medis tidak tersedia.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 100 THEN
    RAISE EXCEPTION 'Jumlah baris per batch harus antara 1 dan 100.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT item->'payload'->>'subject_key')
        FROM jsonb_array_elements(p_rows) AS rows(item)) <> v_received THEN
    RAISE EXCEPTION 'Kunci baris Excel kosong atau berulang di dalam batch.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT item->'payload'->'core_data'->'form_fields'->>'No.')
        FROM jsonb_array_elements(p_rows) AS rows(item)) <> v_received THEN
    RAISE EXCEPTION 'Nomor sumber Excel kosong atau berulang di dalam batch.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM (
        SELECT ip.code
          FROM aureka_quality.indicator_profiles ip
         WHERE ip.room_id = 13 AND ip.profile_year = 2026
           AND ip.is_active = true AND ip.status = 'published'
           AND ip.code = ANY (v_expected_codes)
           AND jsonb_typeof(ip.options_json) = 'array'
           AND jsonb_array_length(ip.options_json) > 0
         GROUP BY ip.code
       ) AS valid_profiles) <> 2 THEN
    RAISE EXCEPTION 'Master indikator 13.1 dan 13.2 harus aktif, terbit, dan memiliki pilihan.' USING ERRCODE = '23503';
  END IF;

  -- Validate the entire batch before performing any insert.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR coalesce(jsonb_typeof(v_row->'attributions'), '') <> 'array' THEN
      RAISE EXCEPTION 'Struktur payload atau respons tidak valid.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_responses) <> 2
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Setiap catatan wajib memuat dua respons indikator dan tanpa atribusi tenaga.' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_payload->>'room_id', '') <> '13'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'event'
       OR coalesce(v_payload->>'status', '') <> 'ready' THEN
      RAISE EXCEPTION 'Hanya catatan event Rekam Medis profil 2026 berstatus ready yang diterima.' USING ERRCODE = '22023';
    END IF;

    v_key := v_payload->>'subject_key';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    IF coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(v_core->>'measurement_grain', '') <> 'event'
       OR coalesce(v_core->>'unit_name', '') <> 'Instalasi Rekam Medis'
       OR coalesce(v_core->>'room_id', '') <> '13'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL
       OR coalesce(v_source->>'source_file_sha256', '') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no', '') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'Identitas sumber workbook atau nomor laporan tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-rekam-medis-2026:row:' || v_source_row::text
       OR coalesce(v_form->>'No.', '') <> v_source->>'source_excel_no' THEN
      RAISE EXCEPTION 'Nomor baris atau nomor sumber Excel tidak konsisten.' USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(v_form->>'Nama Pasien'), '') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'), '') IS NULL
       OR nullif(btrim(v_form->>'Tanggal Masuk'), '') IS NULL
       OR nullif(btrim(v_form->>'SEP'), '') IS NULL
       OR nullif(btrim(v_form->>'DPJP'), '') IS NULL
       OR nullif(btrim(v_form->>'Klaim'), '') IS NULL
       OR nullif(btrim(v_form->>'KLPCM'), '') IS NULL THEN
      RAISE EXCEPTION 'Kolom wajib logbook kosong pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_payload->>'record_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR coalesce(v_core->>'admission_at', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T00:00:00$'
       OR left(v_core->>'admission_at', 10) <> v_payload->>'record_date'
       OR v_form->>'Tanggal Masuk' <> v_payload->>'record_date'
       OR coalesce(v_core->>'patient_name', '') <> v_form->>'Nama Pasien'
       OR coalesce(v_core->>'medical_record_no', '') <> v_form->>'No. Rekam Medis' THEN
      RAISE EXCEPTION 'Identitas pasien atau tanggal masuk tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_record_date := (v_payload->>'record_date')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Tanggal masuk tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;
    IF v_record_date < DATE '2026-01-01' OR v_record_date >= DATE '2027-01-01' THEN
      RAISE EXCEPTION 'Tanggal masuk di luar profil 2026 pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];
    v_review_required := false;
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$'
         OR nullif(btrim(v_response->>'response_label'), '') IS NULL
         OR coalesce(jsonb_typeof(v_response->'raw_value'), '') <> 'object' THEN
        RAISE EXCEPTION 'Identitas, label, atau nilai respons tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      SELECT ip.code, ip.options_json INTO v_code, v_options
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 13 AND ip.profile_year = 2026
         AND ip.is_active = true AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);
      IF v_code IS NULL OR v_indicator_id = ANY(v_seen_ids) OR v_code = ANY(v_seen_codes) THEN
        RAISE EXCEPTION 'ID indikator tidak valid atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_indicator_id);
      v_seen_codes := array_append(v_seen_codes, v_code);

      v_raw := v_response->'raw_value';
      v_label := v_response->>'response_label';
      v_response_code := v_response->>'response_code';
      v_source_value := CASE WHEN v_code = '13.1' THEN v_form->>'Klaim' ELSE v_form->>'KLPCM' END;
      IF coalesce(v_raw->>'answer', '') <> v_label
         OR coalesce(v_raw->>'source_value', '') <> v_source_value
         OR coalesce(v_raw->>'source_label', '') <> v_source_value
         OR coalesce(v_raw->>'source_option', '') NOT IN ('true', 'false')
         OR coalesce(v_raw->>'review_required', '') NOT IN ('true', 'false')
         OR v_raw->>'code' IS DISTINCT FROM v_response_code
         OR v_core->'indicator_values'->v_code IS DISTINCT FROM v_raw THEN
        RAISE EXCEPTION 'Respons indikator tidak cocok dengan pilihan sumber pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_source_only := (v_raw->>'source_option')::boolean;
      v_option := NULL;
      IF v_response_code IS NOT NULL THEN
        IF v_source_only OR v_response_code !~ '^[1-3]$' THEN
          RAISE EXCEPTION 'Kode respons indikator tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
        END IF;
        SELECT option_row.opt INTO v_option
          FROM jsonb_array_elements(v_options) AS option_row(opt)
         WHERE option_row.opt->>'label' = v_label
           AND coalesce(option_row.opt->>'code', '') = v_response_code
         LIMIT 1;
        IF v_option IS NULL THEN
          RAISE EXCEPTION 'Respons tidak cocok dengan master indikator pada baris Excel %.', v_source_row USING ERRCODE = '23503';
        END IF;
        v_expected_review := coalesce((v_option->>'review_required')::boolean, false);
      ELSIF v_source_only THEN
        IF coalesce(v_raw->>'review_required', 'false') <> 'true'
           OR nullif(btrim(v_response->>'other_text'), '') IS NULL
           OR v_label <> v_source_value THEN
          RAISE EXCEPTION 'Pilihan di luar master wajib ditandai untuk ditinjau pada baris Excel %.', v_source_row USING ERRCODE = '22023';
        END IF;
        v_expected_review := true;
      ELSE
        SELECT option_row.opt INTO v_option
          FROM jsonb_array_elements(v_options) AS option_row(opt)
         WHERE option_row.opt->>'label' = v_label
           AND coalesce(option_row.opt->>'code', '') = ''
         LIMIT 1;
        IF v_option IS NULL THEN
          RAISE EXCEPTION 'Respons tanpa kode tidak ditemukan dalam master indikator pada baris Excel %.', v_source_row USING ERRCODE = '23503';
        END IF;
        v_expected_review := coalesce((v_option->>'review_required')::boolean, true);
      END IF;

      v_review_status := CASE WHEN v_expected_review THEN 'pending' ELSE 'not_required' END;
      IF (v_raw->>'review_required')::boolean <> v_expected_review
         OR coalesce(v_response->>'review_status', 'not_required') <> v_review_status THEN
        RAISE EXCEPTION 'Status peninjauan respons tidak sesuai master pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
      v_review_required := v_review_required OR v_expected_review;
    END LOOP;

    IF cardinality(v_seen_ids) <> 2
       OR NOT ('13.1' = ANY(v_seen_codes))
       OR NOT ('13.2' = ANY(v_seen_codes))
       OR coalesce(v_payload->>'review_required', '') NOT IN ('true', 'false')
       OR (v_payload->>'review_required')::boolean <> v_review_required THEN
      RAISE EXCEPTION 'Dua respons indikator dan status peninjauan tidak konsisten.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Store only after all input rows have passed validation.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_key := v_payload->>'subject_key';
    IF EXISTS (
      SELECT 1 FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 13 AND qr.profile_year = 2026 AND qr.subject_key = v_key
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_record_id := aureka_quality.save_quality_logbook(NULL, v_payload, v_row->'responses', '[]'::jsonb);
      v_imported := v_imported + 1;
      v_imported_ids := v_imported_ids || jsonb_build_array(
        jsonb_build_object('subject_key', v_key, 'record_id', v_record_id)
      );
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1 FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 13 AND qr.profile_year = 2026 AND qr.subject_key = v_key
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

REVOKE ALL ON FUNCTION aureka_quality.import_rekam_medis_logbook_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aureka_quality.import_rekam_medis_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_rekam_medis_logbook_batch(jsonb)
IS 'Secure, idempotent Excel logbook import for Instalasi Rekam Medis (room 13, 2026). Inserts event-grain records as ready for review and never validates or mutates patient_index.';
