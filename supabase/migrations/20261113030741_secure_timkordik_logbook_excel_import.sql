-- Secure 2026 workbook import for Tim Koordinasi Pendidikan (room 30).
-- One student-practice placement is one activity record with five coded indicator responses.

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_timkordik_excel_source_no
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 30
    AND profile_year = 2026
    AND measurement_grain = 'activity'
    AND subject_key LIKE 'excel-pmkp-timkordik-2026:no:%'
    AND status <> 'archived'
    AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION aureka_quality.import_timkordik_logbook_batch(p_rows jsonb)
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
  v_allowed jsonb := '{
    "30.1": [
      {"label":"Administrasi Lengkap (Awal hingga Akhir)","code":1},
      {"label":"Tidak Lengkap (Menunggu proses MOU/Legal Institusi - Faktor Eksternal)","code":2},
      {"label":"Tidak Lengkap (Hasil Skrining Kesehatan/Serologi terlambat keluar dari Lab)","code":2},
      {"label":"Tidak Lengkap (Mahasiswa belum bayar biaya praktek/Lupa setor berkas)","code":3},
      {"label":"Tidak Lengkap (Logbook/Target kompetensi tidak diisi)","code":3}
    ],
    "30.2": [
      {"label":"Atribut Selalu Lengkap & Sesuai Standar RS","code":1},
      {"label":"Tidak Lengkap (Ada Atribut Rusak/Hilang dan sedang dalam proses penggantian)","code":2},
      {"label":"Tidak Lengkap (Pernah Lupa bawa Name Tag/Jas)","code":3},
      {"label":"Salah Kostum (Pernah Pakai Jeans/Kaos Oblong/Sandal/Rambut Gondrong tidak rapi)","code":3}
    ],
    "30.3": [
      {"label":"Selalu Hadir Tepat Waktu (100% atau sesuai toleransi RS)","code":1},
      {"label":"Pernah Terlambat/Absen (Sakit dengan Surat Dokter/Izin Duka)","code":2},
      {"label":"Pernah Terlambat/Absen (Tugas Institusi Pendidikan/Ujian Kampus - Ada Surat Tugas)","code":2},
      {"label":"Pernah Terlambat/Absen (Tanpa Keterangan/Alpha)","code":3},
      {"label":"Sering Terlambat (Indisipliner berulang)","code":3}
    ],
    "30.4": [
      {"label":"Perilaku Baik / Tidak ada catatan pelanggaran selama praktek","code":1},
      {"label":"Perilaku Cukup (Ada pelanggaran minor/Sudah dibina lisan)","code":1},
      {"label":"Perilaku Kurang (Pelanggaran Sedang: Tidak sopan/Konflik rekan - SP 1/2)","code":3},
      {"label":"Perilaku Buruk (Pelanggaran Berat: Etik/Patient Safety/Asusila - Ditarik/Tidak Lulus)","code":3}
    ],
    "30.5": [
      {"label":"Laporan Selesai Tepat Waktu","code":1},
      {"label":"Laporan Terlambat (Menunggu tanda tangan Konsulen/Pembimbing yang cuti/sibuk)","code":2},
      {"label":"Laporan Terlambat (Mahasiswa Sakit/Izin resmi menjelang deadline)","code":2},
      {"label":"Laporan Terlambat (Kelalaian Mahasiswa/Manajemen waktu buruk)","code":3},
      {"label":"Tidak Mengumpulkan Laporan","code":3}
    ]
  }'::jsonb;
  v_indicator_id uuid;
  v_record_id uuid;
  v_key text;
  v_source_row integer;
  v_code text;
  v_label text;
  v_source_value text;
  v_field_key text;
  v_response_code integer;
  v_start_date date;
  v_end_date date;
  v_seen_ids uuid[];
  v_seen_codes text[];
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_imported_ids jsonb := '[]'::jsonb;
  v_expected_codes text[] := ARRAY['30.1','30.2','30.3','30.4','30.5'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook Tim Koordinasi Pendidikan.'
      USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Timkordik hanya diizinkan bagi role ADMIN atau PMKP.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(30) THEN
    RAISE EXCEPTION 'Akses ke unit Tim Koordinasi Pendidikan tidak tersedia.'
      USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor harus berupa daftar baris yang valid.'
      USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 50 THEN
    RAISE EXCEPTION 'Jumlah baris per batch harus antara 1 dan 50.'
      USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT item->'payload'->>'subject_key')
        FROM jsonb_array_elements(p_rows) AS rows(item)) <> v_received THEN
    RAISE EXCEPTION 'Kunci sumber mahasiswa kosong atau berulang di dalam batch.'
      USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT item->'payload'->'core_data'->'form_fields'->>'No.')
        FROM jsonb_array_elements(p_rows) AS rows(item)) <> v_received THEN
    RAISE EXCEPTION 'Nomor sumber mahasiswa kosong atau berulang di dalam batch.'
      USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM (
        SELECT ip.code
          FROM aureka_quality.indicator_profiles ip
         WHERE ip.room_id = 30
           AND ip.profile_year = 2026
           AND ip.is_active = true
           AND ip.status = 'published'
           AND ip.code = ANY (v_expected_codes)
         GROUP BY ip.code
       ) AS valid_profiles) <> 5 THEN
    RAISE EXCEPTION 'Lima master indikator Timkordik (30.1–30.5) harus aktif dan terbit.'
      USING ERRCODE = '23503';
  END IF;

  -- Validate all rows and all five indicator responses before the first write.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    IF coalesce(jsonb_typeof(v_payload),'') <> 'object'
       OR coalesce(jsonb_typeof(v_responses),'') <> 'array'
       OR coalesce(jsonb_typeof(v_row->'attributions'),'') <> 'array' THEN
      RAISE EXCEPTION 'Struktur payload, respons, atau atribusi tidak valid.'
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_responses) <> 5
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Setiap catatan harus memiliki lima respons indikator dan tanpa atribusi staf otomatis.'
        USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_payload->>'room_id','') <> '30'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'activity'
       OR coalesce(v_payload->>'status','') <> 'ready'
       OR coalesce(v_payload->>'review_required','') <> 'false' THEN
      RAISE EXCEPTION 'Hanya catatan activity Timkordik profil 2026 berstatus ready yang diterima.'
        USING ERRCODE = '22023';
    END IF;

    v_key := v_payload->>'subject_key';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    IF coalesce(jsonb_typeof(v_core),'') <> 'object'
       OR coalesce(jsonb_typeof(v_form),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source),'') <> 'object'
       OR coalesce(v_core->>'unit_name','') <> 'Tim Koordinasi Pendidikan'
       OR coalesce(v_core->>'room_id','') <> '30'
       OR coalesce(v_core->>'measurement_grain','') <> 'activity'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL
       OR coalesce(v_source->>'source_file_sha256','') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no','') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'Identitas sumber workbook atau nomor mahasiswa tidak valid.'
        USING ERRCODE = '22023';
    END IF;
    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5003
       OR v_key <> 'excel-pmkp-timkordik-2026:no:' || (v_source->>'source_excel_no')
       OR coalesce(v_form->>'No.','') <> v_source->>'source_excel_no' THEN
      RAISE EXCEPTION 'Nomor baris atau nomor sumber workbook tidak konsisten.'
        USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(v_form->>'Nama Mahasiswa'),'') IS NULL
       OR nullif(btrim(v_form->>'Profesi/Prodi'),'') IS NULL
       OR nullif(btrim(v_form->>'Kampus'),'') IS NULL
       OR nullif(btrim(v_form->>'Stase Terakhir'),'') IS NULL
       OR nullif(btrim(v_form->>'CI/Penanggung Jawab'),'') IS NULL
       OR coalesce(v_form->>'Tanggal Mulai Praktek','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR coalesce(v_form->>'Tanggal Selesai Praktek','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR coalesce(v_core->>'practice_start_date','') <> v_form->>'Tanggal Mulai Praktek'
       OR coalesce(v_core->>'practice_end_date','') <> v_form->>'Tanggal Selesai Praktek'
       OR coalesce(v_payload->>'record_date','') <> v_form->>'Tanggal Mulai Praktek' THEN
      RAISE EXCEPTION 'Identitas mahasiswa atau tanggal praktik tidak lengkap/tidak konsisten pada baris Excel %.', v_source_row
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_start_date := (v_form->>'Tanggal Mulai Praktek')::date;
      v_end_date := (v_form->>'Tanggal Selesai Praktek')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Tanggal praktik tidak valid pada baris Excel %.', v_source_row
        USING ERRCODE = '22007';
    END;
    IF v_start_date < DATE '2026-01-01' OR v_start_date >= DATE '2027-01-01'
       OR v_end_date < DATE '2026-01-01' OR v_end_date >= DATE '2027-01-01'
       OR v_start_date > v_end_date THEN
      RAISE EXCEPTION 'Rentang tanggal praktik tidak sah untuk profil 2026 pada baris Excel %.', v_source_row
        USING ERRCODE = '22023';
    END IF;
    IF v_core ? 'patient_name' OR v_core ? 'medical_record_no' THEN
      RAISE EXCEPTION 'Catatan mahasiswa tidak boleh dipetakan sebagai identitas pasien.'
        USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id','') !~* '^[0-9a-f-]{36}$'
         OR nullif(btrim(v_response->>'response_label'),'') IS NULL
         OR coalesce(jsonb_typeof(v_response->'raw_value'),'') <> 'object' THEN
        RAISE EXCEPTION 'Identitas atau nilai respons indikator tidak valid pada baris Excel %.', v_source_row
          USING ERRCODE = '22023';
      END IF;
      v_indicator_id := (v_response->>'indicator_id')::uuid;
      SELECT ip.code INTO v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 30
         AND ip.profile_year = 2026
         AND ip.is_active = true
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);
      IF v_code IS NULL OR v_indicator_id = ANY(v_seen_ids) OR v_code = ANY(v_seen_codes) THEN
        RAISE EXCEPTION 'ID indikator tidak valid atau berulang pada baris Excel %.', v_source_row
          USING ERRCODE = '23503';
      END IF;
      v_seen_ids := array_append(v_seen_ids,v_indicator_id);
      v_seen_codes := array_append(v_seen_codes,v_code);

      v_field_key := CASE v_code
        WHEN '30.1' THEN 'Administrasi'
        WHEN '30.2' THEN 'Atribut'
        WHEN '30.3' THEN 'Absensi'
        WHEN '30.4' THEN 'Sikap & Perilaku'
        WHEN '30.5' THEN 'Laporan'
      END;
      v_raw := v_response->'raw_value';
      v_label := v_response->>'response_label';
      v_source_value := v_form->>v_field_key;
      v_response_code := nullif(v_response->>'response_code','')::integer;

      IF v_response_code NOT BETWEEN 1 AND 3
         OR coalesce(v_raw->>'answer','') <> v_label
         OR coalesce(v_raw->>'source_value','') <> coalesce(v_source_value,'')
         OR coalesce(v_raw->>'source_label','') <> coalesce(v_source_value,'')
         OR coalesce(v_raw->>'source_option','') <> 'false'
         OR coalesce(v_raw->>'review_required','') <> 'false'
         OR coalesce(v_raw->>'code','') <> v_response_code::text
         OR coalesce(v_response->>'review_status','') <> 'not_required'
         OR v_core->'indicator_values'->v_code IS DISTINCT FROM v_raw THEN
        RAISE EXCEPTION 'Nilai dan kode respons % tidak konsisten dengan sumber pada baris Excel %.', v_code, v_source_row
          USING ERRCODE = '22023';
      END IF;

      SELECT option_row.opt INTO v_option
        FROM jsonb_array_elements(v_allowed->v_code) AS option_row(opt)
       WHERE option_row.opt->>'label' = v_label
         AND (option_row.opt->>'code')::integer = v_response_code
       LIMIT 1;
      IF v_option IS NULL
         OR v_source_value <> v_label || ' (Code ' || v_response_code::text || ')' THEN
        RAISE EXCEPTION 'Pilihan sumber untuk indikator % tidak ada dalam daftar resmi pada baris Excel %.', v_code, v_source_row
          USING ERRCODE = '23503';
      END IF;
    END LOOP;

    IF cardinality(v_seen_ids) <> 5
       OR NOT ('30.1' = ANY(v_seen_codes))
       OR NOT ('30.2' = ANY(v_seen_codes))
       OR NOT ('30.3' = ANY(v_seen_codes))
       OR NOT ('30.4' = ANY(v_seen_codes))
       OR NOT ('30.5' = ANY(v_seen_codes)) THEN
      RAISE EXCEPTION 'Setiap catatan harus memiliki tepat satu respons untuk indikator 30.1 sampai 30.5.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Insert only after the complete batch passes validation.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_key := v_payload->>'subject_key';
    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 30
         AND qr.profile_year = 2026
         AND qr.measurement_grain = 'activity'
         AND qr.subject_key = v_key
         AND qr.status <> 'archived'
         AND qr.archived_at IS NULL
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
      v_imported := v_imported + 1;
      v_imported_ids := v_imported_ids || jsonb_build_array(
        jsonb_build_object('subject_key',v_key,'record_id',v_record_id)
      );
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 30
           AND qr.profile_year = 2026
           AND qr.measurement_grain = 'activity'
           AND qr.subject_key = v_key
           AND qr.status <> 'archived'
           AND qr.archived_at IS NULL
      ) THEN
        v_skipped := v_skipped + 1;
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'received_count',v_received,
    'imported_count',v_imported,
    'skipped_existing_count',v_skipped,
    'imported_records',v_imported_ids
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_timkordik_logbook_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aureka_quality.import_timkordik_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_timkordik_logbook_batch(jsonb)
IS 'Secure, idempotent 2026 Tim Koordinasi Pendidikan workbook import. Stores one activity record per source No. with five validated responses, retains CI as source text, does not create staff attributions, and never maps students to patient_index.';
