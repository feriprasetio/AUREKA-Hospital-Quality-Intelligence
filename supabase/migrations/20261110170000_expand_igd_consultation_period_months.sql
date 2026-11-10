BEGIN;

ALTER TABLE aureka_quality.igd_consultation_audits
  DROP CONSTRAINT IF EXISTS igd_consultation_audits_source_period_month_check;

ALTER TABLE aureka_quality.igd_consultation_audits
  ADD CONSTRAINT igd_consultation_audits_source_period_month_check
  CHECK (source_period_month BETWEEN 1 AND 12);

CREATE OR REPLACE FUNCTION aureka_quality.import_igd_consultation_audit_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_source_key text;
  v_hash text;
  v_sheet text;
  v_source_row integer;
  v_month integer;
  v_mrn text;
  v_registration timestamp without time zone;
  v_consultation timestamp without time zone;
  v_linked_id uuid;
  v_linked_key text;
  v_match_status text;
  v_row_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor audit konsultasi DPJP IGD.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor audit konsultasi hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(6) THEN
    RAISE EXCEPTION 'Akses ke unit IGD tidak tersedia.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch audit konsultasi harus berupa array JSON.' USING ERRCODE = '22023';
  END IF;
  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 500 THEN
    RAISE EXCEPTION 'Jumlah baris per batch audit konsultasi harus 1–500.' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*) FILTER (WHERE nullif(x.item->>'source_key','') IS NULL)
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) > 0 OR (
    SELECT count(DISTINCT x.item->>'source_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch audit konsultasi memiliki source_key kosong atau berulang.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_source_key := v_row->>'source_key';
    v_hash := v_row->>'source_file_sha256';
    v_sheet := v_row->>'source_sheet';
    v_mrn := coalesce(v_row->>'medical_record_no','');
    v_linked_id := nullif(v_row->>'linked_quality_record_id','')::uuid;
    v_linked_key := nullif(v_row->>'linked_quality_record_source_key','');
    v_match_status := coalesce(v_row->>'match_status','');

    IF coalesce(v_row->>'profile_year','') <> '2026'
       OR coalesce(v_row->>'source_workbook','') = ''
       OR coalesce(v_hash,'') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_sheet,'') = ''
       OR coalesce(v_match_status,'') NOT IN (
         'matched_unique_linked','matched_unique_unlinked','ambiguous_rm_date',
         'date_mismatch','rm_not_found','missing_mrn','missing_date'
       )
       OR coalesce(jsonb_typeof(v_row->'source_warnings'),'') <> 'array' THEN
      RAISE EXCEPTION 'Metadata sumber atau status pencocokan audit konsultasi tidak valid.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_source_row := (v_row->>'source_excel_row')::integer;
      v_month := (v_row->>'source_period_month')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Nomor baris/bulan sumber konsultasi tidak valid.' USING ERRCODE = '22023';
    END;
    IF v_source_row < 1 OR v_month NOT BETWEEN 1 AND 12
       OR v_source_key !~ '^igd-consult-2026:[0-9a-f]{64}:[A-Za-z0-9%._-]+:[0-9]+$'
       OR split_part(v_source_key, ':', 2) <> v_hash
       OR split_part(v_source_key, ':', 4) <> v_source_row::text
       OR v_source_row < 1 THEN
      RAISE EXCEPTION 'source_key/bulan/baris audit konsultasi tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF nullif(v_row->>'registration_at','') IS NOT NULL THEN
      IF v_row->>'registration_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' THEN
        RAISE EXCEPTION 'Waktu Registrasi hasil parsing tidak valid.' USING ERRCODE = '22007';
      END IF;
      v_registration := (v_row->>'registration_at')::timestamp without time zone;
    ELSE
      v_registration := NULL;
    END IF;
    IF nullif(v_row->>'consultation_at','') IS NOT NULL THEN
      IF v_row->>'consultation_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' THEN
        RAISE EXCEPTION 'Waktu Konsultasi hasil parsing tidak valid.' USING ERRCODE = '22007';
      END IF;
      v_consultation := (v_row->>'consultation_at')::timestamp without time zone;
    ELSE
      v_consultation := NULL;
    END IF;

    IF v_linked_id IS NOT NULL THEN
      IF v_match_status <> 'matched_unique_linked'
         OR v_linked_key IS NULL
         OR v_registration IS NULL
         OR NOT EXISTS (
           SELECT 1
             FROM aureka_quality.quality_records qr
            WHERE qr.id=v_linked_id
              AND qr.room_id=6
              AND qr.profile_year=2026
              AND qr.subject_key=v_linked_key
              AND qr.record_date=v_registration::date
              AND coalesce(qr.core_data->'form_fields'->>'No. Rekam Medis','')=v_mrn
         ) THEN
        RAISE EXCEPTION 'Relasi audit konsultasi ke episode IGD tidak valid; RM dan tanggal harus cocok persis.' USING ERRCODE = '23503';
      END IF;
    ELSIF v_match_status = 'matched_unique_linked' THEN
      RAISE EXCEPTION 'Status linked_unique memerlukan ID episode yang valid.' USING ERRCODE = '23503';
    END IF;
    IF v_linked_id IS NULL AND v_match_status='matched_unique_unlinked' AND v_linked_key IS NULL THEN
      RAISE EXCEPTION 'Kandidat kecocokan unik harus menyimpan source_key episode.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO aureka_quality.igd_consultation_audits (
      profile_year, source_key, source_workbook, source_file_sha256, source_sheet,
      source_excel_row, source_period_month, source_excel_no, patient_name, medical_record_no,
      age, sex, patient_type, requesting_doctor, specialist, nurse,
      registration_at, raw_registration_at, consultation_at, raw_consultation_at,
      reported_elapsed_minutes, raw_reported_elapsed, calculated_elapsed_minutes,
      door_to_decision_source, source_performance_label, source_reason_code, source_reason_other,
      linked_quality_record_id, linked_quality_record_source_key, match_status, match_note,
      source_warnings, source_snapshot, entered_by
    )
    VALUES (
      2026, v_row->>'source_key', v_row->>'source_workbook', v_row->>'source_file_sha256', v_row->>'source_sheet',
      (v_row->>'source_excel_row')::integer, (v_row->>'source_period_month')::smallint,
      nullif(v_row->>'source_excel_no',''), coalesce(v_row->>'patient_name',''), coalesce(v_row->>'medical_record_no',''),
      nullif(v_row->>'age',''), nullif(v_row->>'sex',''), nullif(v_row->>'patient_type',''),
      coalesce(v_row->>'requesting_doctor',''), coalesce(v_row->>'specialist',''), coalesce(v_row->>'nurse',''),
      nullif(v_row->>'registration_at','')::timestamp without time zone, coalesce(v_row->>'raw_registration_at',''),
      nullif(v_row->>'consultation_at','')::timestamp without time zone, coalesce(v_row->>'raw_consultation_at',''),
      nullif(v_row->>'reported_elapsed_minutes','')::numeric, coalesce(v_row->>'raw_reported_elapsed',''),
      nullif(v_row->>'calculated_elapsed_minutes','')::numeric,
      coalesce(v_row->>'door_to_decision_source',''), coalesce(v_row->>'source_performance_label',''),
      coalesce(v_row->>'source_reason_code',''), coalesce(v_row->>'source_reason_other',''),
      nullif(v_row->>'linked_quality_record_id','')::uuid,
      nullif(v_row->>'linked_quality_record_source_key',''), v_row->>'match_status', coalesce(v_row->>'match_note',''),
      coalesce(v_row->'source_warnings','[]'::jsonb), v_row, v_user_id
    )
    ON CONFLICT (source_key) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 1 THEN v_imported := v_imported + 1;
    ELSE v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'received_count',v_received,
    'imported_count',v_imported,
    'skipped_existing_count',v_skipped
  );
END;
$function$;

COMMENT ON COLUMN aureka_quality.igd_consultation_audits.source_period_month IS
  'Month number extracted from the source workbook filename; accepts all calendar months 1–12 for the active 2026 profile.';

COMMIT;
