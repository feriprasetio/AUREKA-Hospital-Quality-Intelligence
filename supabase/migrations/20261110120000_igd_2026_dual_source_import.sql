-- Instalasi Gawat Darurat 2026: idempotent episode import + separate DPJP consultation evidence.
-- Source responses are preserved verbatim and remain pending review. The DPJP supplement
-- is deliberately not written into indicator 6.2/6.3 response rows because the supplied
-- workbook does not contain a consultation-request timestamp and its Door-to-Decision
-- threshold (4h) conflicts with the currently published AUREKA definition (<2h).

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_igd_excel_source_row
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 6
    AND profile_year = 2026
    AND measurement_grain = 'patient_episode'
    AND subject_key LIKE 'excel-pmkp-igd-2026:row:%'
    AND status <> 'archived';

CREATE TABLE IF NOT EXISTS aureka_quality.ed_consultation_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL DEFAULT 6 CHECK (room_id = 6),
  profile_year integer NOT NULL DEFAULT 2026 CHECK (profile_year = 2026),
  source_workbook text NOT NULL,
  source_sheet text NOT NULL,
  source_excel_row integer NOT NULL CHECK (source_excel_row >= 31),
  source_no text NOT NULL DEFAULT '',
  consultation_month smallint NOT NULL CHECK (consultation_month BETWEEN 1 AND 12),
  patient_name text NOT NULL DEFAULT '',
  medical_record_no text NOT NULL DEFAULT '',
  age text NOT NULL DEFAULT '',
  sex text NOT NULL DEFAULT '',
  patient_type text NOT NULL DEFAULT '',
  ed_doctor text NOT NULL DEFAULT '',
  specialist_doctor text NOT NULL DEFAULT '',
  nurse text NOT NULL DEFAULT '',
  registered_at timestamptz,
  consultation_at timestamptz,
  registration_to_consultation_minutes numeric(10,2),
  source_duration_minutes numeric(10,2),
  door_to_decision_label text NOT NULL DEFAULT '',
  door_to_decision_code smallint CHECK (door_to_decision_code IS NULL OR door_to_decision_code BETWEEN 1 AND 3),
  quality_attainment text NOT NULL DEFAULT '',
  dpjp_response_reason text NOT NULL DEFAULT '',
  dpjp_response_code smallint CHECK (dpjp_response_code IS NULL OR dpjp_response_code BETWEEN 1 AND 3),
  other_reason text NOT NULL DEFAULT '',
  quality_record_id uuid REFERENCES aureka_quality.quality_records(id) ON DELETE SET NULL,
  link_status text NOT NULL DEFAULT 'unmatched'
    CHECK (link_status IN ('matched','ambiguous','unmatched')),
  candidate_source_rows jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(candidate_source_rows) = 'array'),
  match_delta_seconds numeric(10,2),
  review_flags jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(review_flags) = 'array'),
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','reviewed','excluded')),
  source_json jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_json) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ed_consultation_audits_source
    UNIQUE (room_id, profile_year, source_workbook, source_sheet, source_excel_row),
  CONSTRAINT ck_ed_consultation_duration_nonnegative
    CHECK (registration_to_consultation_minutes IS NULL OR registration_to_consultation_minutes >= 0),
  CONSTRAINT ck_ed_consultation_source_duration_nonnegative
    CHECK (source_duration_minutes IS NULL OR source_duration_minutes >= 0),
  CONSTRAINT ck_ed_consultation_month_consistent
    CHECK (
      consultation_at IS NULL
      OR (
        extract(year FROM consultation_at AT TIME ZONE 'Asia/Pontianak') = 2026
        AND extract(month FROM consultation_at AT TIME ZONE 'Asia/Pontianak') = consultation_month
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_ed_consultation_audits_month_link
  ON aureka_quality.ed_consultation_audits (consultation_month, link_status, review_status);

CREATE INDEX IF NOT EXISTS idx_ed_consultation_audits_record
  ON aureka_quality.ed_consultation_audits (quality_record_id)
  WHERE quality_record_id IS NOT NULL;

ALTER TABLE aureka_quality.ed_consultation_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ed_consultation_audits_select_authorized ON aureka_quality.ed_consultation_audits;
CREATE POLICY ed_consultation_audits_select_authorized
  ON aureka_quality.ed_consultation_audits
  FOR SELECT
  TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP','PIC')
    AND aureka_system.has_quality_room_access(6)
  );

DROP POLICY IF EXISTS ed_consultation_audits_insert_pmkp ON aureka_quality.ed_consultation_audits;
CREATE POLICY ed_consultation_audits_insert_pmkp
  ON aureka_quality.ed_consultation_audits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(6)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

GRANT SELECT, INSERT ON aureka_quality.ed_consultation_audits TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.import_igd_logbook_batch(p_rows jsonb)
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
  v_source_cells jsonb;
  v_indicator_cells jsonb;
  v_indicator_values jsonb;
  v_responses jsonb;
  v_response jsonb;
  v_code text;
  v_indicator_id uuid;
  v_source_row integer;
  v_subject_key text;
  v_admission_at timestamptz;
  v_record_date date;
  v_expected_codes text[] := ARRAY['6.1','6.2','6.3','6.4','6.5','6.6','6.7'];
  v_seen_codes text[];
  v_seen_ids uuid[];
  v_expected_responses integer;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_record_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook IGD.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor workbook IGD hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(6) THEN
    RAISE EXCEPTION 'Akses ke unit Instalasi Gawat Darurat tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch IGD harus berupa array baris yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 100 THEN
    RAISE EXCEPTION 'Batch impor IGD harus berisi 1 sampai 100 episode.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT x.item->'payload'->>'subject_key')
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch IGD berisi kunci baris Excel kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT ip.code)
    FROM aureka_quality.indicator_profiles ip
    WHERE ip.room_id = 6
      AND ip.profile_year = 2026
      AND ip.is_active
      AND ip.status = 'published'
      AND ip.code = ANY(v_expected_codes)
  ) <> 7 THEN
    RAISE EXCEPTION 'Tujuh profil indikator IGD 6.1–6.7 harus aktif dan published.' USING ERRCODE = '23503';
  END IF;

  -- Validate the complete batch before its first write.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_cells := v_source->'source_cells';
    v_indicator_cells := v_source->'source_indicator_cells';
    v_indicator_values := v_source->'source_indicator_values';
    v_responses := v_row->'responses';

    IF coalesce(jsonb_typeof(v_payload),'') <> 'object'
       OR coalesce(jsonb_typeof(v_core),'') <> 'object'
       OR coalesce(jsonb_typeof(v_form),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source),'') <> 'object'
       OR coalesce(jsonb_typeof(v_source_cells),'') <> 'object'
       OR coalesce(jsonb_typeof(v_indicator_cells),'') <> 'object'
       OR coalesce(jsonb_typeof(v_indicator_values),'') <> 'object'
       OR coalesce(jsonb_typeof(v_responses),'') <> 'array'
       OR coalesce(jsonb_typeof(v_row->'attributions'),'') <> 'array' THEN
      RAISE EXCEPTION 'Struktur payload episode IGD tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(v_row->'attributions') <> 0 THEN
      RAISE EXCEPTION 'Atribusi tenaga tidak diperbolehkan pada impor IGD tahap ini.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_payload->>'room_id','') <> '6'
       OR coalesce(v_payload->>'profile_year','') <> '2026'
       OR coalesce(v_payload->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_payload->>'status','') <> 'ready'
       OR coalesce(v_payload->>'review_required','false') <> 'true'
       OR coalesce(v_payload->>'entered_by','') <> v_user_id::text
       OR coalesce(v_core->>'room_id','') <> '6'
       OR coalesce(v_core->>'unit_name','') <> 'Instalasi Gawat Darurat'
       OR coalesce(v_core->>'measurement_grain','') <> 'patient_episode'
       OR coalesce(v_core->>'status','') <> 'Ready for Review'
       OR coalesce(v_core->>'workflow_status','') <> 'Ready for Review'
       OR coalesce(v_source->>'source_sheet','') <> 'Logbook'
       OR nullif(btrim(v_source->>'source_workbook'),'') IS NULL
       OR coalesce(v_source->>'import_scope','') <> 'igd_patient_episode'
       OR coalesce(v_source->>'idempotency_basis','') <> 'physical_excel_row'
       OR v_payload->'subject_json'->'source_import' IS DISTINCT FROM v_source THEN
      RAISE EXCEPTION 'Payload hanya menerima episode IGD 2026 dari sheet Logbook dengan status Ready for Review.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_source->>'source_excel_row','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Nomor baris fisik Excel IGD tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_source->>'source_excel_row')::integer;
    v_subject_key := 'excel-pmkp-igd-2026:row:' || v_source_row::text;

    IF v_source_row < 4 OR v_source_row > 15000
       OR coalesce(v_payload->>'subject_key','') <> v_subject_key THEN
      RAISE EXCEPTION 'Kunci idempotensi IGD harus menggunakan nomor baris fisik Excel.' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_form->>'Nama Pasien'),'') IS NULL
       OR nullif(btrim(v_form->>'No. Rekam Medis'),'') IS NULL
       OR nullif(btrim(v_form->>'Waktu Masuk'),'') IS NULL
       OR coalesce(v_core->>'patient_name','') <> coalesce(v_form->>'Nama Pasien','')
       OR coalesce(v_core->>'medical_record_no','') <> coalesce(v_form->>'No. Rekam Medis','')
       OR coalesce(v_core->>'admission_at','') <> coalesce(v_form->>'Waktu Masuk','') THEN
      RAISE EXCEPTION 'Nama pasien, RM, dan Waktu Masuk harus konsisten pada episode IGD baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_admission_at := (v_form->>'Waktu Masuk')::timestamptz;
      v_record_date := (v_payload->>'record_date')::date;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Waktu Masuk atau record_date tidak valid pada baris Excel %.', v_source_row USING ERRCODE = '22007';
    END;

    IF extract(year FROM v_admission_at AT TIME ZONE 'Asia/Pontianak') <> 2026
       OR (v_admission_at AT TIME ZONE 'Asia/Pontianak')::date <> v_record_date THEN
      RAISE EXCEPTION 'Tanggal episode IGD harus berada pada profil 2026 dan konsisten dengan record_date (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_indicator_cells)) <> 7 THEN
      RAISE EXCEPTION 'Tujuh sel sumber indikator IGD harus dipertahankan pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;

    v_expected_responses := 0;
    FOREACH v_code IN ARRAY v_expected_codes
    LOOP
      IF nullif(btrim(v_indicator_cells->>v_code),'') IS NOT NULL THEN
        v_expected_responses := v_expected_responses + 1;
        IF coalesce(v_indicator_values->>v_code,'') <> coalesce(v_indicator_cells->>v_code,'') THEN
          RAISE EXCEPTION 'Nilai sumber indikator % hilang/tidak konsisten (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
        END IF;
      ELSIF v_indicator_values ? v_code THEN
        RAISE EXCEPTION 'Respons indikator % dibuat dari sel sumber kosong (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF jsonb_array_length(v_responses) <> v_expected_responses THEN
      RAISE EXCEPTION 'Jumlah respons harus sama dengan jumlah sel indikator yang benar-benar terisi (baris Excel %).', v_source_row USING ERRCODE = '22023';
    END IF;

    v_seen_codes := ARRAY[]::text[];
    v_seen_ids := ARRAY[]::uuid[];

    FOR v_response IN SELECT value FROM jsonb_array_elements(v_responses)
    LOOP
      IF coalesce(v_response->>'indicator_id','') !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'Identitas master indikator tidak valid (baris Excel %).', v_source_row USING ERRCODE = '22023';
      END IF;

      v_indicator_id := (v_response->>'indicator_id')::uuid;
      v_code := NULL;

      SELECT ip.code INTO v_code
      FROM aureka_quality.indicator_profiles ip
      WHERE ip.id = v_indicator_id
        AND ip.room_id = 6
        AND ip.profile_year = 2026
        AND ip.is_active
        AND ip.status = 'published'
        AND ip.code = ANY(v_expected_codes);

      IF v_code IS NULL OR v_code = ANY(v_seen_codes) OR v_indicator_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'Respons indikator IGD mengacu pada profil yang tidak aktif, salah unit/tahun, atau berulang (baris Excel %).', v_source_row USING ERRCODE = '23503';
      END IF;

      IF coalesce(v_response->>'response_label','') <> coalesce(v_indicator_cells->>v_code,'')
         OR v_response->'raw_value'->>'source_indicator_code' IS DISTINCT FROM v_code
         OR v_response->'raw_value'->>'source_value' IS DISTINCT FROM v_indicator_cells->>v_code
         OR v_response->'raw_value'->>'mapping_status' <> 'source_label_pending_review'
         OR coalesce(v_response->>'review_status','') <> 'pending'
         OR v_response->'raw_value'->'review_required' IS DISTINCT FROM 'true'::jsonb
         OR v_response->'raw_value'->'numerator' IS DISTINCT FROM 'null'::jsonb
         OR coalesce(v_response->'raw_value'->>'denominator','') <> 'true' THEN
        RAISE EXCEPTION 'Respons sumber indikator % harus dipertahankan verbatim dan tetap pending review (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF nullif(v_response->>'response_code','') IS NOT NULL
         AND (v_response->>'response_code')::smallint NOT BETWEEN 1 AND 3 THEN
        RAISE EXCEPTION 'Kode respons indikator % harus 1, 2, 3, atau kosong (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      IF v_response->'raw_value'->'source_code' IS DISTINCT FROM v_response->'response_code' THEN
        RAISE EXCEPTION 'Kode sumber dan kode respons indikator % tidak konsisten (baris Excel %).', v_code, v_source_row USING ERRCODE = '22023';
      END IF;

      v_seen_codes := array_append(v_seen_codes, v_code);
      v_seen_ids := array_append(v_seen_ids, v_indicator_id);
    END LOOP;

    IF cardinality(v_seen_codes) <> v_expected_responses THEN
      RAISE EXCEPTION 'Respons indikator unik tidak konsisten dengan sel sumber pada baris Excel %.', v_source_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Idempotency is tied to the physical source row, not to patient identity.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_payload := v_row->'payload';
    v_subject_key := v_payload->>'subject_key';

    IF EXISTS (
      SELECT 1 FROM aureka_quality.quality_records qr
      WHERE qr.room_id = 6
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
        RAISE EXCEPTION 'Server tidak mengembalikan identitas episode IGD.' USING ERRCODE = '22023';
      END IF;
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1 FROM aureka_quality.quality_records qr
        WHERE qr.room_id = 6
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

REVOKE ALL ON FUNCTION aureka_quality.import_igd_logbook_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_igd_logbook_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_igd_logbook_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_igd_logbook_batch(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.import_igd_consultation_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb;
  v_source_workbook text;
  v_source_sheet text;
  v_source_excel_row integer;
  v_consultation_month smallint;
  v_patient_name text;
  v_medical_record_no text;
  v_registered_at timestamptz;
  v_consultation_at timestamptz;
  v_duration numeric;
  v_source_duration numeric;
  v_quality_record_id uuid;
  v_link_status text;
  v_candidate_rows jsonb;
  v_match_delta numeric;
  v_match_count integer;
  v_review_flags jsonb;
  v_record_id uuid;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_matched integer := 0;
  v_ambiguous integer := 0;
  v_unmatched integer := 0;
  v_inserted boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor bukti konsultasi DPJP IGD.' USING ERRCODE = '28000';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Impor bukti konsultasi IGD hanya diizinkan bagi Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;

  IF NOT aureka_system.has_quality_room_access(6) THEN
    RAISE EXCEPTION 'Akses ke bukti konsultasi Instalasi Gawat Darurat tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Batch konsultasi IGD harus berupa array yang valid.' USING ERRCODE = '22023';
  END IF;

  v_received := jsonb_array_length(p_rows);
  IF v_received < 1 OR v_received > 100 THEN
    RAISE EXCEPTION 'Batch konsultasi IGD harus berisi 1 sampai 100 baris.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT (
      x.item->>'source_workbook' || '|' ||
      x.item->>'source_sheet' || '|' ||
      x.item->>'source_excel_row'
    ))
    FROM jsonb_array_elements(p_rows) AS x(item)
  ) <> v_received THEN
    RAISE EXCEPTION 'Batch konsultasi mengandung identitas sumber kosong atau duplikat.' USING ERRCODE = '22023';
  END IF;

  -- Validate all rows before the first insert.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF coalesce(jsonb_typeof(v_row),'') <> 'object'
       OR coalesce(v_row->>'source_workbook','') = ''
       OR coalesce(v_row->>'source_sheet','') = ''
       OR v_row->>'source_sheet' ~* 'rang?kuman|rekap|summary'
       OR coalesce(v_row->>'source_excel_row','') !~ '^[0-9]+$'
       OR coalesce(v_row->>'consultation_month','') !~ '^[0-9]{1,2}$'
       OR coalesce(jsonb_typeof(v_row->'source_json'),'') <> 'object'
       OR coalesce(jsonb_typeof(v_row->'review_flags'),'') <> 'array'
       OR coalesce(jsonb_typeof(v_row->'candidate_source_rows'),'') <> 'array' THEN
      RAISE EXCEPTION 'Struktur/provenance sumber konsultasi DPJP tidak valid.' USING ERRCODE = '22023';
    END IF;

    v_source_excel_row := (v_row->>'source_excel_row')::integer;
    v_consultation_month := (v_row->>'consultation_month')::smallint;
    v_patient_name := coalesce(v_row->>'patient_name','');
    v_medical_record_no := btrim(coalesce(v_row->>'medical_record_no',''));

    IF v_source_excel_row < 31 OR v_source_excel_row > 2500
       OR v_consultation_month NOT BETWEEN 1 AND 12
       OR v_patient_name = ''
       OR v_medical_record_no = '' THEN
      RAISE EXCEPTION 'Baris konsultasi harus memiliki identitas pasien, RM, baris Excel, dan bulan yang valid.' USING ERRCODE = '22023';
    END IF;

    v_registered_at := null;
    v_consultation_at := null;
    BEGIN
      IF nullif(v_row->>'registered_at','') IS NOT NULL THEN
        v_registered_at := (v_row->>'registered_at')::timestamptz;
      END IF;
      IF nullif(v_row->>'consultation_at','') IS NOT NULL THEN
        v_consultation_at := (v_row->>'consultation_at')::timestamptz;
      END IF;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION 'Waktu registrasi/konsultasi tidak valid pada file %, sheet %, baris %.',
        v_row->>'source_workbook', v_row->>'source_sheet', v_source_excel_row USING ERRCODE = '22007';
    END;

    IF v_consultation_at IS NOT NULL
       AND (
         extract(year FROM v_consultation_at AT TIME ZONE 'Asia/Pontianak') <> 2026
         OR extract(month FROM v_consultation_at AT TIME ZONE 'Asia/Pontianak') <> v_consultation_month
       ) THEN
      RAISE EXCEPTION 'Bulan sumber harus mengikuti Waktu Konsultasi DPJP pada profil 2026 (file %, sheet %, baris %).',
        v_row->>'source_workbook', v_row->>'source_sheet', v_source_excel_row USING ERRCODE = '22023';
    END IF;

    IF nullif(v_row->>'door_to_decision_code','') IS NOT NULL
       AND (v_row->>'door_to_decision_code')::smallint NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'Kode Door-to-Decision harus 1, 2, 3, atau kosong.' USING ERRCODE = '22023';
    END IF;

    IF nullif(v_row->>'dpjp_response_code','') IS NOT NULL
       AND (v_row->>'dpjp_response_code')::smallint NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'Kode alasan DPJP harus 1, 2, 3, atau kosong.' USING ERRCODE = '22023';
    END IF;

    IF nullif(v_row->>'source_duration_minutes','') IS NOT NULL
       AND (v_row->>'source_duration_minutes')::numeric < 0 THEN
      RAISE EXCEPTION 'Durasi sumber tidak boleh negatif.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_source_workbook := v_row->>'source_workbook';
    v_source_sheet := v_row->>'source_sheet';
    v_source_excel_row := (v_row->>'source_excel_row')::integer;
    v_consultation_month := (v_row->>'consultation_month')::smallint;
    v_patient_name := coalesce(v_row->>'patient_name','');
    v_medical_record_no := btrim(coalesce(v_row->>'medical_record_no',''));
    v_registered_at := nullif(v_row->>'registered_at','')::timestamptz;
    v_consultation_at := nullif(v_row->>'consultation_at','')::timestamptz;
    v_source_duration := nullif(v_row->>'source_duration_minutes','')::numeric;
    v_duration := NULL;
    v_quality_record_id := NULL;
    v_link_status := 'unmatched';
    v_candidate_rows := coalesce(v_row->'candidate_source_rows','[]'::jsonb);
    v_match_delta := null;
    v_match_count := 0;

    IF v_registered_at IS NOT NULL AND v_consultation_at IS NOT NULL THEN
      v_duration := extract(epoch FROM (v_consultation_at - v_registered_at)) / 60.0;
      IF v_duration < 0 THEN
        v_duration := NULL;
      END IF;
    END IF;

    -- Reconcile on the server using exact MRN + registration timestamp within 60 seconds.
    -- Multiple matching episode rows are intentionally left unlinked as ambiguous.
    IF v_registered_at IS NOT NULL AND v_medical_record_no <> '' THEN
      SELECT count(*)
      INTO v_match_count
      FROM aureka_quality.quality_records qr
      WHERE qr.room_id = 6
        AND qr.profile_year = 2026
        AND qr.measurement_grain = 'patient_episode'
        AND qr.status <> 'archived'
        AND qr.subject_key LIKE 'excel-pmkp-igd-2026:row:%'
        AND qr.core_data->>'medical_record_no' = v_medical_record_no
        AND qr.core_data ? 'admission_at'
        AND ((qr.core_data->>'admission_at')::timestamptz AT TIME ZONE 'Asia/Pontianak')::date =
            (v_registered_at AT TIME ZONE 'Asia/Pontianak')::date
        AND abs(extract(epoch FROM (
          (qr.core_data->>'admission_at')::timestamptz - v_registered_at
        ))) <= 60;

      IF v_match_count = 1 THEN
        SELECT qr.id,
               abs(extract(epoch FROM ((qr.core_data->>'admission_at')::timestamptz - v_registered_at)))
        INTO v_quality_record_id, v_match_delta
        FROM aureka_quality.quality_records qr
        WHERE qr.room_id = 6
          AND qr.profile_year = 2026
          AND qr.measurement_grain = 'patient_episode'
          AND qr.status <> 'archived'
          AND qr.subject_key LIKE 'excel-pmkp-igd-2026:row:%'
          AND qr.core_data->>'medical_record_no' = v_medical_record_no
          AND ((qr.core_data->>'admission_at')::timestamptz AT TIME ZONE 'Asia/Pontianak')::date =
              (v_registered_at AT TIME ZONE 'Asia/Pontianak')::date
          AND abs(extract(epoch FROM (
            (qr.core_data->>'admission_at')::timestamptz - v_registered_at
          ))) <= 60
        LIMIT 1;
        v_link_status := 'matched';
      ELSIF v_match_count > 1 THEN
        v_link_status := 'ambiguous';
      END IF;
    END IF;

    v_review_flags := coalesce(v_row->'review_flags','[]'::jsonb);
    IF v_registered_at IS NULL AND NOT (v_review_flags ? 'missing_registration_time') THEN
      v_review_flags := v_review_flags || jsonb_build_array('missing_registration_time');
    END IF;
    IF v_consultation_at IS NULL AND NOT (v_review_flags ? 'missing_consultation_time') THEN
      v_review_flags := v_review_flags || jsonb_build_array('missing_consultation_time');
    END IF;
    IF v_registered_at IS NOT NULL AND v_consultation_at IS NOT NULL AND v_duration IS NULL
       AND NOT (v_review_flags ? 'negative_registration_to_consultation') THEN
      v_review_flags := v_review_flags || jsonb_build_array('negative_registration_to_consultation');
    END IF;
    IF v_match_count = 0 AND NOT (v_review_flags ? 'episode_match_not_found') THEN
      v_review_flags := v_review_flags || jsonb_build_array('episode_match_not_found');
    END IF;
    IF v_match_count > 1 AND NOT (v_review_flags ? 'episode_match_ambiguous') THEN
      v_review_flags := v_review_flags || jsonb_build_array('episode_match_ambiguous');
    END IF;
    IF v_source_duration IS NOT NULL AND v_duration IS NOT NULL
       AND abs(v_source_duration - v_duration) > 1
       AND NOT (v_review_flags ? 'source_formula_duration_mismatch') THEN
      v_review_flags := v_review_flags || jsonb_build_array('source_formula_duration_mismatch');
    END IF;

    v_record_id := NULL;
    INSERT INTO aureka_quality.ed_consultation_audits (
      room_id, profile_year, source_workbook, source_sheet, source_excel_row,
      source_no, consultation_month, patient_name, medical_record_no, age,
      sex, patient_type, ed_doctor, specialist_doctor, nurse,
      registered_at, consultation_at, registration_to_consultation_minutes,
      source_duration_minutes, door_to_decision_label, door_to_decision_code,
      quality_attainment, dpjp_response_reason, dpjp_response_code, other_reason,
      quality_record_id, link_status, candidate_source_rows, match_delta_seconds,
      review_flags, review_status, source_json, created_by
    )
    VALUES (
      6,
      2026,
      v_source_workbook,
      v_source_sheet,
      v_source_excel_row,
      coalesce(v_row->>'source_no',''),
      v_consultation_month,
      v_patient_name,
      v_medical_record_no,
      coalesce(v_row->>'age',''),
      coalesce(v_row->>'sex',''),
      coalesce(v_row->>'patient_type',''),
      coalesce(v_row->>'ed_doctor',''),
      coalesce(v_row->>'specialist_doctor',''),
      coalesce(v_row->>'nurse',''),
      v_registered_at,
      v_consultation_at,
      v_duration,
      v_source_duration,
      coalesce(v_row->>'door_to_decision_label',''),
      nullif(v_row->>'door_to_decision_code','')::smallint,
      coalesce(v_row->>'quality_attainment',''),
      coalesce(v_row->>'dpjp_response_reason',''),
      nullif(v_row->>'dpjp_response_code','')::smallint,
      coalesce(v_row->>'other_reason',''),
      v_quality_record_id,
      v_link_status,
      v_candidate_rows,
      v_match_delta,
      v_review_flags,
      'pending',
      coalesce(v_row->'source_json','{}'::jsonb),
      v_user_id
    )
    ON CONFLICT ON CONSTRAINT uq_ed_consultation_audits_source DO NOTHING
    RETURNING id INTO v_record_id;

    v_inserted := v_record_id IS NOT NULL;
    IF v_inserted THEN
      v_imported := v_imported + 1;
      IF v_link_status = 'matched' THEN v_matched := v_matched + 1;
      ELSIF v_link_status = 'ambiguous' THEN v_ambiguous := v_ambiguous + 1;
      ELSE v_unmatched := v_unmatched + 1;
      END IF;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'received_count', v_received,
    'imported_count', v_imported,
    'skipped_existing_count', v_skipped,
    'matched_count', v_matched,
    'ambiguous_count', v_ambiguous,
    'unmatched_count', v_unmatched
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_igd_consultation_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION aureka_quality.import_igd_consultation_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION aureka_quality.import_igd_consultation_batch(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.import_igd_consultation_batch(jsonb) TO authenticated;

COMMENT ON TABLE aureka_quality.ed_consultation_audits IS
'Source-level ED on-call consultation audit samples. Separate from the all-visit episode denominator. Registration-to-consultation duration is not an authoritative DPJP response-time metric because consultation-request timestamp is unavailable.';

COMMENT ON FUNCTION aureka_quality.import_igd_logbook_batch(jsonb) IS
'Imports ED 2026 patient episodes from the main PMKP Logbook. Physical Excel rows are idempotency keys; only explicitly filled source indicator cells create response records, all pending review.';

COMMENT ON FUNCTION aureka_quality.import_igd_consultation_batch(jsonb) IS
'Imports ED DPJP sample cases into a separate RLS-protected audit table and links only unique exact-MRN/timestamp matches to imported ED episodes. Does not write indicator 6.2 or 6.3 responses.';
