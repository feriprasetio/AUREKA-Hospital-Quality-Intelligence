-- Perinatology 2026 workbook source option sync and secure idempotent import.
-- The workbook's source codes (1/2/3) are source classifications, not numerator flags.
-- Keep numerator NULL and mark each choice pending until indicator owners approve N/D semantics.

DO $migration$
DECLARE
  v_updated integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles AS profile
     SET options_json = source.options_json,
         updated_at = now()
    FROM (
      VALUES
        ('20.8', $$[
          {"code":1,"label":"Visite Hari Kerja (06.00-14.00)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Visite Hari Kerja (Diatas 14.00)","numerator":null,"denominator":true,"review_required":true},
          {"code":null,"label":"Visite Hari Libur","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tidak Visite","numerator":null,"denominator":true,"review_required":true},
          {"code":null,"label":"Divisitekan Spesialis Lain","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.11', $$[
          {"code":1,"label":"Seluruh Data Pasien Baru Akurat","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tanda Vital dan Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tanda Vital atau Tingkat Kesadaran Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Skor Risiko Jatuh Tidak Akurat","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Skrining Nyeri Tidak Sesuai","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Riwayat Alergi Tidak Tercatat","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.7', $$[
          {"code":1,"label":"Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Lengkap (Gangguan Sistem E-RM/Jaringan - Ada bukti lapor IT)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tidak Ada Formulir Transfer","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.9', $$[
          {"code":1,"label":"Kondisi Stabil (Suhu, Nafas, & Nadi dalam batas normal saat diterima)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Kondisi Tidak Stabil (Faktor Penyakit Berat: Sepsis/Asfiksia Berat/PJB Biru - Memang belum stabil tapi harus masuk rawat intensif)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Kondisi Tidak Stabil (Hipotermia/Dingin: Akibat tidak menggunakan inkubator transport/Metode Kanguru yang benar)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Kondisi Tidak Stabil (Desaturasi/Biru: Oksigen habis saat transport/Slang terlepas)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Kondisi Tidak Stabil (Hipoglikemia: Akibat penundaan transfer terlalu lama tanpa intake)","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.1', $$[
          {"code":1,"label":"Bayi Hidup/Pulang Perbaikan","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Bayi Meninggal (Kondisi Awal Sangat Buruk/Cacat Bawaan Mayor/Prematuritas Ekstrem)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Bayi Meninggal (Datang sudah DOA/Dead on Arrival atau Macerated Stillbirth)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Bayi Meninggal (Diduga akibat keterlambatan resusitasi/kesalahan alat)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Pindah Ruangan NICU untuk Terapi Lanjutan","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Rujuk Faskes Lain","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.2', $$[
          {"code":1,"label":"Diberikan Ventilator/CPAP","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Diberikan (Bayi Bernafas Spontan/Nafas Adekuat - Sesuai Pengecualian)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Diberikan (Keluarga Menolak Intubasi/DNR/Palliative Care)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Diberikan (Alat CPAP Penuh/Rusak)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tidak Diberikan (Indikasi (+) tapi tidak dipasang tanpa alasan jelas)","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.3', $$[
          {"code":1,"label":"Tercatat Lengkap (Menit 1 & 5)","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Tercatat Lengkap (Bayi meninggal < 5 menit/Rujuk keluar segera)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tidak Tercatat Lengkap (Lupa/Tidak diisi di status)","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.4', $$[
          {"code":1,"label":"Dilakukan Penilaian & Terdokumentasi","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Dilakukan (Situasi Code Blue langsung RJP tanpa jeda asesmen formal)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tidak Dilakukan (Lupa/Tidak tertulis)","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.5', $$[
          {"code":1,"label":"Dilakukan VTP < 60 detik","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Tidak Dilakukan VTP (Bayi Bugar/Nafas Spontan/Menangis Kuat)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Dilakukan VTP > 60 detik (Kendala persiapan alat/SDM terlambat)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Tidak Dilakukan VTP padahal indikasi (Bayi Apnea/Megap-megap)","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb),
        ('20.10', $$[
          {"code":1,"label":"Tidak Ada HIE / Skor Thomson Normal","numerator":null,"denominator":true,"review_required":true},
          {"code":2,"label":"Ada HIE (Kasus Rujukan Datang sudah Buruk/Asfiksia Berat tak terhindarkan sejak intrauterin)","numerator":null,"denominator":true,"review_required":true},
          {"code":3,"label":"Ada HIE (Akibat keterlambatan/kesalahan penanganan resusitasi di RS)","numerator":null,"denominator":true,"review_required":true}
        ]$$::jsonb)
    ) AS source(code, options_json)
   WHERE profile.room_id = 20
     AND profile.profile_year = 2026
     AND profile.code = source.code
     AND profile.is_active = true
     AND profile.status = 'published';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 10 THEN
    RAISE EXCEPTION 'Sinkronisasi pilihan master Perinatologi gagal: diharapkan 10 profil aktif, diperbarui %.', v_updated;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_perinatology_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 20
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-perinatologi-2026:row:%'
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_perinatology_logbook_batch(p_rows jsonb)
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
  v_unmapped jsonb;
  v_values jsonb;
  v_responses jsonb;
  v_response jsonb;
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
  v_option_count integer;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_expected_codes text[] := ARRAY['20.1','20.2','20.3','20.4','20.5','20.7','20.8','20.9','20.10','20.11'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Perinatologi.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Perinatologi hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(20) THEN
    RAISE EXCEPTION 'Akses ke Perinatology & Neonatology tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor Perinatologi harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN
    RAISE EXCEPTION 'Batch impor Perinatologi harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Perinatologi berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT ip.code)
    FROM aureka_quality.indicator_profiles ip
    WHERE ip.room_id = 20
      AND ip.profile_year = 2026
      AND ip.is_active = true
      AND ip.status = 'published'
      AND ip.code = ANY (v_expected_codes)
      AND jsonb_typeof(ip.options_json) = 'array'
      AND jsonb_array_length(ip.options_json) > 0
  ) <> 10 THEN
    RAISE EXCEPTION 'Sepuluh master indikator Perinatologi 20.1–20.5 dan 20.7–20.11 harus aktif serta memiliki pilihan sumber.' USING ERRCODE = '23503';
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
    v_unmapped := v_source->'unmapped_source_indicator';
    v_values := v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload), '') <> 'object'
       OR coalesce(jsonb_typeof(v_core), '') <> 'object'
       OR coalesce(jsonb_typeof(v_form), '') <> 'object'
       OR coalesce(jsonb_typeof(v_calc), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source), '') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_unmapped), '') <> 'object'
       OR coalesce(jsonb_typeof(v_values), '') <> 'object'
       OR coalesce(jsonb_typeof(v_responses), '') <> 'array'
       OR jsonb_array_length(v_responses) > 10
       OR coalesce(jsonb_typeof(v_row->'attributions'), '') <> 'array'
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Struktur payload Perinatologi tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '20'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true'
       OR coalesce(v_core->>'room_id', '') <> '20'
       OR coalesce(v_core->>'unit_name', '') <> 'Perinatology & Neonatology'
       OR coalesce(v_core->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_core->>'status', '') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status', '') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL THEN
      RAISE EXCEPTION 'Payload hanya menerima episode Perinatologi 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5007 THEN
      RAISE EXCEPTION 'Nomor baris Excel Perinatologi harus berada pada rentang 3–5007.' USING ERRCODE = '22023';
    END IF;

    v_subject_key := 'excel-pmkp-perinatologi-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key', '') <> v_subject_key
       OR coalesce(v_source->>'idempotency_basis', '') <> 'room_year_source_excel_row' THEN
      RAISE EXCEPTION 'Kunci idempotensi Perinatologi harus menggunakan nomor baris Excel fisik.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_date := (v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Masuk tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF v_admission_date::text <> coalesce(v_form->>'Tanggal Masuk', '')
       OR extract(year FROM v_admission_date)::integer <> 2026
       OR coalesce(v_payload->>'record_date', '') <> v_admission_date::text
       OR coalesce(v_core->>'admission_at', '') <> v_admission_date::text THEN
      RAISE EXCEPTION 'Tanggal Masuk harus konsisten dan berada pada tahun profil 2026 pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_discharge_date := NULL;
    IF nullif(v_form->>'Tanggal Keluar', '') IS NOT NULL THEN
      BEGIN
        v_discharge_date := (v_form->>'Tanggal Keluar')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Tanggal Keluar tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
      END;
      IF v_discharge_date::text <> v_form->>'Tanggal Keluar'
         OR extract(year FROM v_discharge_date)::integer <> 2026
         OR v_discharge_date < v_admission_date THEN
        RAISE EXCEPTION 'Tanggal Keluar tidak konsisten/tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;

    IF (v_discharge_date IS NULL AND nullif(v_core->>'discharge_at', '') IS NOT NULL)
       OR (v_discharge_date IS NOT NULL AND coalesce(v_core->>'discharge_at', '') <> v_discharge_date::text) THEN
      RAISE EXCEPTION 'Tanggal Keluar pada core_data tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_los := CASE WHEN v_discharge_date IS NULL THEN NULL ELSE v_discharge_date - v_admission_date END;
    IF v_los IS NULL THEN
      IF v_form->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb
         OR v_calc->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'LOS harus kosong bila Tanggal Keluar belum tersedia pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    ELSE
      IF coalesce(v_form->>'Lenght of Stay', '') !~ '^[0-9]+$'
         OR coalesce(v_calc->>'Lenght of Stay', '') <> v_los::text
         OR coalesce(v_form->>'Lenght of Stay', '') <> v_los::text THEN
        RAISE EXCEPTION 'LOS harus sama dengan selisih tanggal masuk dan keluar pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'), '') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'), '') IS NULL
       OR nullif(btrim(v_form->>'Diagnosa Tegak'), '') IS NULL
       OR nullif(btrim(v_form->>'Berat Badan'), '') IS NULL
       OR nullif(btrim(v_form->>'Perawat Penerima'), '') IS NULL
       OR nullif(btrim(v_form->>'DPJP'), '') IS NULL
       OR coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '') THEN
      RAISE EXCEPTION 'Identitas dan data episode wajib tidak lengkap/konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_unmapped->>'source_header', '') <> 'Kekosongan BHP/Linen'
       OR coalesce(v_unmapped->>'mapping_status', '') <> 'combined_bhp_linen_source_not_mapped'
       OR coalesce(v_unmapped->>'source_value', '') <> coalesce(v_form->>'Kekosongan BHP/Linen (sumber belum dipetakan)', '')
       OR coalesce(jsonb_typeof(v_unmapped->'target_profiles'), '') <> 'array'
       OR jsonb_array_length(v_unmapped->'target_profiles') <> 2 THEN
      RAISE EXCEPTION 'Sumber gabungan BHP/Linen wajib dipertahankan dan tidak boleh dipaksakan ke 20.6/20.12.' USING ERRCODE = '22023';
    END IF;

    IF (
      SELECT count(*) FROM jsonb_object_keys(v_source_values)
    ) <> jsonb_array_length(v_responses)
       OR (
      SELECT count(*) FROM jsonb_object_keys(v_values)
    ) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Jumlah sumber indikator, nilai inti, dan respons tidak sama pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id', '') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator Perinatologi tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;

      SELECT ip.code
        INTO v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 20
         AND ip.profile_year = 2026
         AND ip.is_active = true
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_code = ANY(v_seen_codes)
         OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator Perinatologi yang tidak aktif, salah unit/tahun, atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
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

      IF coalesce(v_response->>'review_status', '') <> 'pending'
         OR coalesce(v_response->'raw_value'->>'review_required', 'false') <> 'true'
         OR coalesce(v_response->'raw_value'->>'mapping_status', '') NOT IN (
           'mapped_pending_classification','not_in_master','ambiguous_master','source_code_conflict'
         ) THEN
        RAISE EXCEPTION 'Respons indikator % wajib menunggu telaah klasifikasi pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF nullif(v_response->>'response_code', '') IS NOT NULL THEN
        v_response_code := (v_response->>'response_code')::smallint;
        IF v_response_code NOT BETWEEN 1 AND 3
           OR coalesce(v_response->'raw_value'->>'code', '') <> v_response_code::text THEN
          RAISE EXCEPTION 'Kode respons indikator % tidak valid pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
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
        IF coalesce(v_response->'raw_value'->>'mapping_status', '') = 'mapped_pending_classification' THEN
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
        ELSIF coalesce(v_response->'raw_value'->>'mapping_status', '') <> 'not_in_master' THEN
          RAISE EXCEPTION 'Respons tanpa kode indikator % tidak memiliki status pemetaan yang dapat ditelaah pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Kode indikator Perinatologi berulang pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Write only after every episode in this batch has passed validation.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 20
         AND qr.profile_year = 2026
         AND qr.measurement_grain = 'patient_episode'
         AND qr.subject_key = v_subject_key
         AND qr.status <> 'archived'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM aureka_quality.save_quality_logbook(
        NULL,
        v_payload,
        v_row->'responses',
        '[]'::jsonb
      );
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 20
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

REVOKE ALL ON FUNCTION aureka_quality.import_perinatology_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_perinatology_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_perinatology_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_perinatology_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_perinatology_logbook_batch(jsonb) IS
'Imports Perinatology & Neonatology 2026 Logbook episodes from an authenticated AUREKA workspace. Source-row idempotency is used; original source option codes remain pending until approved numerator/denominator classifications are set.';
