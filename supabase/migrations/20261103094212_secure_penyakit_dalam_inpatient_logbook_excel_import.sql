-- Secure, row-idempotent Rawat Inap Penyakit Dalam 2026 Logbook import.
-- 16 source indicator option sets remain unclassified (numerator NULL); Linen/Medicine retain current master classification.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_penyakit_dalam_inpatient_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 25
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-rawat-inap-penyakit-dalam-2026:row:%'
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_penyakit_dalam_inpatient_logbook_batch(p_rows jsonb)
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
  v_values jsonb;
  v_responses jsonb;
  v_response jsonb;
  v_map record;
  v_indicator_id uuid;
  v_code text;
  v_source_row integer;
  v_admission_date date;
  v_discharge_date date;
  v_subject_key text;
  v_response_code smallint;
  v_source_code smallint;
  v_option jsonb;
  v_record_id uuid;
  v_seen_codes text[];
  v_seen_ids uuid[];
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_expected_codes text[] := ARRAY[
    '25.1','25.2','25.3','25.4','25.5','25.6','25.7','25.8','25.9',
    '25.10','25.11','25.12','25.13','25.14','25.15','25.16','25.17','25.18'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Rawat Inap Penyakit Dalam.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor workbook Rawat Inap Penyakit Dalam hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(25) THEN
    RAISE EXCEPTION 'Akses ke unit Rawat Inap Penyakit Dalam tidak tersedia.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch impor Rawat Inap Penyakit Dalam harus berupa daftar baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN
    RAISE EXCEPTION 'Batch impor Rawat Inap Penyakit Dalam harus berisi 1 sampai 20 episode.' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch Rawat Inap Penyakit Dalam berisi kunci baris Excel kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(DISTINCT ip.code)
    FROM aureka_quality.indicator_profiles ip
    WHERE ip.room_id = 25
      AND ip.profile_year = 2026
      AND ip.is_active = true
      AND ip.status = 'published'
      AND ip.code = ANY(v_expected_codes)
      AND jsonb_typeof(ip.options_json) = 'array'
      AND jsonb_array_length(ip.options_json) > 0
  ) <> 18 THEN
    RAISE EXCEPTION 'Delapan belas master indikator Rawat Inap Penyakit Dalam 25.1–25.18 harus aktif dan memiliki pilihan sumber.' USING ERRCODE = '23503';
  END IF;

  -- Validate every episode in this batch before the first write.
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
    v_values := v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload),'') <> 'object'
       OR coalesce(jsonb_typeof(v_core),'') <> 'object'
       OR coalesce(jsonb_typeof(v_form),'') <> 'object'
       OR coalesce(jsonb_typeof(v_calc),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source_cells),'') <> 'object'
       OR coalesce(jsonb_typeof(v_values),'') <> 'object'
       OR coalesce(jsonb_typeof(v_responses),'') <> 'array'
       OR jsonb_array_length(v_responses) > 18
       OR coalesce(jsonb_typeof(v_row->'attributions'),'') <> 'array'
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Struktur payload Rawat Inap Penyakit Dalam tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id','') <> '25'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_payload->>'status','') <> 'ready'
       OR coalesce(v_payload->>'review_required','false') <> 'true'
       OR coalesce(v_core->>'room_id','') <> '25'
       OR coalesce(v_core->>'unit_name','') <> 'Rawat Inap Penyakit Dalam'
       OR coalesce(v_core->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_core->>'status','') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status','') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL THEN
      RAISE EXCEPTION 'Payload hanya menerima episode Rawat Inap Penyakit Dalam 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_excel_no','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber Rawat Inap Penyakit Dalam tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_source_row := (v_source->>'source_excel_row')::integer;
    IF v_source_row < 3 OR v_source_row > 5002 THEN
      RAISE EXCEPTION 'Nomor baris Excel harus berada pada rentang 3–5002.' USING ERRCODE = '22023';
    END IF;
    v_subject_key := 'excel-pmkp-rawat-inap-penyakit-dalam-2026:row:' || v_source_row;
    IF coalesce(v_payload->>'subject_key','') <> v_subject_key
       OR coalesce(v_source->>'idempotency_basis','') <> 'room_year_source_excel_row' THEN
      RAISE EXCEPTION 'Kunci idempotensi harus menggunakan nomor baris Excel fisik.' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'),'') IS NULL
       OR nullif(btrim(v_form->>'Tanggal Masuk'),'') IS NULL
       OR nullif(btrim(v_form->>'Diagnosa Tegak'),'') IS NULL
       OR coalesce(v_core->>'patient_name','') <> coalesce(v_form->>'Nama Pasien','')
       OR coalesce(v_core->>'medical_record_no','') <> coalesce(v_form->>'No. Rekam Medis','') THEN
      RAISE EXCEPTION 'Nama Pasien, No. Rekam Medis, Tanggal Masuk, dan Diagnosa Tegak wajib tersedia dan konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_date := (v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Masuk tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;
    IF v_admission_date::text <> coalesce(v_form->>'Tanggal Masuk','')
       OR extract(year FROM v_admission_date)::integer <> 2026
       OR coalesce(v_core->>'admission_at','') <> v_admission_date::text
       OR coalesce(v_payload->>'record_date','') <> v_admission_date::text THEN
      RAISE EXCEPTION 'Tanggal Masuk harus konsisten dan berada pada tahun profil 2026 (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    IF NOT (v_form ? 'Tanggal Keluar') THEN
      RAISE EXCEPTION 'Kolom Tanggal Keluar tidak ditemukan pada payload (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;
    v_discharge_date := NULL;
    IF v_form->'Tanggal Keluar' IS DISTINCT FROM 'null'::jsonb THEN
      IF nullif(btrim(v_form->>'Tanggal Keluar'),'') IS NULL THEN
        RAISE EXCEPTION 'Tanggal Keluar kosong harus direpresentasikan sebagai null (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_discharge_date := (v_form->>'Tanggal Keluar')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Tanggal Keluar tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
      END;
      IF v_discharge_date::text <> coalesce(v_form->>'Tanggal Keluar','')
         OR v_discharge_date < v_admission_date
         OR extract(year FROM v_discharge_date)::integer <> 2026 THEN
        RAISE EXCEPTION 'Tanggal Keluar harus valid, tidak sebelum Tanggal Masuk, dan tahun 2026 (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;
    IF (v_discharge_date IS NULL AND v_core->>'discharge_at' IS NOT NULL)
       OR (v_discharge_date IS NOT NULL AND coalesce(v_core->>'discharge_at','') <> v_discharge_date::text) THEN
      RAISE EXCEPTION 'Tanggal Keluar pada core_data tidak konsisten (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    IF v_discharge_date IS NULL THEN
      IF v_form->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb
         OR v_calc->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb
         OR v_calc->'Open Inpatient Episode' IS DISTINCT FROM 'true'::jsonb THEN
        RAISE EXCEPTION 'LOS turunan harus null dan episode harus ditandai rawat berjalan (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;
    ELSE
      IF coalesce(v_form->>'Lenght of Stay','') <> (v_discharge_date - v_admission_date)::text
         OR coalesce(v_calc->>'Lenght of Stay','') <> (v_discharge_date - v_admission_date)::text
         OR v_calc->'Open Inpatient Episode' IS DISTINCT FROM 'false'::jsonb THEN
        RAISE EXCEPTION 'LOS turunan harus sama dengan selisih tanggal dan status episode tertutup (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_source_cells)) <> 18 THEN
      RAISE EXCEPTION 'Delapan belas kolom sumber indikator wajib dipertahankan pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    FOR v_map IN
      SELECT * FROM (VALUES
        ('25.12','Visite Spesialis'),
        ('25.13','Clinical Pathway'),
        ('25.18','Validitas Asesmen Keperawatan'),
        ('25.11','Transfer IGD'),
        ('25.9','Kekosongan Linen Hari Pertama'),
        ('25.10','Kekosongan Obat Selama Dirawat'),
        ('25.5','Fungsi Ginjal/eGFR'),
        ('25.6','USG Perawatan'),
        ('25.7','Hemodialisis ≤48 Jam'),
        ('25.14','Klinis PGTA'),
        ('25.15','Lab PGTA'),
        ('25.17','Anemia'),
        ('25.1','Komponen Darah'),
        ('25.2','Obat Vasoaktif'),
        ('25.3','Koagulasi Lengkap'),
        ('25.4','EGD + Terapi'),
        ('25.8','HB Pulang >10'),
        ('25.16','Perdarahan Henti')
      ) AS mapping(code, header)
    LOOP
      IF NOT (v_source_cells ? v_map.code)
         OR coalesce(v_form->>v_map.header,'') <> coalesce(v_source_cells->>v_map.code,'') THEN
        RAISE EXCEPTION 'Kolom sumber % tidak konsisten dengan form_fields pada baris Excel %.', v_map.header, v_source_row USING ERRCODE = '22023';
      END IF;
      IF coalesce(v_source_cells->>v_map.code,'') <> '' AND NOT (v_source_values ? v_map.code) THEN
        RAISE EXCEPTION 'Respons indikator % hilang meskipun sel sumber terisi pada baris Excel %.', v_map.code, v_source_row USING ERRCODE = '22023';
      END IF;
      IF coalesce(v_source_cells->>v_map.code,'') = '' AND (v_source_values ? v_map.code) THEN
        RAISE EXCEPTION 'Respons indikator % tidak boleh dibuat dari sel sumber kosong pada baris Excel %.', v_map.code, v_source_row USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF (SELECT count(*) FROM jsonb_object_keys(v_source_values)) <> jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_object_keys(v_values)) <> jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_each_text(v_source_cells) AS cell(key,value)
           WHERE nullif(btrim(value),'') IS NOT NULL) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Jumlah sel indikator terisi, source values, core values, dan respons tidak konsisten pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_codes := ARRAY[]::text[];
    v_seen_ids := ARRAY[]::uuid[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id','') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22023';
      END IF;
      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;
      SELECT ip.code INTO v_code
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id = v_indicator_id
         AND ip.room_id = 25
         AND ip.profile_year = 2026
         AND ip.is_active = true
         AND ip.status = 'published'
         AND ip.code = ANY(v_expected_codes);

      IF v_code IS NULL OR v_code = ANY(v_seen_codes) OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator tidak aktif, salah unit/tahun, atau duplikat pada baris Excel %.', v_source_row USING ERRCODE = '23503';
      END IF;
      v_seen_codes := array_append(v_seen_codes,v_code);
      v_seen_ids := array_append(v_seen_ids,v_indicator_id);

      IF nullif(v_response->>'response_label','') IS NULL
         OR nullif(v_source_values->>v_code,'') IS NULL
         OR coalesce(v_response->'raw_value'->>'source_value','') <> coalesce(v_source_values->>v_code,'')
         OR coalesce(v_response->'raw_value'->>'answer','') <> coalesce(v_response->>'response_label','')
         OR coalesce(v_values->v_code->>'source_value','') <> coalesce(v_source_values->>v_code,'')
         OR coalesce(v_values->v_code->>'answer','') <> coalesce(v_response->>'response_label','')
         OR v_response->'raw_value' IS DISTINCT FROM v_values->v_code
         OR coalesce(v_response->'raw_value'->>'review_required','false') <> 'true'
         OR coalesce(v_response->>'review_status','') <> 'pending'
         OR coalesce(v_response->>'other_text','') <> coalesce(v_source_values->>v_code,'') THEN
        RAISE EXCEPTION 'Nilai sumber/inti/respons indikator % tidak konsisten atau belum pending pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      SELECT opt INTO v_option
        FROM aureka_quality.indicator_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
       WHERE ip.id = v_indicator_id
         AND opt->>'label' = v_response->>'response_label'
       LIMIT 1;

      IF v_option IS NULL THEN
        RAISE EXCEPTION 'Pilihan indikator % tidak ditemukan pada master aktif (baris Excel %).', v_code, v_source_row USING ERRCODE = '23503';
      END IF;

      v_response_code := NULL;
      v_source_code := NULL;
      IF nullif(v_response->>'response_code','') IS NOT NULL THEN
        v_response_code := (v_response->>'response_code')::smallint;
      END IF;
      IF nullif(v_response->'raw_value'->>'source_code','') IS NOT NULL THEN
        v_source_code := (v_response->'raw_value'->>'source_code')::smallint;
      END IF;

      IF v_response_code IS DISTINCT FROM v_source_code
         OR (v_response_code IS NULL AND v_option->'code' IS DISTINCT FROM 'null'::jsonb)
         OR (v_response_code IS NOT NULL AND (v_response_code NOT BETWEEN 1 AND 3 OR v_option->>'code' <> v_response_code::text))
         OR v_response->'raw_value'->'code' IS DISTINCT FROM v_response->'response_code' THEN
        RAISE EXCEPTION 'Kode sumber/master indikator % tidak konsisten atau di luar kode 1–3 pada baris Excel %.', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF v_code IN ('25.9','25.10') THEN
        IF coalesce(v_response->'raw_value'->>'mapping_status','') <> 'mapped_existing_master'
           OR v_option->>'denominator' <> 'true'
           OR v_option->'numerator' IS DISTINCT FROM v_response->'raw_value'->'numerator'
           OR v_response->'raw_value'->>'denominator' <> 'true' THEN
          RAISE EXCEPTION 'Pilihan Linen/Obat harus sesuai klasifikasi master aktif yang sudah ada (baris Excel %).', v_source_row USING ERRCODE = '23503';
        END IF;

        IF NOT (
          (v_code='25.9'
            AND v_source_values->>v_code IN ('Adanya Kekosongan Linen (Code 3)','Tidak Terjadi Kekosongan Linen (Code 1)')
            AND (
              (v_source_values->>v_code='Adanya Kekosongan Linen (Code 3)' AND v_response->>'response_label'='Terjadi kekosongan linen')
              OR (v_source_values->>v_code='Tidak Terjadi Kekosongan Linen (Code 1)' AND v_response->>'response_label'='Tidak terjadi kekosongan linen')
            )
          )
          OR
          (v_code='25.10'
            AND v_source_values->>v_code IN ('Adanya Kekosongan Obat (Code 3)','Tidak Adanya Kekosongan Obat (Code 1)')
            AND (
              (v_source_values->>v_code='Adanya Kekosongan Obat (Code 3)' AND v_response->>'response_label'='Terjadi kekosongan obat')
              OR (v_source_values->>v_code='Tidak Adanya Kekosongan Obat (Code 1)' AND v_response->>'response_label'='Tidak terjadi kekosongan obat')
            )
          )
        ) THEN
          RAISE EXCEPTION 'Alias sumber Linen/Obat tidak cocok dengan pemetaan master yang diizinkan (baris Excel %).', v_source_row USING ERRCODE = '22023';
        END IF;
      ELSE
        IF coalesce(v_response->'raw_value'->>'mapping_status','') <> 'mapped_pending_classification'
           OR v_option->'numerator' IS DISTINCT FROM 'null'::jsonb
           OR v_option->>'denominator' <> 'true'
           OR v_option->>'review_required' <> 'true'
           OR v_response->'raw_value'->'numerator' IS DISTINCT FROM 'null'::jsonb
           OR v_response->'raw_value'->>'denominator' <> 'true' THEN
          RAISE EXCEPTION 'Klasifikasi indikator % harus tetap pending sampai disahkan pemilik indikator (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Kode indikator Rawat Inap Penyakit Dalam berulang pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- All rows passed validation; save using the established audited logbook RPC.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1 FROM aureka_quality.quality_records qr
       WHERE qr.room_id=25
         AND qr.profile_year=2026
         AND qr.measurement_grain='patient_episode'
         AND qr.subject_key=v_subject_key
         AND qr.status<>'archived'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_record_id := aureka_quality.save_quality_logbook(NULL,v_payload,v_row->'responses','[]'::jsonb);
      IF v_record_id IS NULL THEN
        RAISE EXCEPTION 'Server tidak mengembalikan identitas episode Rawat Inap Penyakit Dalam.' USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1 FROM aureka_quality.quality_records qr
         WHERE qr.room_id=25
           AND qr.profile_year=2026
           AND qr.measurement_grain='patient_episode'
           AND qr.subject_key=v_subject_key
           AND qr.status<>'archived'
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
    'skipped_existing_count',v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_penyakit_dalam_inpatient_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_penyakit_dalam_inpatient_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_penyakit_dalam_inpatient_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_penyakit_dalam_inpatient_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_penyakit_dalam_inpatient_logbook_batch(jsonb) IS
'Imports Rawat Inap Penyakit Dalam 2026 Logbook episodes in batches up to 20. Allows open inpatient episodes with null discharge/LOS, preserves original LOS and indicator answers as provenance, keeps 16 indicator classifications pending, preserves existing Linen/Medicine classifications with explicit aliases, and uses the physical Excel row for idempotency.';
