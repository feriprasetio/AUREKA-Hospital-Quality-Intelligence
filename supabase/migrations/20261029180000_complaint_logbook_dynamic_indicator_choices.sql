-- Forward hardening: honor the published indicator choice set rather than fixed example values.
-- The RPC remains authenticated, SECURITY INVOKER, and delegates writes to save_quality_logbook.

-- Authenticated, idempotent import for the Informasi dan Pengaduan workbook.
-- All writes delegate to the existing audited save_quality_logbook RPC.

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_complaint_excel_row
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE subject_key LIKE 'excel-pmkp-informasi-pengaduan-2026:row:%';

CREATE OR REPLACE FUNCTION aureka_quality.import_quality_logbook_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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
  v_record_id uuid;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_imported_ids jsonb := '[]'::jsonb;
  v_indicator_id uuid;
  v_expected_codes text[] := ARRAY['1.1','1.2'];
  v_code text;
  v_seen_ids uuid[];
  v_complaint_ts timestamp without time zone;
  v_followup_ts timestamp without time zone;
  v_duration numeric;
  v_source_filename text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook mutu.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(1) THEN
    RAISE EXCEPTION 'Akses ke unit Informasi dan Pengaduan tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 500 THEN
    RAISE EXCEPTION 'Jumlah baris per batch harus antara 1 dan 500.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(DISTINCT x.item->'payload'->>'subject_key')
        FROM jsonb_array_elements(p_rows) AS x(item)) <> v_received THEN
    RAISE EXCEPTION 'Batch berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*)
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.room_id = 1
         AND ip.profile_year = 2026
         AND ip.is_active
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes)) <> 2 THEN
    RAISE EXCEPTION 'Master indikator 1.1 dan 1.2 harus aktif dan terbit sebelum impor.' USING ERRCODE = '23503';
  END IF;

  -- Validate every row before performing the first write.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);

    IF coalesce(jsonb_typeof(v_payload),'') <> 'object'
       OR coalesce(jsonb_typeof(v_responses),'') <> 'array'
       OR jsonb_array_length(v_responses) <> 2
       OR coalesce(jsonb_typeof(v_attributions),'') <> 'array'
       OR jsonb_array_length(v_attributions) <> 0 THEN
      RAISE EXCEPTION 'Bentuk payload, respons indikator, atau atribusi tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id','') <> '1'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'event'
       OR coalesce(v_payload->>'status','') <> 'ready'
       OR coalesce(v_payload->>'review_required','false') <> 'true' THEN
      RAISE EXCEPTION 'Batch hanya menerima catatan event profil 2026 yang memerlukan peninjauan.' USING ERRCODE = '22023';
    END IF;

    v_key := v_payload->>'subject_key';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';

    IF v_key IS NULL
       OR v_key !~ '^excel-pmkp-informasi-pengaduan-2026:row:[0-9]+$'
       OR coalesce(jsonb_typeof(v_core),'') <> 'object'
       OR coalesce(jsonb_typeof(v_form),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source),'') <> 'object'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL THEN
      RAISE EXCEPTION 'Identitas sumber workbook/logbook tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-informasi-pengaduan-2026:row:' || v_source_row
       OR coalesce((v_source->>'source_excel_no')::integer, -1) <> v_source_row - 2 THEN
      RAISE EXCEPTION 'Nomor baris Excel tidak konsisten dengan kunci impor.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Tanggal Aduan','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
       OR coalesce(v_form->>'Tanggal Tindak Lanjut','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
       OR coalesce(v_core->>'admission_at','') <> coalesce(v_form->>'Tanggal Aduan','')
       OR coalesce(v_payload->>'record_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Format tanggal/waktu atau tanggal aduan tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_complaint_ts := (v_form->>'Tanggal Aduan')::timestamp without time zone;
      v_followup_ts := (v_form->>'Tanggal Tindak Lanjut')::timestamp without time zone;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal/waktu tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF (v_payload->>'record_date')::date <> v_complaint_ts::date
       OR coalesce((v_source->>'allow_cross_year')::boolean, false) <> (extract(year FROM v_complaint_ts)::integer <> 2026) THEN
      RAISE EXCEPTION 'Tanggal pencatatan atau penanda lintas tahun tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_core->>'unit_name','') <> 'Informasi dan Pengaduan'
       OR coalesce(v_core->>'patient_name','') <> coalesce(v_form->>'Nama Pasien','')
       OR coalesce(v_core->>'medical_record_no','') <> coalesce(v_form->>'No. Rekam Medis','')
       OR coalesce(v_core->>'room_id','') <> '1' THEN
      RAISE EXCEPTION 'Identitas pasien atau unit berbeda antara data inti dan formulir pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'),'') IS NULL
       OR nullif(btrim(v_form->>'Unit Pelayanan'),'') IS NULL
       OR nullif(btrim(v_form->>'Level Masalah'),'') IS NULL
       OR nullif(btrim(v_form->>'Sumber Aduan'),'') IS NULL
       OR nullif(btrim(v_form->>'Status Aduan'),'') IS NULL
       OR nullif(btrim(v_form->>'Kronologis Ringkas'),'') IS NULL
       OR nullif(btrim(v_form->>'Rencana Tindak Lanjut'),'') IS NULL
       OR nullif(btrim(v_form->>'Penyelesaian Aduan di Meja Informasi'),'') IS NULL THEN
      RAISE EXCEPTION 'Ada kolom wajib logbook kosong pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Level Masalah','') NOT IN ('Ringan','Sedang','Berat')
       OR coalesce(v_form->>'Sumber Aduan','') NOT IN (
         'Aduan Langsung Tatap Muka',
         'Contact Person Pengaduan',
         'Instansi Lain (Misal: Kantor BPJS)',
         'Sosial Media (FB, IG, dll)',
         'Website Rumah Sakit',
         'Sumber Lainnya'
       )
       OR coalesce(v_form->>'Status Aduan','') NOT IN (
         'Aduan Tidak Selesai Ditindaklanjuti',
         'Aduan Selesai Dengan Klarifikasi Dari Manajemen',
         'Aduan Selesai Dengan Proses Pengadaan',
         'Aduan Selesai Dengan Penegakan Aturan',
         'Aduan Selesai Dengan Mediasi Manajemen',
         'Pengaduan selesai dengan ditindaklanjuti manajemen  melalui aplikasi simponi',
         'Pengaduan selesai dengan ditindaklanjuti manajemen ',
         'Pengaduan selesai dengan ditindaklanjuti manajemen  melalui tatapmuka dengan keluarga pasien',
         'Sudah ditindak lanjut ke bidang terkait , pasien di edukasi mengenai penggunaan aplikasi simponi.'
       ) THEN
      RAISE EXCEPTION 'Nilai level masalah, sumber, atau status aduan bukan pilihan yang diizinkan pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      v_code := NULL;
      v_indicator_id := NULL;
      SELECT ip.code, ip.id
        INTO v_code, v_indicator_id
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = nullif(v_response->>'indicator_id','')::uuid
         AND ip.room_id = 1
         AND ip.profile_year = 2026
         AND ip.is_active
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL OR v_indicator_id IS NULL OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'ID indikator tidak valid atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_indicator_id);

      IF coalesce(v_response->>'response_code','') !~ '^-?[0-9]+

      IF NOT EXISTS (
        SELECT 1
          FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id = v_indicator_id
           AND opt->>'label' = v_response->>'response_label'
           AND opt->>'code' = v_response->>'response_code'
      ) THEN
        RAISE EXCEPTION 'Pilihan respons tidak ditemukan pada opsi terbit indikator %.', v_code USING ERRCODE = '23503';
      END IF;
    END LOOP;

    IF cardinality(v_seen_ids) <> 2
       OR NOT EXISTS (SELECT 1 FROM aureka_quality.indicator_profiles ip WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.1')
       OR NOT EXISTS (SELECT 1 FROM aureka_quality.indicator_profiles ip WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.2') THEN
      RAISE EXCEPTION 'Setiap baris harus memiliki respons untuk indikator 1.1 dan 1.2.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Make the duration engine server-authoritative, matching Excel (end - start) + 1.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_key := v_payload->>'subject_key';

    v_complaint_ts := (v_form->>'Tanggal Aduan')::timestamp without time zone;
    v_followup_ts := (v_form->>'Tanggal Tindak Lanjut')::timestamp without time zone;
    v_duration := extract(epoch FROM (v_followup_ts - v_complaint_ts)) / 86400.0 + 1;

    v_core := jsonb_set(
      v_core,
      '{calculated_fields}',
      coalesce(v_core->'calculated_fields','{}'::jsonb) ||
        jsonb_build_object('Lamanya Tindak Lanjut', v_duration),
      true
    );
    v_payload := jsonb_set(v_payload, '{core_data}', v_core, true);

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 1
         AND qr.profile_year = 2026
         AND qr.subject_key = v_key
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
         WHERE qr.room_id = 1 AND qr.profile_year = 2026 AND qr.subject_key = v_key
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

REVOKE ALL ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) TO authenticated;

         OR nullif(v_response->>'response_label','') IS NULL THEN
        RAISE EXCEPTION 'Respons indikator baris Excel % belum sesuai master pilihan.', v_source_row USING ERRCODE = '22023';
      END IF;

      -- Every response must match the published option label/code below; do not
      -- hard-code current labels so future valid dropdown choices can be imported.

      IF NOT EXISTS (
        SELECT 1
          FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id = v_indicator_id
           AND opt->>'label' = v_response->>'response_label'
           AND opt->>'code' = v_response->>'response_code'
      ) THEN
        RAISE EXCEPTION 'Pilihan respons tidak ditemukan pada opsi terbit indikator %.', v_code USING ERRCODE = '23503';
      END IF;
    END LOOP;

    IF cardinality(v_seen_ids) <> 2
       OR NOT EXISTS (SELECT 1 FROM aureka_quality.indicator_profiles ip WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.1')
       OR NOT EXISTS (SELECT 1 FROM aureka_quality.indicator_profiles ip WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.2') THEN
      RAISE EXCEPTION 'Setiap baris harus memiliki respons untuk indikator 1.1 dan 1.2.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Make the duration engine server-authoritative, matching Excel (end - start) + 1.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_key := v_payload->>'subject_key';

    v_complaint_ts := (v_form->>'Tanggal Aduan')::timestamp without time zone;
    v_followup_ts := (v_form->>'Tanggal Tindak Lanjut')::timestamp without time zone;
    v_duration := extract(epoch FROM (v_followup_ts - v_complaint_ts)) / 86400.0 + 1;

    v_core := jsonb_set(
      v_core,
      '{calculated_fields}',
      coalesce(v_core->'calculated_fields','{}'::jsonb) ||
        jsonb_build_object('Lamanya Tindak Lanjut', v_duration),
      true
    );
    v_payload := jsonb_set(v_payload, '{core_data}', v_core, true);

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 1
         AND qr.profile_year = 2026
         AND qr.subject_key = v_key
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
         WHERE qr.room_id = 1 AND qr.profile_year = 2026 AND qr.subject_key = v_key
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

REVOKE ALL ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) TO authenticated;
