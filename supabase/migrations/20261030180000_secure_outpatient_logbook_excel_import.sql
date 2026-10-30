-- Generalize outpatient import to the selected profile year (2026+).
CREATE OR REPLACE FUNCTION aureka_quality.import_outpatient_logbook_batch(p_rows jsonb)
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
  v_payload jsonb;
  v_core jsonb;
  v_form jsonb;
  v_source jsonb;
  v_date date;
  v_year integer;
  v_key text;
  v_minutes numeric;
  v_inserted integer := 0;
  v_existing integer := 0;
  v_received integer;
  v_rows_written integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Login diperlukan untuk impor Rawat Jalan.' USING ERRCODE='28000'; END IF;
  IF coalesce(v_role,'') NOT IN ('ADMIN','PMKP') OR NOT aureka_system.has_quality_room_access(11) THEN
    RAISE EXCEPTION 'Impor workbook hanya diizinkan bagi ADMIN/PMKP dengan akses Instalasi Rawat Jalan.' USING ERRCODE='42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Batch harus berupa array JSON.' USING ERRCODE='22023'; END IF;
  v_received:=jsonb_array_length(p_rows);
  IF v_received<1 OR v_received>25 THEN RAISE EXCEPTION 'Batch harus berisi 1–25 baris.' USING ERRCODE='22023'; END IF;
  IF (SELECT count(DISTINCT x.item->'payload'->>'subject_key') FROM jsonb_array_elements(p_rows) x(item))<>v_received THEN
    RAISE EXCEPTION 'Kunci tanggal/klinik/dokter kosong atau duplikat dalam batch.' USING ERRCODE='22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_payload:=v_row->'payload'; v_core:=v_payload->'core_data'; v_form:=v_core->'form_fields'; v_source:=v_core->'source_import';
    BEGIN v_year:=(v_payload->>'profile_year')::integer;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Tahun profil impor tidak valid.' USING ERRCODE='22023'; END;
    IF v_year<2026 OR v_year>2099
       OR coalesce(v_payload->>'room_id','')<>'11'
       OR coalesce(v_payload->>'profile_year','')<>v_year::text
       OR coalesce(v_payload->>'measurement_grain','')<>'provider_day'
       OR coalesce(v_payload->>'status','')<>'ready'
       OR coalesce(v_payload->>'review_required','')<>'true'
       OR coalesce(v_payload->>'record_date','') !~ '^\d{4}-\d{2}-\d{2}$'
       OR coalesce(v_core->>'unit_name','')<>'Instalasi Rawat Jalan'
       OR coalesce(v_core->>'room_id','')<>'11'
       OR coalesce(v_core->>'measurement_grain','')<>'provider_day'
       OR coalesce(v_form->>'Klinik','')=''
       OR coalesce(v_form->>'Dokter','')=''
       OR coalesce(v_source->>'source_workbook','')=''
       OR coalesce(v_source->>'source_excel_row','') !~ '^\d+$' THEN
      RAISE EXCEPTION 'Struktur sumber, identitas unit, tanggal, atau granularitas tidak valid.' USING ERRCODE='22023';
    END IF;
    BEGIN v_date:=(v_payload->>'record_date')::date;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Tanggal pengamatan tidak valid.' USING ERRCODE='22007'; END;
    IF v_date::text<>v_payload->>'record_date' OR extract(year FROM v_date)<>v_year THEN
      RAISE EXCEPTION 'Tanggal pengamatan tidak konsisten dengan tahun profil.' USING ERRCODE='22007';
    END IF;
    IF coalesce(v_form->>'Tanggal pengamatan','')<>v_date::text
       OR coalesce(v_payload->>'subject_key','') NOT LIKE 'excel-pmkp-rawat-jalan-2026:%'
       OR coalesce(v_form->>'Waktu Tunggu Rawat Jalan (Menit)','') !~ '^\d+(\.\d+)?$' THEN
      RAISE EXCEPTION 'Tanggal, idempotency key, atau nilai waktu tunggu tidak valid.' USING ERRCODE='22023';
    END IF;
    v_minutes:=(v_form->>'Waktu Tunggu Rawat Jalan (Menit)')::numeric;
    IF v_minutes<0 OR v_minutes>1440 THEN RAISE EXCEPTION 'Waktu tunggu harus antara 0–1440 menit.' USING ERRCODE='22023'; END IF;
    v_key:=v_payload->>'subject_key';
    IF v_key<> 'excel-pmkp-rawat-jalan-2026:'||v_date::text||':'||
      lower(regexp_replace(btrim(v_form->>'Klinik'),'\s+',' ','g'))||':'||
      lower(regexp_replace(btrim(v_form->>'Dokter'),'\s+',' ','g')) THEN
      RAISE EXCEPTION 'Kunci tanggal/klinik/dokter tidak konsisten dengan isi data.' USING ERRCODE='22023';
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_payload:=v_row->'payload'; v_key:=v_payload->>'subject_key'; v_year:=(v_payload->>'profile_year')::integer;
    SELECT count(*) INTO v_rows_written FROM aureka_quality.quality_records
      WHERE room_id=11 AND profile_year=v_year AND measurement_grain='provider_day'
        AND subject_key=v_key AND status<>'archived';
    IF v_rows_written>0 THEN v_existing:=v_existing+1; CONTINUE; END IF;
    INSERT INTO aureka_quality.quality_records(room_id,profile_year,measurement_grain,record_date,subject_key,subject_json,core_data,status,review_required,entered_by)
    VALUES(11,v_year,'provider_day',(v_payload->>'record_date')::date,v_key,
      coalesce(v_payload->'subject_json','{}'::jsonb),coalesce(v_payload->'core_data','{}'::jsonb),
      'ready',true,v_user_id);
    v_inserted:=v_inserted+1;
  END LOOP;
  RETURN jsonb_build_object('received_count',v_received,'imported_count',v_inserted,'skipped_existing_count',v_existing);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_outpatient_logbook_batch(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION aureka_quality.import_outpatient_logbook_batch(jsonb) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_outpatient_provider_day_excel_2026
ON aureka_quality.quality_records(room_id,profile_year,measurement_grain,subject_key)
WHERE room_id=11 AND profile_year>=2026 AND measurement_grain='provider_day'
AND status<>'archived' AND subject_key LIKE 'excel-pmkp-rawat-jalan-2026:%';
