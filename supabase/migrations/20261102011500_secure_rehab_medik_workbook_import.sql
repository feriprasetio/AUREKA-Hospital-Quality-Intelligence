
-- Keep the published choice lists synchronized with the source PMKP Rehab Medik workbook.
UPDATE aureka_quality.indicator_profiles
SET options_json = '[
  {"code":1,"label":"Target Tercapai (Ada Perbaikan Fungsional / Nyeri Berkurang)","numerator":true,"denominator":true},
  {"code":2,"label":"Target Tidak Tercapai (Penyakit Progresif / Degeneratif Berat / Usia Lanjut)","numerator":false,"denominator":true},
  {"code":2,"label":"Target Tidak Tercapai (Pasien Tidak Patuh Program Latihan di Rumah)","numerator":false,"denominator":true},
  {"code":3,"label":"Target Tidak Tercapai (Program Terapi Tidak Adekuat / Dosis Kurang)","numerator":false,"denominator":true},
  {"code":3,"label":"Target Tidak Tercapai (Kesalahan Evaluasi Awal)","numerator":false,"denominator":true},
  {"code":2,"label":"Pasien Tidak Memenuhi Kriteria Untuk Lanjut Terapi Sehingga Tidak Memenuhi Target","numerator":false,"denominator":true},
  {"code":null,"label":"Lainnya — tuliskan alasan/temuan","numerator":null,"denominator":true,"review_required":true}
]'::jsonb, updated_at=now()
WHERE room_id=12 AND profile_year=2026 AND code='12.1';

UPDATE aureka_quality.indicator_profiles
SET options_json = '[
  {"code":1,"label":"Pasien Patuh / Selesai Program (Discharge Resmi)","numerator":false,"denominator":true},
  {"code":2,"label":"Drop Out (Pasien Meninggal Dunia / Pindah Domisili)","numerator":false,"denominator":true},
  {"code":2,"label":"Drop Out (Sakit Berat / Dirawat Inap / Kontraindikasi Latihan)","numerator":false,"denominator":true},
  {"code":2,"label":"Drop Out (Masalah Biaya / Transportasi - Faktor Sosial)","numerator":false,"denominator":true},
  {"code":3,"label":"Drop Out (Pasien Bosan / Kurang Motivasi / Tidak Diedukasi Ulang)","numerator":true,"denominator":true},
  {"code":3,"label":"Drop Out (Kecewa dengan Pelayanan / Antrian Lama)","numerator":true,"denominator":true},
  {"code":3,"label":"Drop Out Tanpa Alasan","numerator":true,"denominator":true},
  {"code":2,"label":"Drop Out (Perubahan Program Terapi Atas Permintaan Dokter)","numerator":false,"denominator":true},
  {"code":3,"label":"Drop Out (Pasien merasa perbaikan namun tidak sesuai program)","numerator":true,"denominator":true},
  {"code":null,"label":"Lainnya — tuliskan alasan/temuan","numerator":null,"denominator":true,"review_required":true}
]'::jsonb, updated_at=now()
WHERE room_id=12 AND profile_year=2026 AND code='12.2';

UPDATE aureka_quality.indicator_profiles
SET options_json = '[
  {"code":1,"label":"Tidak Ada Kejadian Jatuh","numerator":true,"denominator":true},
  {"code":2,"label":"Jatuh (Kondisi Medis Mendadak: Kejang/Pingsan/Serangan Jantung)","numerator":false,"denominator":true},
  {"code":2,"label":"Jatuh (Pasien Tidak Kooperatif / Melanggar Instruksi Terapis)","numerator":false,"denominator":true},
  {"code":3,"label":"Jatuh (Alat Rusak / Kursi Roda Rem Blong / Lantai Licin)","numerator":false,"denominator":true},
  {"code":3,"label":"Jatuh (Kelalaian Pengawasan Petugas saat Latihan)","numerator":false,"denominator":true},
  {"code":null,"label":"Lainnya — tuliskan alasan/temuan","numerator":null,"denominator":true,"review_required":true}
]'::jsonb, updated_at=now()
WHERE room_id=12 AND profile_year=2026 AND code='12.3';

UPDATE aureka_quality.indicator_profiles
SET options_json = '[
  {"code":1,"label":"Tindakan Tepat (Benar Pasien, Sisi, Dosis, Cara)","numerator":false,"denominator":true},
  {"code":3,"label":"Salah Tindakan (Salah Identifikasi Pasien / Wrong Patient)","numerator":true,"denominator":true},
  {"code":3,"label":"Salah Tindakan (Salah Sisi Tubuh / Wrong Site)","numerator":true,"denominator":true},
  {"code":3,"label":"Salah Tindakan (Salah Modalitas Alat)","numerator":true,"denominator":true},
  {"code":3,"label":"Salah Tindakan (Overdosis / Luka Bakar Diathermy / Cedera Alat)","numerator":true,"denominator":true},
  {"code":null,"label":"Lainnya — tuliskan alasan/temuan","numerator":null,"denominator":true,"review_required":true}
]'::jsonb, updated_at=now()
WHERE room_id=12 AND profile_year=2026 AND code='12.4';

UPDATE aureka_quality.indicator_profiles
SET options_json = '[
  {"code":1,"label":"Waktu Pelayanan Sesuai Standar","numerator":true,"denominator":true},
  {"code":2,"label":"Terlambat (Masalah Sistem RS / Jaringan Error / Antrian Admin)","numerator":false,"denominator":true},
  {"code":2,"label":"Terlambat (Pasien Datang Terlambat dari Jadwal)","numerator":false,"denominator":true},
  {"code":2,"label":"Terlambat (Kondisi Pasien Butuh Istirahat / Jeda di tengah terapi)","numerator":false,"denominator":true},
  {"code":3,"label":"Terlambat (Petugas Datang Terlambat / Memulai Sesi Molor)","numerator":false,"denominator":true},
  {"code":3,"label":"Terlambat (Kekurangan Alat / Manajemen Jadwal Buruk)","numerator":false,"denominator":true},
  {"code":null,"label":"Lainnya — tuliskan alasan/temuan","numerator":null,"denominator":true,"review_required":true}
]'::jsonb, updated_at=now()
WHERE room_id=12 AND profile_year=2026 AND code='12.5';

UPDATE aureka_quality.indicator_profiles
SET options_json = '[
  {"code":1,"label":"Media Tersedia / Terapi Berjalan Sesuai Rencana","numerator":false,"denominator":true},
  {"code":3,"label":"Media Tidak Tersedia (Petugas Membawa Sendiri)","numerator":true,"denominator":true},
  {"code":null,"label":"Tersedia Namun Tidak Memadai","numerator":null,"denominator":true,"review_required":true},
  {"code":null,"label":"Lainnya — tuliskan alasan/temuan","numerator":null,"denominator":true,"review_required":true}
]'::jsonb, updated_at=now()
WHERE room_id=12 AND profile_year=2026 AND code='12.6';

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_rehab_medik_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id=12 AND measurement_grain='patient_episode'
    AND subject_key IS NOT NULL AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_rehab_medik_logbook_batch(p_rows jsonb)
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
  v_values jsonb;
  v_responses jsonb;
  v_response jsonb;
  v_option jsonb;
  v_year integer;
  v_source_row integer;
  v_record_date date;
  v_patient_name text;
  v_medical_record text;
  v_therapist text;
  v_code text;
  v_indicator_id uuid;
  v_seen_codes text[];
  v_subject_key text;
  v_expected_review text;
  v_match_count integer;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_record_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Rehab Medik.' USING ERRCODE='28000';
  END IF;
  IF v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Rehab Medik hanya diizinkan bagi Admin/Komite PMKP.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(12) THEN
    RAISE EXCEPTION 'Akses ke Instalasi Rehab Medik tidak tersedia.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 20 THEN
    RAISE EXCEPTION 'Batch impor Rehab Medik harus berisi 1 sampai 20 baris.' USING ERRCODE='22023';
  END IF;
  v_received := jsonb_array_length(p_rows);
  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Rehab Medik mengandung kunci baris sumber yang kosong atau berulang.' USING ERRCODE='22023';
  END IF;

  -- Every indicator profile must exist and be published for the selected profile year.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT (item->'payload'->>'profile_year')::integer AS profile_year
      FROM jsonb_array_elements(p_rows) AS x(item)
    ) years
    WHERE (
      SELECT count(*)
      FROM aureka_quality.indicator_profiles ip
      WHERE ip.room_id=12
        AND ip.profile_year=years.profile_year
        AND ip.is_active=true
        AND ip.status='published'
        AND ip.code IN ('12.1','12.2','12.3','12.4','12.5','12.6')
    ) <> 6
  ) THEN
    RAISE EXCEPTION 'Enam master indikator Rehab Medik harus aktif dan terbit pada tahun profil sebelum impor.' USING ERRCODE='23503';
  END IF;

  -- Validate the complete batch before the first insert.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_values := v_core->'indicator_values';

    IF jsonb_typeof(v_payload)<>'object'
       OR jsonb_typeof(v_core)<>'object'
       OR jsonb_typeof(v_form)<>'object'
       OR jsonb_typeof(v_source)<>'object'
       OR jsonb_typeof(v_values)<>'object'
       OR jsonb_typeof(v_responses)<>'array'
       OR jsonb_array_length(v_responses)<1
       OR jsonb_array_length(v_responses)>6
       OR jsonb_array_length(coalesce(v_row->'attributions','[]'::jsonb))<>0 THEN
      RAISE EXCEPTION 'Struktur payload, enam indikator, atau atribusi sumber Rehab Medik tidak valid.' USING ERRCODE='22023';
    END IF;

    IF coalesce(v_payload->>'room_id','')<>'12'
       OR coalesce(v_payload->>'measurement_grain','')<>'patient_episode'
       OR coalesce(v_payload->>'status','')<>'ready'
       OR coalesce(v_payload->>'review_required','true')<>'false'
       OR coalesce(v_core->>'room_id','')<>'12'
       OR coalesce(v_core->>'unit_name','')<>'Instalasi Rehab Medik'
       OR coalesce(v_core->>'measurement_grain','')<>'patient_episode'
       OR coalesce(v_core->>'status','')<>'Final'
       OR coalesce(v_core->>'workflow_status','')<>'Final'
       OR coalesce(v_source->>'source_sheet','')<>'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL THEN
      RAISE EXCEPTION 'Payload harus merupakan laporan final dari sheet Logbook Instalasi Rehab Medik.' USING ERRCODE='22023';
    END IF;

    IF coalesce(v_payload->>'profile_year','') !~ '^[0-9]{4}$'
       OR (v_payload->>'profile_year')::integer NOT BETWEEN 2026 AND 2100
       OR coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Tahun profil atau nomor baris sumber workbook tidak valid.' USING ERRCODE='22023';
    END IF;

    v_year := (v_payload->>'profile_year')::integer;
    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row<3 OR v_source_row>5002 THEN
      RAISE EXCEPTION 'Baris sumber Excel Rehab Medik harus berada pada rentang 3–5002.' USING ERRCODE='22023';
    END IF;

    BEGIN
      v_record_date := (v_payload->>'record_date')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Dilayani pada payload tidak valid.' USING ERRCODE='22007';
    END;
    IF v_record_date::text<>v_payload->>'record_date'
       OR extract(year FROM v_record_date)::integer<>v_year
       OR coalesce(v_form->>'Tanggal Dilayani','')<>v_record_date::text
       OR coalesce(v_core->>'admission_at','')<>v_record_date::text THEN
      RAISE EXCEPTION 'Tanggal Dilayani harus konsisten dengan tahun profil dan tanggal catatan.' USING ERRCODE='22023';
    END IF;

    v_patient_name := nullif(btrim(v_form->>'Nama Pasien'),'');
    v_medical_record := nullif(btrim(v_form->>'No. Rekam Medis'),'');
    v_therapist := nullif(btrim(v_form->>'Nama Terapis'),'');
    IF v_patient_name IS NULL OR v_medical_record IS NULL OR v_therapist IS NULL THEN
      RAISE EXCEPTION 'Nama pasien, nomor rekam medis, dan nama terapis wajib diisi.' USING ERRCODE='22023';
    END IF;
    IF coalesce(v_core->>'patient_name','')<>v_patient_name
       OR coalesce(v_core->>'medical_record_no','')<>v_medical_record THEN
      RAISE EXCEPTION 'Identitas pasien pada core_data dan form_fields tidak konsisten.' USING ERRCODE='22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR coalesce(v_payload->>'subject_key','')<>'12:'||v_year||':source-row:'||v_source_row THEN
      RAISE EXCEPTION 'Kunci sumber harus menggunakan tahun profil dan nomor baris Excel yang benar.' USING ERRCODE='22023';
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_values))<>jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Jumlah jawaban indikator dan respons master tidak sama.' USING ERRCODE='22023';
    END IF;

    v_seen_codes := ARRAY[]::text[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id','') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator Rehab Medik tidak valid.' USING ERRCODE='22023';
      END IF;
      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;
      SELECT ip.code INTO v_code
      FROM aureka_quality.indicator_profiles ip
      WHERE ip.id=v_indicator_id
        AND ip.room_id=12
        AND ip.profile_year=v_year
        AND ip.is_active=true
        AND ip.status='published'
        AND ip.code IN ('12.1','12.2','12.3','12.4','12.5','12.6');

      IF v_code IS NULL OR v_code=ANY(v_seen_codes) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator yang tidak aktif atau berulang.' USING ERRCODE='23503';
      END IF;
      v_seen_codes := array_append(v_seen_codes,v_code);

      IF coalesce(v_response->>'response_label','')=''
         OR v_response->'raw_value' IS DISTINCT FROM v_values->v_code
         OR coalesce(v_response->'raw_value'->>'answer','')<>v_response->>'response_label'
         OR coalesce(v_response->'raw_value'->>'source_value','')='' THEN
        RAISE EXCEPTION 'Respons indikator % tidak sama dengan nilai yang disimpan pada laporan.',v_code USING ERRCODE='22023';
      END IF;

      SELECT opt INTO v_option
      FROM aureka_quality.indicator_profiles ip
      CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
      WHERE ip.id=v_indicator_id
        AND opt->>'label'=v_response->>'response_label'
        AND coalesce(opt->>'code','')=coalesce(v_response->>'response_code','')
      LIMIT 1;

      IF v_option IS NULL THEN
        RAISE EXCEPTION 'Pilihan indikator % tidak ditemukan pada master aktif: %.',v_code,v_response->>'response_label' USING ERRCODE='23503';
      END IF;

      v_expected_review := CASE
        WHEN v_response->>'response_code' IS NULL
          OR coalesce((v_option->>'review_required')::boolean,false)
          OR jsonb_typeof(v_option->'numerator')<>'boolean'
        THEN 'pending'
        ELSE 'not_required'
      END;
      IF coalesce(v_response->>'review_status','')<>v_expected_review THEN
        RAISE EXCEPTION 'Status telaah pilihan indikator % tidak konsisten dengan master.',v_code USING ERRCODE='22023';
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes)<>jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Kode indikator diulang atau tidak valid.' USING ERRCODE='22023';
    END IF;
  END LOOP;

  -- Write only after every row in this batch has passed validation.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
      FROM aureka_quality.quality_records qr
      WHERE qr.room_id=12
        AND qr.profile_year=(v_payload->>'profile_year')::integer
        AND qr.measurement_grain='patient_episode'
        AND qr.subject_key=v_subject_key
        AND qr.status<>'archived'
    ) THEN
      v_skipped := v_skipped+1;
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
        RAISE EXCEPTION 'Server tidak mengembalikan identitas catatan Rehab Medik.' USING ERRCODE='22023';
      END IF;
      v_imported := v_imported+1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
        FROM aureka_quality.quality_records qr
        WHERE qr.room_id=12
          AND qr.profile_year=(v_payload->>'profile_year')::integer
          AND qr.measurement_grain='patient_episode'
          AND qr.subject_key=v_subject_key
          AND qr.status<>'archived'
      ) THEN
        v_skipped := v_skipped+1;
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'received_count',v_received,
    'imported_count',v_imported,
    'skipped_existing_count',v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_rehab_medik_logbook_batch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.import_rehab_medik_logbook_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION aureka_quality.import_rehab_medik_logbook_batch(jsonb) IS
'Imports verified source rows from the Rehab Medik 2026 Logbook as final patient-episode reports. Idempotency is based on room, profile year and source Excel row.';
