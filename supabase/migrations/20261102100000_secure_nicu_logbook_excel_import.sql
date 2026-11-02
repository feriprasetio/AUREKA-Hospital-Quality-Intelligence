-- Secure NICU 2026 Logbook workbook import and exact source option sync.
-- Source labels/codes are retained; their compliance N/D interpretation remains pending PMKP review.

DO $migration$
DECLARE
  v_updated integer;
BEGIN
  UPDATE aureka_quality.indicator_profiles AS profile
     SET options_json = source.options_json,
         updated_at = now()
    FROM (
      VALUES
        ('18.4', '[{"code":1,"label":"Visite Hari Kerja (06.00-14.00)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Visite Hari Kerja (Diatas 14.00)","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Visite Hari Libur","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Visite","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Divisitekan Spesialis Lain","numerator":null,"denominator":true,"review_required":true}]'::jsonb),
        ('18.5', '[{"code":1,"label":"Seluruh Data Pasien Baru Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tanda Vital Tidak Sesuai Fisik","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tingkat Kesadaran Tidak Sesuai","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skor Risiko Jatuh Tidak Akurat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Skrining Nyeri Tidak Sesuai","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Riwayat Alergi Tidak Tercatat","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Status Nutrisi/Diet Salah Input","numerator":null,"denominator":true,"review_required":true}]'::jsonb),
        ('18.3', '[{"code":1,"label":"Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Tidak Lengkap (Gangguan Sistem E-RM/Jaringan - Ada bukti lapor IT)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"IGD Tidak Memberikan Formulir Transfer","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Bukan Pasien yang Ditransfer dari IGD","numerator":null,"denominator":true,"review_required":true}]'::jsonb),
        ('18.1', '[{"code":1,"label":"Tidak Terjadi (Alat terpasang baik hingga jadwal sapih/extubasi terencana)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Terjadi (Faktor Pasien: Bayi sangat aktif/agitatif \"Self-extubation\" meski fiksasi standar & sedasi masuk)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Terjadi (Faktor Alat: Masalah perekat/plester tidak menempel pada kulit bayi yang lembab/rapuh)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Terjadi (Faktor Petugas: Terlepas saat handling/mengganti posisi/suction/timbang berat badan)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Terjadi (Fiksasi Longgar/Tidak dicek berkala)","numerator":null,"denominator":true,"review_required":true},{"code":null,"label":"Tidak Menggunakan Ventilator/CPAP","numerator":null,"denominator":true,"review_required":true}]'::jsonb),
        ('18.6', '[{"code":1,"label":"Waktu Rawat Sesuai Target Klinis (Pulang saat kondisi stabil)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Waktu Rawat Panjang (Karena Faktor Medis: Prematuritas/BBLR mengejar target BB/Sepsis/Kelainan Bawaan)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Waktu Rawat Panjang (Karena Menunggu Kamar Rawat Inap Biasa/Perina Penuh)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Waktu Rawat Panjang (Karena Faktor Sosial: Keluarga belum siap merawat/Ibu sakit/Masalah Biaya)","numerator":null,"denominator":true,"review_required":true},{"code":3,"label":"Waktu Rawat Panjang (Karena Dokter Penanggung Jawab Jarang Visite/Rencana Pulang Tertunda)","numerator":null,"denominator":true,"review_required":true},{"code":2,"label":"Waktu Rawat Panjang karena Rujukan Faskes lain penuh","numerator":null,"denominator":true,"review_required":true}]'::jsonb)
    ) AS source(code, options_json)
   WHERE profile.room_id = 18
     AND profile.profile_year = 2026
     AND profile.code = source.code
     AND profile.is_active = true
     AND profile.status = 'published';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 5 THEN
    RAISE EXCEPTION 'Sinkronisasi pilihan master NICU gagal: diharapkan 5 profil aktif, diperbarui %.', v_updated;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_nicu_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 18
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-nicu-2026:row:%'
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_nicu_logbook_batch(p_rows jsonb)
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
  v_effective_date date;
  v_los integer;
  v_subject_key text;
  v_response_code smallint;
  v_option_count integer;
  v_record_id uuid;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_expected_codes text[] := ARRAY['18.1','18.3','18.4','18.5','18.6'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook NICU.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Impor workbook NICU hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(18) THEN
    RAISE EXCEPTION 'Akses ke Neonatal Intensive Care Unit & Pediatrics High Dependency Unit tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor NICU harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN
    RAISE EXCEPTION 'Batch impor NICU harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch NICU berisi kunci baris Excel yang kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT ip.code)
    FROM aureka_quality.indicator_profiles ip
    WHERE ip.room_id = 18
      AND ip.profile_year = 2026
      AND ip.is_active = true
      AND ip.status = 'published'
      AND ip.code = ANY (v_expected_codes)
      AND jsonb_typeof(ip.options_json) = 'array'
      AND jsonb_array_length(ip.options_json) > 0
  ) <> 5 THEN
    RAISE EXCEPTION 'Lima master indikator NICU 18.1, 18.3, 18.4, 18.5, dan 18.6 harus aktif serta memiliki pilihan sumber.' USING ERRCODE = '23503';
  END IF;

  -- Validate the complete batch before creating any episode.
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
       OR jsonb_array_length(v_responses) > 5
       OR coalesce(jsonb_typeof(v_row->'attributions'), '') <> 'array'
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Struktur payload NICU tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id', '') <> '18'
       OR coalesce(v_payload->>'profile_year', '') <> '2026'
       OR coalesce(v_payload->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_payload->>'status', '') <> 'ready'
       OR coalesce(v_payload->>'review_required', 'false') <> 'true'
       OR coalesce(v_core->>'room_id', '') <> '18'
       OR coalesce(v_core->>'unit_name', '') <> 'Neonatal Intensive Care Unit & Pediatrics High Dependency Unit'
       OR coalesce(v_core->>'measurement_grain', '') <> 'patient_episode'
       OR coalesce(v_core->>'status', '') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status', '') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'), '') IS NULL THEN
      RAISE EXCEPTION 'Payload hanya menerima episode NICU 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row', '') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber NICU tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5010 THEN
      RAISE EXCEPTION 'Nomor baris Excel NICU harus berada pada rentang 3–5010.' USING ERRCODE = '22023';
    END IF;

    v_subject_key := 'excel-pmkp-nicu-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key', '') <> v_subject_key
       OR coalesce(v_source->>'idempotency_basis', '') <> 'room_year_source_excel_row' THEN
      RAISE EXCEPTION 'Kunci idempotensi NICU harus menggunakan nomor baris Excel fisik.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_date := (v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Masuk NICU tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
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
        RAISE EXCEPTION 'Tanggal Keluar NICU tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
      END;
      IF v_discharge_date::text <> v_form->>'Tanggal Keluar'
         OR extract(year FROM v_discharge_date)::integer <> 2026
         OR v_discharge_date < v_admission_date THEN
        RAISE EXCEPTION 'Tanggal Keluar NICU harus valid, tidak lebih awal dari tanggal masuk, dan berada pada 2026 (baris Excel %).', v_source_row USING ERRCODE = '22023';
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
      RAISE EXCEPTION 'Tanggal pencatatan harus tahun 2026 dan mengikuti tanggal keluar bila tersedia (baris Excel %).', v_source_row USING ERRCODE = '22023';
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
        RAISE EXCEPTION 'LOS harus sama dengan selisih tanggal masuk dan keluar pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'), '') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'), '') IS NULL
       OR nullif(btrim(v_form->>'Perawat Penerima'), '') IS NULL
       OR nullif(btrim(v_form->>'DPJP'), '') IS NULL
       OR coalesce(v_core->>'patient_name', '') <> coalesce(v_form->>'Nama Pasien', '')
       OR coalesce(v_core->>'medical_record_no', '') <> coalesce(v_form->>'No. Rekam Medis', '') THEN
      RAISE EXCEPTION 'Identitas pasien, perawat, dan DPJP wajib lengkap/konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_unmapped->>'source_header', '') <> 'Kekosongan BHP/Linen'
       OR coalesce(v_unmapped->>'mapping_status', '') <> 'combined_source_not_mapped_requires_review'
       OR coalesce(v_unmapped->>'source_value', '') <> coalesce(v_form->>'Kekosongan BHP/Linen (sumber belum dipetakan)', '')
       OR coalesce(jsonb_typeof(v_unmapped->'target_profiles'), '') <> 'array'
       OR jsonb_array_length(v_unmapped->'target_profiles') <> 2 THEN
      RAISE EXCEPTION 'Sumber gabungan BHP/Linen/penunjang harus dipertahankan dan tidak boleh dipaksakan ke master 18.2/18.7.' USING ERRCODE = '22023';
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
        RAISE EXCEPTION 'ID master indikator NICU tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;

      SELECT ip.code
        INTO v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 18
         AND ip.profile_year = 2026
         AND ip.is_active = true
         AND ip.status = 'published'
         AND ip.code = ANY (v_expected_codes);

      IF v_code IS NULL
         OR v_code = ANY(v_seen_codes)
         OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator NICU yang tidak aktif, salah unit/tahun, atau berulang pada baris Excel %.', v_source_row USING ERRCODE = '23503';
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
         OR coalesce(v_response->'raw_value'->>'mapping_status', '') <> 'mapped_pending_classification' THEN
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
        IF v_response->'raw_value'->'code' IS DISTINCT FROM 'null'::jsonb THEN
          RAISE EXCEPTION 'Kode master null tidak konsisten pada indikator % baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
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
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Kode indikator NICU berulang pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Write only after every row in this batch has passed all validations.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1
        FROM aureka_quality.quality_records qr
       WHERE qr.room_id = 18
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
        RAISE EXCEPTION 'Server tidak mengembalikan identitas episode NICU.' USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id = 18
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

REVOKE ALL ON FUNCTION aureka_quality.import_nicu_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_nicu_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_nicu_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_nicu_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_nicu_logbook_batch(jsonb) IS
'Imports NICU 2026 Logbook episodes from an authenticated AUREKA workspace. Episode record date is discharge date when available; source row is the idempotency key; indicator N/D classification remains pending.';
