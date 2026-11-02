-- Secure Nifas 2026 workbook import.
-- Indicator option codes are source classifications, never numerator/denominator flags.
DO $migration$
DECLARE
  v_updated integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles AS profile
     SET options_json = source.options_json,
         updated_at = now()
    FROM (
      VALUES
        ("19.1", $json$[{"code":1,"label":"Diberikan Sefazolin 2 gr (30-60 menit sebelum insisi)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Diberikan Antibiotik Lain (Pasien Alergi Sefazolin/Gol. Sefalosporin)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Diberikan Sefazolin tapi Waktu Tidak Tepat (> 1 jam atau sesudah operasi)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Diberikan Antibiotik Profilaksis","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.10", $json$[{"code":1,"label":"Lama Rawat ≤ 3 Hari","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Lama Rawat > 3 Hari (Ada Komplikasi Ibu: Infeksi/Hipertensi/HPP)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Lama Rawat > 3 Hari (Kondisi Bayi Perlu Perawatan/Menunggu Bayi)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Lama Rawat > 3 Hari (Masalah Administrasi/Dokter Tidak Visite)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Lama Rawat >3 Hari (Sudah Atas Persetujuan Dokter)","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.2", $json$[{"code":1,"label":"Dilakukan IMD (Ibu dan Bayi kontak kulit minimal 1 jam)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Dilakukan (Kondisi Ibu Tidak Stabil/Perdarahan/HPP)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Dilakukan (Kondisi Bayi Asfiksia/Butuh Resusitasi/Masuk NICU)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Dilakukan (Ruangan Sibuk/Petugas Lupa/Bayi langsung dibersihkan)","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.3", $json$[{"code":1,"label":"Dilakukan Anestesi Regional (Spinal/Epidural)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Dilakukan Anestesi Umum/GA (Ada Kontraindikasi Regional: Trombositopenia/Masalah Tulang Belakang)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Dilakukan Anestesi Umum/GA (Gagal Spinal/Durasi Operasi Memanjang)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Dilakukan Anestesi Umum/GA (Tanpa Indikasi Medis/Hanya Permintaan Pasien)","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.4", $json$[{"code":1,"label":"Dilakukan Pemeriksaan Hemostasis","numerator":null,"denominator":true,"review_required":true},{"code":1,"label":"Tidak Dilakukan (Sudah ada hasil valid dalam 24 jam terakhir)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Dilakukan (Lupa/Tanpa Alasan)","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.5", $json$[{"code":1,"label":"Sesuai Indikasi POGI (CPD, Placenta Previa, Letak Lintang, Bekas SC >1, dll)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Sesuai Pedoman (Atas Permintaan Sendiri tanpa indikasi medis - Disetujui DPJP)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Sesuai Pedoman (Tanpa Indikasi Medis yang Jelas - Disetujui DPJP)","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.7", $json$[{"code":1,"label":"Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Gangguan Sistem E-RM/Jaringan - Ada bukti lapor IT)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Ada Formulir Transfer","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.8", $json$[{"code":1,"label":"Visite Hari Kerja (06.00-14.00)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Visite Hari Kerja (Diatas 14.00)","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Visite Hari Libur","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Visite","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Divisitekan Spesialis Lain","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb),
        ("19.9", $json$[{"code":1,"label":"Seluruh Data Pasien Baru Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tanda Vital dan Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tanda Vital atau Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skor Risiko Jatuh Tidak Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skrining Nyeri Tidak Sesuai","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Riwayat Alergi Tidak Tercatat","numerator":null,"denominator":true,"review_required":true}]$json$::jsonb)
    ) AS source(code, options_json)
   WHERE profile.room_id = 19
     AND profile.profile_year = 2026
     AND profile.code = source.code
     AND profile.is_active = true
     AND profile.status = 'published'
     AND jsonb_typeof(profile.options_json) = 'array'
     AND jsonb_array_length(profile.options_json) = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 9 THEN
    RAISE EXCEPTION 'Sinkronisasi sembilan master indikator Nifas gagal: diharapkan 9 profil aktif kosong, diperbarui %.', v_updated;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_nifas_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 19
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-nifas-2026:row:%'
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_nifas_logbook_batch(p_rows jsonb)
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
  v_unmapped jsonb;
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
  v_discharge_date date;
  v_effective_date date;
  v_los integer;
  v_subject_key text;
  v_response_code smallint;
  v_source_code smallint;
  v_option_count integer;
  v_match_count integer;
  v_record_id uuid;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_expected_codes text[] := ARRAY['19.1','19.2','19.3','19.4','19.5','19.7','19.8','19.9','19.10'];
  v_expected_headers text[] := ARRAY[
    'Antibiotik Profilaksis',
    'IMD',
    'Anestesi Regional',
    'Hemostasis',
    'Indikasi SC POGI',
    'Transfer IGD',
    'Visite Spesialis',
    'Validitas Asesmen Kebidanan',
    'LOS Post SC <3'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Nifas.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Nifas hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(19) THEN
    RAISE EXCEPTION 'Akses ke unit Nifas Obstetrics & Gynecology tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor Nifas harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN
    RAISE EXCEPTION 'Batch impor Nifas harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Nifas berisi kunci baris Excel kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT ip.code)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id = 19
       AND ip.profile_year = 2026
       AND ip.is_active = true
       AND ip.status = 'published'
       AND ip.code = ANY (v_expected_codes)
       AND jsonb_typeof(ip.options_json) = 'array'
       AND jsonb_array_length(ip.options_json) > 0
  ) <> 9 THEN
    RAISE EXCEPTION 'Sembilan master indikator Nifas 19.1–19.5 dan 19.7–19.10 harus aktif serta memiliki pilihan sumber.' USING ERRCODE = '23503';
  END IF;

  -- Validate every row in the batch before writing the first episode.
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
    v_unmapped := v_source->'unmapped_source_indicator';
    v_values := v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_calc), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_cells), '') <> 'object'
       OR coalesce(jsonb_typeof(v_unmapped), '') <> 'object'
       OR coalesce(jsonb_typeof(v_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR jsonb_array_length(v_responses) > 9
       OR coalesce(jsonb_typeof(v_row->'attributions'), '') <> 'array'
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Struktur payload Nifas tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '19'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true'
       OR coalesce(v_core->>'room_id', '') <> '19'
       OR coalesce(v_core->>'unit_name', '') <> 'Nifas Obstetrics & Gynecology'
       OR coalesce(v_core->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_core->>'status', '') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status', '') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL THEN
      RAISE EXCEPTION 'Payload hanya menerima episode Nifas 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber Nifas tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5010 THEN
      RAISE EXCEPTION 'Nomor baris Excel Nifas harus berada pada rentang 3–5010.' USING ERRCODE = '22023';
    END IF;

    v_subject_key := 'excel-pmkp-nifas-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key', '') <> v_subject_key
       OR coalesce(v_source->>'idempotency_basis', '') <> 'room_year_source_excel_row' THEN
      RAISE EXCEPTION 'Kunci idempotensi Nifas harus menggunakan nomor baris Excel fisik.' USING ERRCODE = '22023';
    END IF;

    IF nullif(v_form->>'Tanggal Masuk', '') IS NULL
       OR nullif(v_form->>'Nama Pasien', '') IS NULL
       OR nullif(v_form->>'No. Rekam Medis', '') IS NULL
       OR nullif(v_form->>'Diagnosa Tegak', '') IS NULL
       OR nullif(v_form->>'Status Pulang', '') IS NULL
       OR nullif(v_form->>'DPJP', '') IS NULL THEN
      RAISE EXCEPTION 'Identitas episode, Tanggal Masuk, diagnosis, Status Pulang, dan DPJP wajib diisi pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_date := (v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Masuk Nifas tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF v_admission_date::text <> coalesce(v_form->>'Tanggal Masuk', '')
       OR extract(year FROM v_admission_date)::integer NOT IN (2025, 2026)
       OR coalesce(v_core->>'admission_at', '') <> v_admission_date::text THEN
      RAISE EXCEPTION 'Tanggal Masuk harus konsisten dan berada pada tahun sumber 2025–2026 pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_discharge_date := NULL;
    IF nullif(v_form->>'Tanggal Keluar', '') IS NOT NULL THEN
      BEGIN
        v_discharge_date := (v_form->>'Tanggal Keluar')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Tanggal Keluar Nifas tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
      END;
      IF v_discharge_date::text <> v_form->>'Tanggal Keluar'
         OR extract(year FROM v_discharge_date)::integer <> 2026
         OR v_discharge_date < v_admission_date THEN
        RAISE EXCEPTION 'Tanggal Keluar harus valid, tidak lebih awal dari Tanggal Masuk, dan berada pada 2026 (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;
    ELSE
      IF v_form->'Tanggal Keluar' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'Tanggal Keluar kosong harus disimpan sebagai null pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;

    IF (v_discharge_date IS NULL AND v_core->>'discharge_at' IS NOT NULL)
       OR (v_discharge_date IS NOT NULL AND coalesce(v_core->>'discharge_at', '') <> v_discharge_date::text) THEN
      RAISE EXCEPTION 'Tanggal Keluar pada core_data tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_effective_date := coalesce(v_discharge_date, v_admission_date);
    IF extract(year FROM v_effective_date)::integer <> 2026
       OR coalesce(v_payload->>'record_date', '') <> v_effective_date::text THEN
      RAISE EXCEPTION 'Tanggal pencatatan harus tahun 2026 dan memakai Tanggal Keluar bila tersedia (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    v_los := CASE WHEN v_discharge_date IS NULL THEN NULL ELSE v_discharge_date - v_admission_date END;
    IF v_los IS NULL THEN
      IF v_form->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb
         OR v_calc->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'LOS harus null bila Tanggal Keluar belum tersedia pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    ELSE
      IF coalesce(v_form->>'Lenght of Stay', '') !~ '^[0-9]+$'
         OR coalesce(v_calc->>'Lenght of Stay', '') <> v_los::text
         OR coalesce(v_form->>'Lenght of Stay', '') <> v_los::text THEN
        RAISE EXCEPTION 'LOS harus sama dengan selisih Tanggal Masuk dan Tanggal Keluar pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;

    IF coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '') THEN
      RAISE EXCEPTION 'Identitas pasien pada core_data tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF (
      SELECT count(*) FROM jsonb_object_keys(v_source_cells)
    ) <> 9 THEN
      RAISE EXCEPTION 'Sembilan nilai sumber indikator Nifas harus dipertahankan pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    FOREACH v_code IN ARRAY v_expected_codes
    LOOP
      SELECT header
        INTO v_header
        FROM (VALUES
          ('19.1','Antibiotik Profilaksis'),
          ('19.2','IMD'),
          ('19.3','Anestesi Regional'),
          ('19.4','Hemostasis'),
          ('19.5','Indikasi SC POGI'),
          ('19.7','Transfer IGD'),
          ('19.8','Visite Spesialis'),
          ('19.9','Validitas Asesmen Kebidanan'),
          ('19.10','LOS Post SC <3')
        ) AS headers(code, header)
       WHERE headers.code = v_code;

      IF v_header IS NULL
         OR coalesce(v_form->>v_header, '') <> coalesce(v_source_cells->>v_code, '') THEN
        RAISE EXCEPTION 'Kolom sumber % tidak konsisten dengan form_fields pada baris Excel %.', v_header, v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_source_cells->>v_code, '') <> ''
         AND NOT (v_source_values ? v_code) THEN
        RAISE EXCEPTION 'Respons indikator % hilang dari payload meskipun nilai sumber terisi pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_source_cells->>v_code, '') = ''
         AND (v_source_values ? v_code) THEN
        RAISE EXCEPTION 'Respons indikator % tidak boleh dibuat untuk sel sumber kosong pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF coalesce(v_unmapped->>'source_header', '') <> 'Kekosongan BHP/Linen'
       OR coalesce(v_unmapped->>'mapping_status', '') <> 'combined_source_not_mapped_requires_review'
       OR coalesce(v_unmapped->>'source_value', '') <> coalesce(v_form->>'Kekosongan BHP/Linen (sumber belum dipetakan)', '')
       OR v_unmapped->'target_profiles' IS DISTINCT FROM
         '["19.6 Kekosongan Linen", "19.11 Kekosongan Obat"]'::jsonb THEN
      RAISE EXCEPTION 'Sumber gabungan BHP/Linen wajib dipertahankan dan tidak boleh dipaksakan ke 19.6/19.11.' USING ERRCODE = '22023';
    END IF;

    IF (
      SELECT count(*) FROM jsonb_object_keys(v_source_values)
    ) <> jsonb_array_length(v_responses)
       OR (
      SELECT count(*) FROM jsonb_object_keys(v_values)
    ) <> jsonb_array_length(v_responses)
       OR (
      SELECT count(*) FROM jsonb_object_keys(v_source_cells) AS cells(code, value)
       WHERE coalesce(v_source_cells->>code, '') <> ''
    ) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Jumlah sel sumber, sumber indikator, nilai inti, dan respons tidak sama pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator Nifas tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;

      SELECT ip.code
        INTO v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 19
         AND ip.profile_year = 2026
         AND ip.is_active = true
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_code = ANY(v_seen_codes)
         OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator Nifas tidak aktif, salah unit/tahun, atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
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
         OR v_response->'raw_value'->>'review_required' <> 'true' THEN
        RAISE EXCEPTION 'Nilai sumber/inti/respons indikator % tidak konsisten pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_response->>'review_status', '') <> 'pending'
         OR coalesce(v_response->'raw_value'->>'mapping_status', '') NOT IN (
           'mapped_pending_classification', 'not_in_master', 'ambiguous_master', 'source_code_conflict'
         ) THEN
        RAISE EXCEPTION 'Respons indikator % wajib menunggu telaah klasifikasi pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      v_response_code := NULL;
      IF nullif(v_response->>'response_code', '') IS NOT NULL THEN
        v_response_code := (v_response->>'response_code')::smallint;
        IF v_response_code NOT BETWEEN 1 AND 3
           OR coalesce(v_response->'raw_value'->>'code', '') <> v_response_code::text
           OR coalesce(v_response->'raw_value'->>'mapping_status', '') <> 'mapped_pending_classification'
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
            RAISE EXCEPTION 'Pilihan tanpa kode indikator % tidak cocok secara unik dengan master pada baris Excel %.', v_code, v_source_row USING ERRCODE = '23503';
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
            RAISE EXCEPTION 'Respons indikator % ditandai tidak ada di master tetapi labelnya ditemukan pada master aktif, baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
          END IF;
        ELSIF v_response->'raw_value'->>'mapping_status' = 'ambiguous_master' THEN
          IF v_match_count < 2 THEN
            RAISE EXCEPTION 'Respons indikator % ditandai ambigu tetapi tidak memiliki beberapa pasangan master, baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
          END IF;
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Kode indikator Nifas berulang pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Write only after all rows in this batch have passed every validation.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 19
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
        RAISE EXCEPTION 'Server tidak mengembalikan identitas episode Nifas.' USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 19
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


REVOKE ALL ON FUNCTION aureka_quality.import_nifas_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_nifas_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_nifas_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_nifas_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_nifas_logbook_batch(jsonb) IS
'Imports Nifas 2026 Logbook episodes from an authenticated AUREKA workspace. Episode record date uses discharge date when available; source Excel row is the idempotency key; source option code is retained but N/D classification remains pending; combined BHP/Linen is provenance only.';
