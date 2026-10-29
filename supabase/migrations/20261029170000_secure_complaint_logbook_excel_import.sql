-- Secure, idempotent importer for the Informasi dan Pengaduan Excel logbook.
-- Runs only through the authenticated PostgREST session and delegates every insert
-- to save_quality_logbook so room access, indicator ownership and audit triggers remain active.

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_complaint_excel_row
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE subject_key LIKE 'excel-pmkp-informasi-pengaduan-2026:row:%';

CREATE OR REPLACE FUNCTION aureka_quality.import_quality_logbook_batch(p_rows jsonb)
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
  v_no integer;
  v_record_id uuid;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_imported_ids jsonb := '[]'::jsonb;
  v_indicator_id uuid;
  v_expected_codes text[] := ARRAY['1.1','1.2'];
  v_code text;
  v_seen_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook mutu.' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('ADMIN', 'PMKP') THEN
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
    RAISE EXCEPTION 'Batch berisi kunci baris Excel yang duplikat.' USING ERRCODE = '22023';
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

  -- Validate the entire batch before writing any row.
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
      RAISE EXCEPTION 'Batch hanya menerima catatan event tahun profil 2026 yang memerlukan peninjauan.' USING ERRCODE = '22023';
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
       OR v_source->>'source_sheet' <> 'Logbook'
       OR coalesce(nullif(v_source->>'source_excel_row','') !~ '^[0-9]+
      RAISE EXCEPTION 'Identitas sumber workbook/logbook tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-informasi-pengaduan-2026:row:' || v_source_row
       OR coalesce((v_source->>'source_excel_no')::integer, -1) <> v_source_row - 2 THEN
      RAISE EXCEPTION 'Nomor baris Excel tidak konsisten dengan kunci impor.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'record_date','') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(v_core->>'admission_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
       OR (v_payload->>'record_date')::date <> (v_core->>'admission_at')::date THEN
      RAISE EXCEPTION 'Tanggal pencatatan harus konsisten dengan tanggal aduan di sumber.' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'),'') IS NULL
       OR nullif(btrim(v_form->>'Unit Pelayanan'),'') IS NULL
       OR nullif(btrim(v_form->>'Level Masalah'),'') IS NULL
       OR nullif(v_form->>'Tanggal Aduan','') IS NULL
       OR nullif(v_form->>'Tanggal Tindak Lanjut','') IS NULL
       OR nullif(btrim(v_form->>'Sumber Aduan'),'') IS NULL
       OR nullif(btrim(v_form->>'Status Aduan'),'') IS NULL
       OR nullif(btrim(v_form->>'Kronologis Ringkas'),'') IS NULL
       OR nullif(btrim(v_form->>'Rencana Tindak Lanjut'),'') IS NULL
       OR nullif(btrim(v_form->>'Penyelesaian Aduan di Meja Informasi'),'') IS NULL THEN
      RAISE EXCEPTION 'Ada kolom wajib logbook kosong pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Level Masalah','') NOT IN ('Ringan','Sedang','Berat')
       OR coalesce(v_form->>'Sumber Aduan','') NOT IN ('Website Rumah Sakit','Sumber Lainnya','Aduan Langsung Tatap Muka')
       OR coalesce(v_form->>'Unit Pelayanan','') NOT IN ('Farmasi','farmasi','Pelayanan','Radiologi','IT','Sarana dan prasarana','Parkiran','Poli anak','Pendaftaran / RM Loket 2 (di gedung belakang)','Pendaftaran IGD','Rajal','Ranap R.Mawar 2-Bedah')
       OR coalesce(v_form->>'Status Aduan','') NOT IN (
         'Aduan Selesai Dengan Klarifikasi Dari Manajemen',
         'Aduan Selesai Dengan Proses Pengadaan',
         'Aduan Selesai Dengan Penegakan Aturan',
         'Pengaduan selesai dengan ditindaklanjuti manajemen  melalui aplikasi simponi',
         'Pengaduan selesai dengan ditindaklanjuti manajemen ',
         'Pengaduan selesai dengan ditindaklanjuti manajemen  melalui tatapmuka dengan keluarga pasien',
         'Sudah ditindak lanjut ke bidang terkait , pasien di edukasi mengenai penggunaan aplikasi simponi.'
       ) THEN
      RAISE EXCEPTION 'Nilai unit layanan, level masalah, sumber, atau status aduan bukan pilihan yang diizinkan pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      v_code := NULL;
      SELECT ip.code, ip.id
        INTO v_code, v_indicator_id
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = nullif(v_response->>'indicator_id','')::uuid
         AND ip.room_id = 1 AND ip.profile_year = 2026
         AND ip.is_active AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL OR v_indicator_id IS NULL OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'ID indikator tidak valid atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_indicator_id);

      IF coalesce(v_response->>'response_code','') <> '1'
         OR nullif(v_response->>'response_label','') IS NULL THEN
        RAISE EXCEPTION 'Respons indikator baris Excel % belum sesuai master pilihan.', v_source_row USING ERRCODE = '22023';
      END IF;

      IF v_code = '1.1'
         AND (v_response->>'response_label') <> 'Respon Tepat Waktu (Sesuai Grading Merah/Kuning/Hijau)' THEN
        RAISE EXCEPTION 'Pilihan indikator 1.1 tidak konsisten dengan metadata sumber pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      ELSIF v_code = '1.2'
         AND (v_response->>'response_label') <> 'Pasien Mengerti (Verifikasi pemahaman/Teach-back berhasil)' THEN
        RAISE EXCEPTION 'Pilihan indikator 1.2 tidak konsisten dengan metadata sumber pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
        WHERE ip.id = v_indicator_id
          AND opt->>'label' = v_response->>'response_label'
          AND opt->>'code' = '1'
      ) THEN
        RAISE EXCEPTION 'Pilihan respons tidak ditemukan pada opsi terbit indikator %.', v_code USING ERRCODE = '23503';
      END IF;
    END LOOP;

    IF cardinality(v_seen_ids) <> 2
       OR NOT EXISTS (
         SELECT 1 FROM aureka_quality.indicator_profiles ip
         WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.1'
       )
       OR NOT EXISTS (
         SELECT 1 FROM aureka_quality.indicator_profiles ip
         WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.2'
       ) THEN
      RAISE EXCEPTION 'Setiap baris harus memiliki respons untuk indikator 1.1 dan 1.2.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Re-read each row in a fresh loop and use the existing, audited save RPC.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);
    v_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1 FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 1 AND qr.profile_year = 2026 AND qr.subject_key = v_key
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_record_id := aureka_quality.save_quality_logbook(
        NULL,
        v_payload,
        v_responses,
        v_attributions
      );
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
GRANT EXECUTE ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) TO authenticated;
,'true') THEN
      RAISE EXCEPTION 'Identitas sumber workbook/logbook tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-informasi-pengaduan-2026:row:' || v_source_row
       OR coalesce((v_source->>'source_excel_no')::integer, -1) <> v_source_row - 2 THEN
      RAISE EXCEPTION 'Nomor baris Excel tidak konsisten dengan kunci impor.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'record_date','') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(v_core->>'admission_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
       OR (v_payload->>'record_date')::date <> (v_core->>'admission_at')::date THEN
      RAISE EXCEPTION 'Tanggal pencatatan harus konsisten dengan tanggal aduan di sumber.' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'),'') IS NULL
       OR nullif(btrim(v_form->>'Unit Pelayanan'),'') IS NULL
       OR nullif(btrim(v_form->>'Level Masalah'),'') IS NULL
       OR nullif(v_form->>'Tanggal Aduan','') IS NULL
       OR nullif(v_form->>'Tanggal Tindak Lanjut','') IS NULL
       OR nullif(btrim(v_form->>'Sumber Aduan'),'') IS NULL
       OR nullif(btrim(v_form->>'Status Aduan'),'') IS NULL
       OR nullif(btrim(v_form->>'Kronologis Ringkas'),'') IS NULL
       OR nullif(btrim(v_form->>'Rencana Tindak Lanjut'),'') IS NULL
       OR nullif(btrim(v_form->>'Penyelesaian Aduan di Meja Informasi'),'') IS NULL THEN
      RAISE EXCEPTION 'Ada kolom wajib logbook kosong pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF v_form->>'Level Masalah' NOT IN ('Ringan','Sedang','Berat')
       OR v_form->>'Sumber Aduan' NOT IN ('Website Rumah Sakit','Sumber Lainnya','Aduan Langsung Tatap Muka') THEN
      RAISE EXCEPTION 'Nilai level masalah atau sumber aduan bukan pilihan yang diizinkan pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      v_code := NULL;
      SELECT ip.code, ip.id
        INTO v_code, v_indicator_id
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = nullif(v_response->>'indicator_id','')::uuid
         AND ip.room_id = 1 AND ip.profile_year = 2026
         AND ip.is_active AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL OR v_indicator_id IS NULL OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'ID indikator tidak valid atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_indicator_id);

      IF nullif(v_response->>'response_code','') IS NULL
         OR (v_response->>'response_code')::integer NOT BETWEEN 1 AND 3
         OR nullif(v_response->>'response_label','') IS NULL THEN
        RAISE EXCEPTION 'Respons indikator baris Excel % belum sesuai master pilihan.', v_source_row USING ERRCODE = '22023';
      END IF;

      IF v_code = '1.1'
         AND (v_response->>'response_label') <> 'Respon Tepat Waktu (Sesuai Grading Merah/Kuning/Hijau)' THEN
        RAISE EXCEPTION 'Pilihan indikator 1.1 tidak konsisten dengan metadata sumber pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      ELSIF v_code = '1.2'
         AND (v_response->>'response_label') <> 'Pasien Mengerti (Verifikasi pemahaman/Teach-back berhasil)' THEN
        RAISE EXCEPTION 'Pilihan indikator 1.2 tidak konsisten dengan metadata sumber pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF cardinality(v_seen_ids) <> 2
       OR NOT EXISTS (
         SELECT 1 FROM aureka_quality.indicator_profiles ip
         WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.1'
       )
       OR NOT EXISTS (
         SELECT 1 FROM aureka_quality.indicator_profiles ip
         WHERE ip.id = ANY(v_seen_ids) AND ip.code = '1.2'
       ) THEN
      RAISE EXCEPTION 'Setiap baris harus memiliki respons untuk indikator 1.1 dan 1.2.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Re-read each row in a fresh loop and use the existing, audited save RPC.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_attributions := coalesce(v_row->'attributions', '[]'::jsonb);
    v_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1 FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 1 AND qr.profile_year = 2026 AND qr.subject_key = v_key
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_record_id := aureka_quality.save_quality_logbook(
        NULL,
        v_payload,
        v_responses,
        v_attributions
      );
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
GRANT EXECUTE ON FUNCTION aureka_quality.import_quality_logbook_batch(jsonb) TO authenticated;
