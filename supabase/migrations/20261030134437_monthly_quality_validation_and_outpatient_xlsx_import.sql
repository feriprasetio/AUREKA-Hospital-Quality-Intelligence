
CREATE TABLE IF NOT EXISTS aureka_quality.monthly_report_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id) ON DELETE RESTRICT,
  report_year integer NOT NULL CHECK (report_year BETWEEN 2020 AND 2100),
  report_month smallint NOT NULL CHECK (report_month BETWEEN 1 AND 12),
  quality_record_count integer NOT NULL DEFAULT 0 CHECK (quality_record_count >= 0),
  clinical_pathway_count integer NOT NULL DEFAULT 0 CHECK (clinical_pathway_count >= 0),
  clinical_death_count integer NOT NULL DEFAULT 0 CHECK (clinical_death_count >= 0),
  total_record_count integer NOT NULL DEFAULT 0 CHECK (total_record_count >= 0),
  deadline_date date NOT NULL,
  validated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  validated_at timestamptz NOT NULL DEFAULT now(),
  validated_on_time boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, report_year, report_month)
);

ALTER TABLE aureka_quality.monthly_report_validations ENABLE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='aureka_quality'
      AND tablename='monthly_report_validations'
      AND policyname='monthly_report_validations_room_select'
  ) THEN
    CREATE POLICY monthly_report_validations_room_select
      ON aureka_quality.monthly_report_validations
      FOR SELECT TO authenticated
      USING (aureka_system.has_quality_room_access(room_id));
  END IF;
END
$policy$;

REVOKE ALL ON TABLE aureka_quality.monthly_report_validations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE aureka_quality.monthly_report_validations TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_records_outpatient_subject
  ON aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  WHERE room_id = 11
    AND measurement_grain = 'provider_day'
    AND subject_key IS NOT NULL
    AND status <> 'archived';

CREATE OR REPLACE FUNCTION aureka_quality.import_outpatient_logbook_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_item jsonb;
  v_payload jsonb;
  v_core jsonb;
  v_form jsonb;
  v_date date;
  v_year integer;
  v_clinic text;
  v_doctor text;
  v_minutes numeric;
  v_subject_key text;
  v_saved_id uuid;
  v_received integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Rawat Jalan.' USING ERRCODE = '28000';
  END IF;
  IF v_role NOT IN ('ADMIN', 'PMKP', 'PIC') THEN
    RAISE EXCEPTION 'Role akun tidak diizinkan mengimpor logbook Rawat Jalan.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'Setiap batch impor harus berisi 1 sampai 100 baris.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_received := v_received + 1;
    v_payload := v_item->'payload';
    IF jsonb_typeof(v_payload) <> 'object' OR (v_payload->>'room_id')::bigint <> 11 THEN
      RAISE EXCEPTION 'Workbook hanya boleh mengisi unit Instalasi Rawat Jalan (room 11).' USING ERRCODE = '22023';
    END IF;
    IF NOT aureka_system.has_quality_room_access(11) THEN
      RAISE EXCEPTION 'Akses ke unit Instalasi Rawat Jalan tidak tersedia.' USING ERRCODE = '42501';
    END IF;
    IF (v_payload->>'measurement_grain') <> 'provider_day'
       OR (v_payload->>'status') <> 'ready'
       OR coalesce((v_payload->>'review_required')::boolean, true) THEN
      RAISE EXCEPTION 'Struktur dan status baris impor tidak sesuai dengan logbook dokter-hari.' USING ERRCODE = '22023';
    END IF;

    v_year := (v_payload->>'profile_year')::integer;
    IF v_year NOT BETWEEN 2020 AND 2100
       OR coalesce(v_payload->>'record_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Tahun profil atau tanggal pengamatan tidak valid.' USING ERRCODE = '22023';
    END IF;
    v_date := (v_payload->>'record_date')::date;
    IF extract(year FROM v_date)::integer <> v_year THEN
      RAISE EXCEPTION 'Tahun tanggal pengamatan harus sama dengan tahun profil.' USING ERRCODE = '22023';
    END IF;

    v_core := coalesce(v_payload->'core_data', '{}'::jsonb);
    v_form := coalesce(v_core->'form_fields', '{}'::jsonb);
    v_clinic := nullif(btrim(v_form->>'Klinik'), '');
    v_doctor := nullif(btrim(v_form->>'Dokter'), '');
    IF v_clinic IS NULL OR v_doctor IS NULL
       OR coalesce(v_form->>'Waktu Tunggu Rawat Jalan (Menit)','') !~ '^\d+(\.\d+)?$' THEN
      RAISE EXCEPTION 'Klinik, dokter, dan waktu tunggu dalam menit wajib diisi dengan format valid.' USING ERRCODE = '22023';
    END IF;
    v_minutes := (v_form->>'Waktu Tunggu Rawat Jalan (Menit)')::numeric;
    IF v_minutes < 0 OR v_minutes > 1440 THEN
      RAISE EXCEPTION 'Waktu tunggu harus antara 0 dan 1.440 menit.' USING ERRCODE = '22023';
    END IF;

    v_subject_key := '11:' || to_char(v_date, 'YYYY-MM-DD') || ':' || v_clinic || ':' || v_doctor;
    IF coalesce(v_payload->>'subject_key','') <> v_subject_key THEN
      RAISE EXCEPTION 'Kunci unik baris impor tidak cocok dengan tanggal, klinik, dan dokter.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM aureka_quality.quality_records qr
      WHERE qr.room_id=11
        AND qr.profile_year=v_year
        AND qr.measurement_grain='provider_day'
        AND qr.subject_key=v_subject_key
        AND qr.status <> 'archived'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_saved_id := aureka_quality.save_quality_logbook(
        NULL,
        v_payload,
        coalesce(v_item->'responses','[]'::jsonb),
        coalesce(v_item->'attributions','[]'::jsonb)
      );
      v_imported := v_imported + 1;
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'received_count', v_received,
    'imported_count', v_imported,
    'skipped_existing_count', v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_outpatient_logbook_batch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.import_outpatient_logbook_batch(jsonb) TO authenticated;
COMMENT ON FUNCTION aureka_quality.import_outpatient_logbook_batch(jsonb) IS 'Validates and imports bounded batches of outpatient provider-day waiting-time rows using the secure atomic quality logbook saver.';

CREATE OR REPLACE FUNCTION aureka_quality.validate_quality_monthly_report(
  p_room_id bigint,
  p_report_year integer,
  p_report_month integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_today date := (now() AT TIME ZONE 'Asia/Pontianak')::date;
  v_period_start date;
  v_period_end date;
  v_deadline date;
  v_quality_count integer := 0;
  v_pathway_count integer := 0;
  v_death_count integer := 0;
  v_total integer := 0;
  v_row aureka_quality.monthly_report_validations%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengesahkan pemeriksaan laporan bulanan.' USING ERRCODE = '28000';
  END IF;
  IF v_role <> 'VALIDATOR' THEN
    RAISE EXCEPTION 'Pemeriksaan laporan bulanan hanya dapat dilakukan oleh akun Validator.' USING ERRCODE = '42501';
  END IF;
  IF p_room_id IS NULL OR p_room_id <= 0 OR p_report_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Unit atau periode laporan tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Validator tidak memiliki akses ke unit laporan ini.' USING ERRCODE = '42501';
  END IF;

  v_period_start := make_date(p_report_year, p_report_month, 1);
  IF v_period_start <> (date_trunc('month', v_today)::date - interval '1 month')::date THEN
    RAISE EXCEPTION 'Validasi hanya dapat dilakukan untuk laporan bulan kalender sebelumnya.' USING ERRCODE = '22023';
  END IF;
  v_period_end := (v_period_start + interval '1 month')::date;
  v_deadline := (v_period_start + interval '1 month' + interval '9 days')::date;

  SELECT count(*)::integer INTO v_quality_count
  FROM aureka_quality.quality_records
  WHERE room_id=p_room_id
    AND record_date >= v_period_start
    AND record_date < v_period_end
    AND status IN ('ready','validated','reopened');

  SELECT count(*)::integer INTO v_pathway_count
  FROM aureka_quality.clinical_pathway_audits
  WHERE room_id=p_room_id
    AND admission_date >= v_period_start
    AND admission_date < v_period_end
    AND status IN ('submitted','validated');

  SELECT count(*)::integer INTO v_death_count
  FROM aureka_quality.clinical_death_audits
  WHERE room_id=p_room_id
    AND review_period=to_char(v_period_start,'YYYY-MM')
    AND status IN ('submitted','validated');

  v_total := v_quality_count + v_pathway_count + v_death_count;

  INSERT INTO aureka_quality.monthly_report_validations (
    room_id, report_year, report_month,
    quality_record_count, clinical_pathway_count, clinical_death_count,
    total_record_count, deadline_date, validated_by, validated_at, validated_on_time
  ) VALUES (
    p_room_id, p_report_year, p_report_month,
    v_quality_count, v_pathway_count, v_death_count,
    v_total, v_deadline, v_user_id, now(), v_today <= v_deadline
  )
  ON CONFLICT (room_id, report_year, report_month) DO NOTHING
  RETURNING * INTO v_row;

  v_inserted := FOUND;
  IF NOT v_inserted THEN
    SELECT * INTO v_row
    FROM aureka_quality.monthly_report_validations
    WHERE room_id=p_room_id AND report_year=p_report_year AND report_month=p_report_month;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'room_id', v_row.room_id,
    'report_year', v_row.report_year,
    'report_month', v_row.report_month,
    'quality_record_count', v_row.quality_record_count,
    'clinical_pathway_count', v_row.clinical_pathway_count,
    'clinical_death_count', v_row.clinical_death_count,
    'total_record_count', v_row.total_record_count,
    'deadline_date', v_row.deadline_date,
    'validated_by', v_row.validated_by,
    'validated_at', v_row.validated_at,
    'validated_on_time', v_row.validated_on_time,
    'already_validated', NOT v_inserted
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.validate_quality_monthly_report(bigint, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.validate_quality_monthly_report(bigint, integer, integer) TO authenticated;
COMMENT ON FUNCTION aureka_quality.validate_quality_monthly_report(bigint, integer, integer) IS 'Creates one append-once validation acknowledgment per unit and previous calendar month; records whether the validator completed it by the 10th of the following month.';

DO $upgrade$
DECLARE
  v_definition text;
  v_old text := 'AND status IN (''draft'', ''ready'', ''reopened'')';
  v_new text := 'AND status IN (''draft'', ''ready'', ''reopened'', ''validated'')';
  v_old_validation text := 'validation_note = NULL,' || chr(10) || '           updated_at = now()';
  v_new_validation text := 'validation_note = NULL,' || chr(10) || '           validated_by = NULL,' || chr(10) || '           validated_at = NULL,' || chr(10) || '           updated_at = now()';
BEGIN
  v_definition := pg_get_functiondef('aureka_quality.save_quality_logbook(uuid,jsonb,jsonb,jsonb)'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    IF position(v_new IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Pola pembaruan save_quality_logbook berubah; migrasi edit-laporan dihentikan untuk mencegah penggantian fungsi yang salah.';
    END IF;
  ELSE
    v_definition := replace(v_definition, v_old, v_new);
  END IF;
  IF position(v_old_validation IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old_validation, v_new_validation);
  END IF;
  EXECUTE v_definition;
END;
$upgrade$;
