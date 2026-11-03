-- Secure, idempotent Rawat Inap Anak 2026 Logbook import.
-- Ongoing inpatient episodes are preserved; Linen and Medicine source fields remain provenance-only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_pediatric_inpatient_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 22
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-rawat-inap-anak-2026:row:%'
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_pediatric_inpatient_logbook_batch(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
 SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb; v_payload jsonb; v_core jsonb; v_form jsonb; v_calc jsonb;
  v_source jsonb; v_source_values jsonb; v_source_cells jsonb; v_source_only jsonb;
  v_values jsonb; v_responses jsonb; v_response jsonb; v_map record;
  v_indicator_id uuid; v_code text; v_source_row integer; v_admission_date date;
  v_discharge_date date; v_birth_date date; v_subject_key text;
  v_response_code smallint; v_source_code smallint; v_option_count integer; v_match_count integer;
  v_record_id uuid; v_seen_codes text[]; v_seen_ids uuid[];
  v_received integer := 0; v_imported integer := 0; v_skipped integer := 0;
  v_expected_codes text[] := ARRAY['22.1','22.2','22.3','22.6','22.7','22.8'];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Rawat Inap Anak.' USING ERRCODE='28000'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN RAISE EXCEPTION 'Impor Rawat Inap Anak hanya untuk Admin/PMKP.' USING ERRCODE='42501'; END IF;
  IF NOT aureka_system.has_quality_room_access(22) THEN RAISE EXCEPTION 'Akses ke unit Rawat Inap Anak tidak tersedia.' USING ERRCODE='42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Batch Rawat Inap Anak harus berupa array.' USING ERRCODE='22023'; END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 20 THEN RAISE EXCEPTION 'Batch harus berisi 1–20 episode.' USING ERRCODE='22023'; END IF;
  IF (SELECT count(DISTINCT x.item->'payload'->>'subject_key') FROM jsonb_array_elements(p_rows) x(item)) <> v_received THEN
    RAISE EXCEPTION 'Kunci baris Excel kosong atau duplikat dalam batch.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(DISTINCT ip.code) FROM aureka_quality.indicator_profiles ip
       WHERE ip.room_id=22 AND ip.profile_year=2026 AND ip.is_active=true AND ip.status='published'
         AND ip.code=ANY(v_expected_codes) AND jsonb_typeof(ip.options_json)='array'
         AND jsonb_array_length(ip.options_json)>0) <> 6 THEN
    RAISE EXCEPTION 'Enam master indikator 22.1, 22.2, 22.3, 22.6, 22.7, 22.8 harus aktif dan memiliki pilihan.' USING ERRCODE='23503';
  END IF;

  -- Validate the entire batch before the first write.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_payload:=v_row->'payload'; v_responses:=v_row->'responses';
    v_core:=v_payload->'core_data'; v_form:=v_core->'form_fields'; v_calc:=v_core->'calculated_fields';
    v_source:=v_core->'source_import'; v_source_values:=v_source->'source_indicator_values';
    v_source_cells:=v_source->'source_indicator_cells'; v_source_only:=v_source->'source_only_fields';
    v_values:=v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload),'')<>'object' OR coalesce(jsonb_typeof(v_core),'')<>'object'
       OR coalesce(jsonb_typeof(v_form),'')<>'object' OR coalesce(jsonb_typeof(v_calc),'')<>'object'
       OR coalesce(jsonb_typeof(v_source),'')<>'object' OR coalesce(jsonb_typeof(v_source_values),'')<>'object'
       OR coalesce(jsonb_typeof(v_source_cells),'')<>'object' OR coalesce(jsonb_typeof(v_source_only),'')<>'array'
       OR coalesce(jsonb_typeof(v_values),'')<>'object' OR coalesce(jsonb_typeof(v_responses),'')<>'array'
       OR jsonb_array_length(v_responses)>6 OR jsonb_array_length(v_source_only)<>2
       OR coalesce(jsonb_typeof(v_row->'attributions'),'')<>'array' OR jsonb_array_length(v_row->'attributions')<>0 THEN
      RAISE EXCEPTION 'Struktur payload Rawat Inap Anak tidak valid.' USING ERRCODE='22023';
    END IF;

    IF coalesce(v_payload->>'room_id','')<>'22' OR coalesce(v_payload->>'profile_year','')<>'2026'
       OR coalesce(v_payload->>'measurement_grain','')<>'patient_episode' OR coalesce(v_payload->>'status','')<>'ready'
       OR coalesce(v_payload->>'review_required','false')<>'true'
       OR coalesce(v_core->>'room_id','')<>'22' OR coalesce(v_core->>'unit_name','')<>'Rawat Inap Anak'
       OR coalesce(v_core->>'measurement_grain','')<>'patient_episode'
       OR coalesce(v_core->>'status','')<>'Ready for Review' OR coalesce(v_core->>'workflow_status','')<>'Ready for Review'
       OR coalesce(v_source->>'source_sheet','')<>'Logbook' OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL THEN
      RAISE EXCEPTION 'Payload harus berasal dari Logbook Rawat Inap Anak 2026 dan berstatus Ready for Review.' USING ERRCODE='22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$' OR coalesce(v_source->>'source_excel_no','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris Excel atau nomor urut sumber tidak valid.' USING ERRCODE='22023';
    END IF;
    v_source_row:=(v_source->>'source_excel_row')::integer;
    IF v_source_row<3 OR v_source_row>5002 THEN RAISE EXCEPTION 'Nomor baris Excel harus 3–5002.' USING ERRCODE='22023'; END IF;
    v_subject_key:='excel-pmkp-rawat-inap-anak-2026:row:'||v_source_row;
    IF coalesce(v_payload->>'subject_key','')<>v_subject_key OR coalesce(v_source->>'idempotency_basis','')<>'room_year_source_excel_row' THEN
      RAISE EXCEPTION 'Kunci idempotensi harus memakai nomor baris Excel fisik.' USING ERRCODE='22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'),'') IS NULL OR nullif(btrim(v_form->>'No. Rekam Medis'),'') IS NULL
       OR nullif(btrim(v_form->>'Tanggal Masuk'),'') IS NULL OR nullif(btrim(v_form->>'Kategori Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'Perawat Penerima'),'') IS NULL OR nullif(btrim(v_form->>'DPJP'),'') IS NULL THEN
      RAISE EXCEPTION 'Nama, No. RM, Tanggal Masuk, Kategori Pasien, Perawat Penerima, dan DPJP wajib tersedia pada baris Excel %.',v_source_row USING ERRCODE='22023';
    END IF;

    BEGIN v_admission_date:=(v_form->>'Tanggal Masuk')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Tanggal Masuk tidak valid pada baris Excel %.',v_source_row USING ERRCODE='22007';
    END;
    IF v_admission_date::text<>coalesce(v_form->>'Tanggal Masuk','') OR extract(year FROM v_admission_date)::integer<>2026
       OR coalesce(v_core->>'admission_at','')<>v_admission_date::text OR coalesce(v_payload->>'record_date','')<>v_admission_date::text THEN
      RAISE EXCEPTION 'Tanggal Masuk harus konsisten dan berada pada 2026 (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;

    v_discharge_date:=NULL;
    IF nullif(v_form->>'Tanggal Keluar','') IS NOT NULL THEN
      BEGIN v_discharge_date:=(v_form->>'Tanggal Keluar')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Tanggal Keluar tidak valid pada baris Excel %.',v_source_row USING ERRCODE='22007';
      END;
      IF v_discharge_date::text<>v_form->>'Tanggal Keluar' OR v_discharge_date<v_admission_date
         OR extract(year FROM v_discharge_date)::integer<>2026 THEN
        RAISE EXCEPTION 'Tanggal Keluar harus valid, tidak sebelum Tanggal Masuk, dan tahun 2026 (baris Excel %).',v_source_row USING ERRCODE='22023';
      END IF;
    ELSIF v_form->'Tanggal Keluar' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Tanggal Keluar kosong harus disimpan sebagai null (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;
    IF (v_discharge_date IS NULL AND v_core->>'discharge_at' IS NOT NULL)
       OR (v_discharge_date IS NOT NULL AND coalesce(v_core->>'discharge_at','')<>v_discharge_date::text) THEN
      RAISE EXCEPTION 'Tanggal Keluar pada core_data tidak konsisten (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;

    IF v_discharge_date IS NULL THEN
      IF v_form->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb OR v_calc->'Lenght of Stay' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'LOS turunan harus null untuk episode ongoing (baris Excel %).',v_source_row USING ERRCODE='22023';
      END IF;
    ELSE
      IF coalesce(v_form->>'Lenght of Stay','')<>(v_discharge_date-v_admission_date)::text
         OR coalesce(v_calc->>'Lenght of Stay','')<>(v_discharge_date-v_admission_date)::text THEN
        RAISE EXCEPTION 'LOS turunan harus sama dengan selisih tanggal (baris Excel %).',v_source_row USING ERRCODE='22023';
      END IF;
    END IF;

    IF nullif(v_form->>'Tanggal Lahir','') IS NOT NULL THEN
      BEGIN v_birth_date:=(v_form->>'Tanggal Lahir')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Tanggal Lahir tidak valid pada baris Excel %.',v_source_row USING ERRCODE='22007';
      END;
      IF v_birth_date::text<>v_form->>'Tanggal Lahir' OR v_birth_date>v_admission_date THEN
        RAISE EXCEPTION 'Tanggal Lahir harus valid dan tidak setelah Tanggal Masuk (baris Excel %).',v_source_row USING ERRCODE='22023';
      END IF;
    END IF;

    IF coalesce(v_core->>'patient_name','')<>coalesce(v_form->>'Nama Pasien','')
       OR coalesce(v_core->>'medical_record_no','')<>coalesce(v_form->>'No. Rekam Medis','') THEN
      RAISE EXCEPTION 'Identitas pasien pada core_data tidak konsisten (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_source_cells))<>8 THEN
      RAISE EXCEPTION 'Enam kolom indikator dan dua kolom sumber-only wajib dipertahankan (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;

    FOR v_map IN SELECT * FROM (VALUES
      ('22.1','Assessment Stunting Wasting2'),('22.2','Ketenangan Pasien'),
      ('22.3','Infus Vena Perifer'),('22.6','Transfer IGD'),
      ('22.7','Visite Spesialis'),('22.8','Validitas Asesmen Keperawatan')
    ) AS mapping(code,header)
    LOOP
      IF NOT (v_source_cells ? v_map.code) OR coalesce(v_form->>v_map.header,'')<>coalesce(v_source_cells->>v_map.code,'') THEN
        RAISE EXCEPTION 'Kolom sumber % tidak konsisten pada baris Excel %.',v_map.header,v_source_row USING ERRCODE='22023';
      END IF;
      IF coalesce(v_source_cells->>v_map.code,'')<>'' AND NOT (v_source_values ? v_map.code) THEN
        RAISE EXCEPTION 'Respons indikator % hilang walau sel sumber terisi (baris Excel %).',v_map.code,v_source_row USING ERRCODE='22023';
      END IF;
      IF coalesce(v_source_cells->>v_map.code,'')='' AND (v_source_values ? v_map.code) THEN
        RAISE EXCEPTION 'Respons indikator % tidak boleh dibuat dari sel kosong (baris Excel %).',v_map.code,v_source_row USING ERRCODE='22023';
      END IF;
    END LOOP;

    IF NOT (v_source_cells ? '22.4_source_only') OR NOT (v_source_cells ? '22.5_source_only')
       OR coalesce(v_form->>'Kekosongan Linen','')<>coalesce(v_source_cells->>'22.4_source_only','')
       OR coalesce(v_form->>'Kekosongan Obat','')<>coalesce(v_source_cells->>'22.5_source_only','') THEN
      RAISE EXCEPTION 'Nilai sumber Kekosongan Linen/Obat tidak dipertahankan persis (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;
    IF coalesce(v_source_only->0->>'code','')<>'22.4' OR coalesce(v_source_only->0->>'source_header','')<>'Kekosongan Linen'
       OR coalesce(v_source_only->0->>'source_value','')<>coalesce(v_form->>'Kekosongan Linen','')
       OR coalesce(v_source_only->0->>'mapping_status','')<>'source_semantics_not_mapped'
       OR coalesce(v_source_only->1->>'code','')<>'22.5' OR coalesce(v_source_only->1->>'source_header','')<>'Kekosongan Obat'
       OR coalesce(v_source_only->1->>'source_value','')<>coalesce(v_form->>'Kekosongan Obat','')
       OR coalesce(v_source_only->1->>'mapping_status','')<>'free_text_source_not_mapped' THEN
      RAISE EXCEPTION 'Kekosongan Linen/Obat wajib dicatat sebagai sumber-only (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_source_values))<>jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_object_keys(v_values))<>jsonb_array_length(v_responses)
       OR (SELECT count(*) FROM jsonb_each_text(v_source_cells) AS c(k,val)
           WHERE k=ANY(v_expected_codes) AND nullif(btrim(val),'') IS NOT NULL)<>jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Jumlah sel indikator terisi dan respons tidak konsisten (baris Excel %).',v_source_row USING ERRCODE='22023';
    END IF;

    v_seen_codes:=ARRAY[]::text[]; v_seen_ids:=ARRAY[]::uuid[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses) LOOP
      IF coalesce(v_response->>'indicator_id','') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID master indikator tidak valid (baris Excel %).',v_source_row USING ERRCODE='22023';
      END IF;
      v_indicator_id:=(v_response->>'indicator_id')::uuid; v_code:=NULL;
      SELECT ip.code INTO v_code FROM aureka_quality.indicator_profiles ip
       WHERE ip.id=v_indicator_id AND ip.room_id=22 AND ip.profile_year=2026
         AND ip.is_active=true AND ip.status='published' AND ip.code=ANY(v_expected_codes);
      IF v_code IS NULL OR v_code=ANY(v_seen_codes) OR v_indicator_id=ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons mengacu pada indikator tidak aktif, salah unit/tahun, atau duplikat (baris Excel %).',v_source_row USING ERRCODE='23503';
      END IF;
      v_seen_codes:=array_append(v_seen_codes,v_code); v_seen_ids:=array_append(v_seen_ids,v_indicator_id);

      IF nullif(v_response->>'response_label','') IS NULL
         OR coalesce(v_source_values->>v_code,'')=''
         OR coalesce(v_response->'raw_value'->>'source_value','')<>coalesce(v_source_values->>v_code,'')
         OR coalesce(v_response->'raw_value'->>'answer','')<>coalesce(v_response->>'response_label','')
         OR coalesce(v_values->v_code->>'source_value','')<>coalesce(v_source_values->>v_code,'')
         OR coalesce(v_values->v_code->>'answer','')<>coalesce(v_response->>'response_label','')
         OR v_response->'raw_value' IS DISTINCT FROM v_values->v_code
         OR coalesce(v_response->'raw_value'->>'review_required','false')<>'true'
         OR coalesce(v_response->>'review_status','')<>'pending'
         OR coalesce(v_response->'raw_value'->>'mapping_status','') NOT IN ('mapped_pending_classification','not_in_master','ambiguous_master','source_code_conflict') THEN
        RAISE EXCEPTION 'Nilai sumber/respons indikator % tidak konsisten atau belum pending (baris Excel %).',v_code,v_source_row USING ERRCODE='22023';
      END IF;

      v_response_code:=NULL;
      IF nullif(v_response->>'response_code','') IS NOT NULL THEN
        v_response_code:=(v_response->>'response_code')::smallint;
        IF v_response_code NOT BETWEEN 1 AND 3 OR coalesce(v_response->'raw_value'->>'code','')<>v_response_code::text
           OR coalesce(v_response->'raw_value'->>'mapping_status','')<>'mapped_pending_classification'
           OR (nullif(v_response->'raw_value'->>'source_code','') IS NOT NULL AND (v_response->'raw_value'->>'source_code')::smallint<>v_response_code) THEN
          RAISE EXCEPTION 'Kode sumber indikator % tidak konsisten (baris Excel %).',v_code,v_source_row USING ERRCODE='22023';
        END IF;
        SELECT count(*) INTO v_option_count FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id=v_indicator_id AND opt->>'label'=v_response->>'response_label'
           AND opt->>'code'=v_response_code::text AND opt->'numerator'='null'::jsonb
           AND opt->>'denominator'='true' AND opt->>'review_required'='true';
        IF v_option_count<>1 THEN RAISE EXCEPTION 'Pilihan indikator % tidak cocok unik dengan master (baris Excel %).',v_code,v_source_row USING ERRCODE='23503'; END IF;
      ELSE
        IF v_response->'raw_value'->'code' IS DISTINCT FROM 'null'::jsonb THEN
          RAISE EXCEPTION 'Kode indikator null tidak konsisten (baris Excel %).',v_source_row USING ERRCODE='22023';
        END IF;
        SELECT count(*) INTO v_match_count FROM aureka_quality.indicator_profiles ip
          CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
         WHERE ip.id=v_indicator_id AND opt->>'label'=v_response->>'response_label';

        IF v_response->'raw_value'->>'mapping_status'='mapped_pending_classification' THEN
          SELECT count(*) INTO v_option_count FROM aureka_quality.indicator_profiles ip
            CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
           WHERE ip.id=v_indicator_id AND opt->>'label'=v_response->>'response_label'
             AND opt->'code'='null'::jsonb AND opt->'numerator'='null'::jsonb
             AND opt->>'denominator'='true' AND opt->>'review_required'='true';
          IF v_option_count<>1 THEN RAISE EXCEPTION 'Pilihan tanpa kode indikator % tidak cocok unik (baris Excel %).',v_code,v_source_row USING ERRCODE='23503'; END IF;
        ELSIF v_response->'raw_value'->>'mapping_status'='source_code_conflict' THEN
          IF nullif(v_response->'raw_value'->>'source_code','') IS NULL THEN RAISE EXCEPTION 'Konflik kode indikator tanpa kode sumber (baris Excel %).',v_source_row USING ERRCODE='22023'; END IF;
          v_source_code:=(v_response->'raw_value'->>'source_code')::smallint;
          SELECT count(*) INTO v_option_count FROM aureka_quality.indicator_profiles ip
            CROSS JOIN LATERAL jsonb_array_elements(ip.options_json) opt
           WHERE ip.id=v_indicator_id AND opt->>'label'=v_response->>'response_label'
             AND opt->'code' IS DISTINCT FROM to_jsonb(v_source_code)
             AND opt->'numerator'='null'::jsonb AND opt->>'denominator'='true' AND opt->>'review_required'='true';
          IF v_option_count<>1 THEN RAISE EXCEPTION 'Konflik kode indikator % tidak cocok master (baris Excel %).',v_code,v_source_row USING ERRCODE='23503'; END IF;
        ELSIF v_response->'raw_value'->>'mapping_status'='not_in_master' THEN
          IF v_match_count<>0 THEN RAISE EXCEPTION 'Respons % ditandai not-in-master tetapi label ditemukan (baris Excel %).',v_code,v_source_row USING ERRCODE='22023'; END IF;
        ELSIF v_response->'raw_value'->>'mapping_status'='ambiguous_master' THEN
          IF v_match_count<2 THEN RAISE EXCEPTION 'Respons % ditandai ambigu tanpa pasangan ganda (baris Excel %).',v_code,v_source_row USING ERRCODE='22023'; END IF;
        END IF;
      END IF;
    END LOOP;
    IF cardinality(v_seen_codes)<>jsonb_array_length(v_responses) THEN
      RAISE EXCEPTION 'Kode indikator berulang pada baris Excel %.',v_source_row USING ERRCODE='22023';
    END IF;
  END LOOP;

  -- Write only after all rows in the batch have passed validation.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_payload:=v_row->'payload'; v_subject_key:=v_payload->>'subject_key';
    IF EXISTS (SELECT 1 FROM aureka_quality.quality_records qr
       WHERE qr.room_id=22 AND qr.profile_year=2026 AND qr.measurement_grain='patient_episode'
         AND qr.subject_key=v_subject_key AND qr.status<>'archived') THEN
      v_skipped:=v_skipped+1; CONTINUE;
    END IF;
    BEGIN
      v_record_id:=aureka_quality.save_quality_logbook(NULL,v_payload,v_row->'responses','[]'::jsonb);
      IF v_record_id IS NULL THEN RAISE EXCEPTION 'Server tidak mengembalikan identitas episode.' USING ERRCODE='22023'; END IF;
      v_imported:=v_imported+1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM aureka_quality.quality_records qr
        WHERE qr.room_id=22 AND qr.profile_year=2026 AND qr.measurement_grain='patient_episode'
          AND qr.subject_key=v_subject_key AND qr.status<>'archived') THEN
        v_skipped:=v_skipped+1;
      ELSE RAISE;
      END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('received_count',v_received,'imported_count',v_imported,'skipped_existing_count',v_skipped);
END;
$function$


REVOKE ALL ON FUNCTION aureka_quality.import_pediatric_inpatient_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_pediatric_inpatient_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_pediatric_inpatient_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_pediatric_inpatient_logbook_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION aureka_quality.import_pediatric_inpatient_logbook_batch(jsonb) IS
'Imports Rawat Inap Anak 2026 episodes. Open episodes are preserved; six categorical indicators remain pending N/D review; Linen and free-text Medicine fields are provenance-only; physical Excel row is the idempotency key.';
