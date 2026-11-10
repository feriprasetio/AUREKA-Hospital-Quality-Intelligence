BEGIN;

DO $igd_master_guard$
DECLARE
  v_count integer;
  v_distinct integer;
  v_bad integer;
BEGIN
  SELECT count(*), count(DISTINCT code),
         count(*) FILTER (WHERE coalesce(schema_json->>'header_label','') <>
           CASE code
             WHEN '6.1' THEN 'Kematian IGD ≤8h'
             WHEN '6.2' THEN 'Door-to-Decision'
             WHEN '6.3' THEN 'Response Time DPJP'
             WHEN '6.4' THEN 'Antrian Rawat Inap'
             WHEN '6.5' THEN 'Kelengkapan Assessment Keperawatan'
             WHEN '6.6' THEN 'Overcrowding Index'
             WHEN '6.7' THEN 'Response Triage'
           END)
    INTO v_count, v_distinct, v_bad
    FROM aureka_quality.indicator_profiles
   WHERE room_id = 6
     AND profile_year = 2026
     AND status = 'published'
     AND is_active = true
     AND code = ANY (ARRAY['6.1','6.2','6.3','6.4','6.5','6.6','6.7']);

  IF v_count <> 7 OR v_distinct <> 7 OR v_bad <> 0 THEN
    RAISE EXCEPTION 'Master IGD 6.1–6.7 harus tepat tujuh profil aktif/published dengan header sumber yang cocok.';
  END IF;
END;
$igd_master_guard$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_igd_excel_row_2026
  ON aureka_quality.quality_records (room_id, profile_year, subject_key)
  WHERE room_id = 6
    AND profile_year = 2026
    AND subject_key LIKE 'excel-pmkp-igd-2026:%:row:%';

CREATE TABLE IF NOT EXISTS aureka_quality.igd_consultation_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_year integer NOT NULL DEFAULT 2026 CHECK (profile_year = 2026),
  source_key text NOT NULL UNIQUE,
  source_workbook text NOT NULL,
  source_file_sha256 text NOT NULL CHECK (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  source_sheet text NOT NULL,
  source_excel_row integer NOT NULL CHECK (source_excel_row > 0),
  source_period_month smallint NOT NULL CHECK (source_period_month BETWEEN 1 AND 5),
  source_excel_no text,
  patient_name text NOT NULL DEFAULT '',
  medical_record_no text NOT NULL DEFAULT '',
  age text,
  sex text,
  patient_type text,
  requesting_doctor text NOT NULL DEFAULT '',
  specialist text NOT NULL DEFAULT '',
  nurse text NOT NULL DEFAULT '',
  registration_at timestamp without time zone,
  raw_registration_at text NOT NULL DEFAULT '',
  consultation_at timestamp without time zone,
  raw_consultation_at text NOT NULL DEFAULT '',
  reported_elapsed_minutes numeric(12,2),
  raw_reported_elapsed text NOT NULL DEFAULT '',
  calculated_elapsed_minutes numeric(12,2),
  door_to_decision_source text NOT NULL DEFAULT '',
  source_performance_label text NOT NULL DEFAULT '',
  source_reason_code text NOT NULL DEFAULT '',
  source_reason_other text NOT NULL DEFAULT '',
  linked_quality_record_id uuid REFERENCES aureka_quality.quality_records(id) ON DELETE SET NULL,
  linked_quality_record_source_key text,
  match_status text NOT NULL CHECK (match_status = ANY (ARRAY[
    'matched_unique_linked',
    'matched_unique_unlinked',
    'ambiguous_rm_date',
    'date_mismatch',
    'rm_not_found',
    'missing_mrn',
    'missing_date'
  ])),
  match_note text NOT NULL DEFAULT '',
  source_warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_warnings) = 'array'),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_snapshot) = 'object'),
  entered_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_igd_consultation_audits_month
  ON aureka_quality.igd_consultation_audits (profile_year, source_period_month, registration_at);

CREATE INDEX IF NOT EXISTS idx_igd_consultation_audits_linked_record
  ON aureka_quality.igd_consultation_audits (linked_quality_record_id)
  WHERE linked_quality_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_igd_consultation_audits_mrn_date
  ON aureka_quality.igd_consultation_audits (medical_record_no, (registration_at::date));

ALTER TABLE aureka_quality.igd_consultation_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS igd_consultation_audits_select_room_access ON aureka_quality.igd_consultation_audits;
CREATE POLICY igd_consultation_audits_select_room_access
  ON aureka_quality.igd_consultation_audits
  FOR SELECT TO authenticated
  USING ((SELECT aureka_system.has_quality_room_access(6)));

DROP POLICY IF EXISTS igd_consultation_audits_insert_pm_kp ON aureka_quality.igd_consultation_audits;
CREATE POLICY igd_consultation_audits_insert_pm_kp
  ON aureka_quality.igd_consultation_audits
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT aureka_system.has_quality_room_access(6))
    AND (SELECT aureka_system.current_role_code()) = ANY (ARRAY['ADMIN','PMKP'])
    AND entered_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS igd_consultation_audits_password_rotation ON aureka_quality.igd_consultation_audits;
CREATE POLICY igd_consultation_audits_password_rotation
  ON aureka_quality.igd_consultation_audits
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT aureka_system.password_rotation_complete()))
  WITH CHECK ((SELECT aureka_system.password_rotation_complete()));

GRANT SELECT, INSERT ON aureka_quality.igd_consultation_audits TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.import_igd_logbook_batch(p_rows jsonb)
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
  v_source_values jsonb;
  v_indicator_values jsonb;
  v_response jsonb;
  v_options jsonb;
  v_key text;
  v_hash text;
  v_source_row integer;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_record_id uuid;
  v_indicator_id uuid;
  v_code text;
  v_response_label text;
  v_response_code text;
  v_source_text text;
  v_match_status text;
  v_raw_value jsonb;
  v_core_value jsonb;
  v_answer text;
  v_record_date date;
  v_admission_at timestamp without time zone;
  v_seen_codes text[];
  v_seen_ids uuid[];
  v_expected_codes text[] := ARRAY['6.1','6.2','6.3','6.4','6.5','6.6','6.7'];
  v_mappings jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor logbook IGD.' USING ERRCODE = '28000';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor workbook IGD hanya diizinkan bagi role ADMIN atau PMKP.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(6) THEN
    RAISE EXCEPTION 'Akses ke unit Instalasi Gawat Darurat tidak tersedia.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch logbook IGD harus berupa array JSON.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 500 THEN
    RAISE EXCEPTION 'Jumlah baris per batch IGD harus 1–500.' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*) FILTER (WHERE nullif(x.item->'payload'->>'subject_key','') IS NULL)
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) > 0 OR (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
      FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch IGD memiliki subject_key kosong atau berulang.' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*)
      FROM aureka_quality.indicator_profiles ip
     WHERE ip.room_id=6 AND ip.profile_year=2026
       AND ip.status='published' AND ip.is_active
       AND ip.code=ANY(v_expected_codes)
  ) <> 7 THEN
    RAISE EXCEPTION 'Tujuh profil indikator IGD harus aktif dan published.' USING ERRCODE = '23503';
  END IF;

  -- Validate the entire batch before any insert.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_values := v_source->'source_indicator_values';
    v_indicator_values := v_core->'indicator_values';

    IF coalesce(jsonb_typeof(v_payload),'') <> 'object'
       OR coalesce(jsonb_typeof(v_core),'') <> 'object'
       OR coalesce(jsonb_typeof(v_form),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source_values),'') <> 'object'
       OR coalesce(jsonb_typeof(v_indicator_values),'') <> 'object'
       OR coalesce(jsonb_typeof(v_row->'responses'),'') <> 'array'
       OR jsonb_array_length(v_row->'responses') <> 7
       OR coalesce(jsonb_typeof(v_row->'attributions'),'') <> 'array'
       OR jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Struktur payload/response/attribution IGD tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id','') <> '6'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_payload->>'status','') <> 'ready'
       OR coalesce(v_payload->>'review_required','false') <> 'true'
       OR coalesce(v_core->>'unit_name','') <> 'Instalasi Gawat Darurat'
       OR coalesce(v_core->>'room_id','') <> '6'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR coalesce(v_source->>'idempotency_basis','') <> 'sha256_plus_physical_excel_row'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL
       OR coalesce(v_source->>'source_file_sha256','') !~ '^[0-9a-f]{64}$'
       OR coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$'
       OR coalesce(v_source->>'source_warnings','') = ''
       OR jsonb_typeof(v_source->'source_warnings') <> 'array'
       OR coalesce(v_core->>'patient_name','') <> coalesce(v_form->>'Nama Pasien','')
       OR coalesce(v_core->>'medical_record_no','') <> coalesce(v_form->>'No. Rekam Medis','')
       OR v_source IS DISTINCT FROM v_core->'source_import'
       OR v_source IS DISTINCT FROM v_payload->'subject_json'->'source_import' THEN
      RAISE EXCEPTION 'Provenance/identitas payload workbook IGD tidak konsisten.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_source_row := (v_source->>'source_excel_row')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Nomor baris Excel IGD tidak valid.' USING ERRCODE = '22023';
    END;
    v_hash := v_source->>'source_file_sha256';
    v_key := v_payload->>'subject_key';
    IF v_source_row < 4 OR v_source_row > 25000
       OR v_key <> 'excel-pmkp-igd-2026:' || v_hash || ':row:' || v_source_row THEN
      RAISE EXCEPTION 'Kunci impor IGD tidak cocok dengan hash dan nomor baris fisik Excel.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_form->>'Waktu Masuk','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
       OR coalesce(v_payload->>'record_date','') <> left(v_form->>'Waktu Masuk',10)
       OR coalesce(v_core->>'admission_at','') <> v_form->>'Waktu Masuk' THEN
      RAISE EXCEPTION 'Waktu Masuk/record_date IGD tidak konsisten.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_admission_at := (v_form->>'Waktu Masuk')::timestamp without time zone;
      v_record_date := (v_payload->>'record_date')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Waktu Masuk IGD tidak valid.' USING ERRCODE = '22007';
    END;
    IF to_char(v_admission_at,'YYYY-MM-DD"T"HH24:MI:SS') <> v_form->>'Waktu Masuk'
       OR v_record_date::text <> left(v_form->>'Waktu Masuk',10)
       OR extract(year FROM v_record_date) <> 2026 THEN
      RAISE EXCEPTION 'Waktu Masuk harus valid pada tahun profil 2026.' USING ERRCODE = '22007';
    END IF;

    IF coalesce(v_source_values ? '6.1',false) IS NOT TRUE
       OR coalesce(v_source_values ? '6.2',false) IS NOT TRUE
       OR coalesce(v_source_values ? '6.3',false) IS NOT TRUE
       OR coalesce(v_source_values ? '6.4',false) IS NOT TRUE
       OR coalesce(v_source_values ? '6.5',false) IS NOT TRUE
       OR coalesce(v_source_values ? '6.6',false) IS NOT TRUE
       OR coalesce(v_source_values ? '6.7',false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Provenance IGD harus mempertahankan seluruh nilai sumber 6.1–6.7.' USING ERRCODE = '22023';
    END IF;

    v_seen_ids := ARRAY[]::uuid[];
    v_seen_codes := ARRAY[]::text[];
    FOR v_response IN SELECT value FROM jsonb_array_elements(v_row->'responses')
    LOOP
      IF coalesce(v_response->>'indicator_id','') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'ID indikator IGD tidak valid.' USING ERRCODE = '22023';
      END IF;
      v_indicator_id := (v_response->>'indicator_id')::uuid;
      SELECT ip.code, ip.options_json
        INTO v_code, v_options
        FROM aureka_quality.indicator_profiles ip
       WHERE ip.id=v_indicator_id
         AND ip.room_id=6 AND ip.profile_year=2026
         AND ip.status='published' AND ip.is_active
         AND ip.code=ANY(v_expected_codes);
      IF v_code IS NULL OR v_indicator_id=ANY(v_seen_ids) OR v_code=ANY(v_seen_codes)
         OR coalesce(jsonb_typeof(v_options),'') <> 'array' THEN
        RAISE EXCEPTION 'ID/kode indikator IGD tidak aktif atau berulang.' USING ERRCODE = '23503';
      END IF;
      v_seen_ids := array_append(v_seen_ids,v_indicator_id);
      v_seen_codes := array_append(v_seen_codes,v_code);

      v_source_text := coalesce(v_source_values->>v_code,'');
      v_response_label := nullif(v_response->>'response_label','');
      v_response_code := nullif(v_response->>'response_code','');
      v_raw_value := v_response->'raw_value';
      v_core_value := v_indicator_values->v_code;
      v_match_status := coalesce(v_raw_value->>'match_status','');
      v_answer := coalesce(v_raw_value->>'answer','');

      IF coalesce(jsonb_typeof(v_raw_value),'') <> 'object'
         OR coalesce(jsonb_typeof(v_core_value),'') <> 'object'
         OR coalesce(v_raw_value->>'source_value','') <> v_source_text
         OR coalesce(v_core_value->>'source_value','') <> v_source_text
         OR v_raw_value->>'code' IS DISTINCT FROM v_response_code
         OR v_core_value->>'code' IS DISTINCT FROM v_response_code
         OR coalesce(v_raw_value->>'answer','') <> coalesce(v_core_value->>'answer','')
         OR coalesce(v_raw_value->>'match_status','') <> coalesce(v_core_value->>'match_status','')
         OR coalesce(v_response->>'review_status','') <> 'pending' THEN
        RAISE EXCEPTION 'Respons/provenance indikator % tidak konsisten.',v_code USING ERRCODE = '22023';
      END IF;

      IF v_source_text = '' THEN
        IF v_response_label IS NOT NULL OR v_response_code IS NOT NULL
           OR nullif(v_response->>'other_text','') IS NOT NULL
           OR v_answer <> '' OR v_match_status <> 'missing' THEN
          RAISE EXCEPTION 'Respons kosong indikator % harus ditandai missing.',v_code USING ERRCODE = '22023';
        END IF;
      ELSIF v_response_code IS NOT NULL THEN
        IF v_response_code !~ '^[1-3]$' OR v_response_label IS NULL
           OR v_match_status <> 'matched' OR v_answer <> v_response_label
           OR nullif(v_response->>'other_text','') IS NOT NULL
           OR lower(regexp_replace(btrim(regexp_replace(v_source_text, '[[:space:]]*[(]code[[:space:]]*[0-9]+[)][[:space:]]*$', '', 'i')), '[[:space:]]+', ' ', 'g'))
              <> lower(regexp_replace(btrim(v_response_label), '[[:space:]]+', ' ', 'g'))
           OR (v_source_text ~* '[(]code[[:space:]]*[0-9]+[)][[:space:]]*$'
               AND substring(v_source_text from '[(]code[[:space:]]*([0-9]+)[)][[:space:]]*$') <> v_response_code)
           OR NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_options) opt
              WHERE opt->>'label'=v_response_label AND opt->>'code'=v_response_code
           ) THEN
          RAISE EXCEPTION 'Pilihan indikator % tidak cocok dengan opsi master aktif.',v_code USING ERRCODE = '23503';
        END IF;
      ELSIF v_response_label IS NOT NULL THEN
        IF v_match_status <> 'needs_review'
           OR coalesce(v_response->>'other_text','') <> v_source_text
           OR v_answer <> v_response_label
           OR lower(regexp_replace(btrim(regexp_replace(v_source_text, '[[:space:]]*[(]code[[:space:]]*[0-9]+[)][[:space:]]*$', '', 'i')), '[[:space:]]+', ' ', 'g'))
              <> lower(regexp_replace(btrim(v_response_label), '[[:space:]]+', ' ', 'g'))
           OR NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_options) opt
              WHERE opt->>'label'=v_response_label
                AND opt->'code'='null'::jsonb
                AND coalesce((opt->>'review_required')::boolean,false)
           ) THEN
          RAISE EXCEPTION 'Opsi indikator % yang memerlukan review tidak cocok dengan master.',v_code USING ERRCODE = '23503';
        END IF;
      ELSE
        IF v_match_status <> 'unmatched'
           OR coalesce(v_response->>'other_text','') <> v_source_text
           OR v_answer <> '' THEN
          RAISE EXCEPTION 'Nilai sumber indikator % yang tidak cocok harus dipertahankan sebagai unmatched.',v_code USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    IF cardinality(v_seen_codes) <> 7 OR NOT ('6.1'=ANY(v_seen_codes))
       OR NOT ('6.2'=ANY(v_seen_codes)) OR NOT ('6.3'=ANY(v_seen_codes))
       OR NOT ('6.4'=ANY(v_seen_codes)) OR NOT ('6.5'=ANY(v_seen_codes))
       OR NOT ('6.6'=ANY(v_seen_codes)) OR NOT ('6.7'=ANY(v_seen_codes)) THEN
      RAISE EXCEPTION 'Setiap episode IGD harus memuat tepat satu response untuk kode 6.1–6.7.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_key := v_payload->>'subject_key';
    SELECT qr.id INTO v_record_id
      FROM aureka_quality.quality_records qr
     WHERE qr.room_id=6 AND qr.profile_year=2026 AND qr.subject_key=v_key;
    IF v_record_id IS NOT NULL THEN
      v_skipped := v_skipped + 1;
    ELSE
      BEGIN
        v_record_id := aureka_quality.save_quality_logbook(
          NULL, v_payload, v_row->'responses', coalesce(v_row->'attributions','[]'::jsonb)
        );
        v_imported := v_imported + 1;
      EXCEPTION WHEN unique_violation THEN
        SELECT qr.id INTO v_record_id
          FROM aureka_quality.quality_records qr
         WHERE qr.room_id=6 AND qr.profile_year=2026 AND qr.subject_key=v_key;
        IF v_record_id IS NULL THEN RAISE; END IF;
        v_skipped := v_skipped + 1;
      END;
    END IF;
    v_mappings := v_mappings || jsonb_build_array(jsonb_build_object('subject_key',v_key,'record_id',v_record_id));
  END LOOP;

  RETURN jsonb_build_object(
    'received_count',v_received,
    'imported_count',v_imported,
    'skipped_existing_count',v_skipped,
    'record_mappings',v_mappings
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_igd_logbook_batch(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_igd_logbook_batch(jsonb) TO authenticated;

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
    IF v_source_row < 1 OR v_month NOT BETWEEN 1 AND 5
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

REVOKE ALL ON FUNCTION aureka_quality.import_igd_consultation_audit_batch(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_igd_consultation_audit_batch(jsonb) TO authenticated;

COMMENT ON TABLE aureka_quality.igd_consultation_audits IS
  'Append-only source audit of ED on-call consultations. Source Yes/No and registration-to-consultation duration are retained as reported/evaluated evidence, not automatically classified as indicator 6.3 DPJP response time.';

COMMIT;
