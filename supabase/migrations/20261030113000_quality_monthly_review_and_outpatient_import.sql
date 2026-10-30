-- AUREKA: Rawat Jalan matrix import and one-click monthly validator review.
-- The workbook import stores each populated doctor/date cell as one provider_day row.

CREATE UNIQUE INDEX IF NOT EXISTS uq_quality_outpatient_provider_day_subject
  ON aureka_quality.quality_records (profile_year, subject_key)
  WHERE room_id = 11
    AND measurement_grain = 'provider_day'
    AND subject_key IS NOT NULL
    AND status <> 'archived';

CREATE TABLE IF NOT EXISTS aureka_quality.quality_monthly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  profile_year integer NOT NULL,
  report_month smallint NOT NULL CHECK (report_month BETWEEN 1 AND 12),
  reviewed_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reports_count integer NOT NULL DEFAULT 0 CHECK (reports_count >= 0),
  last_report_updated_at timestamptz,
  deadline_date date NOT NULL,
  reviewed_on_time boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_quality_monthly_review UNIQUE (room_id, profile_year, report_month)
);

CREATE INDEX IF NOT EXISTS ix_quality_monthly_reviews_year
  ON aureka_quality.quality_monthly_reviews (room_id, profile_year, report_month);

ALTER TABLE aureka_quality.quality_monthly_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_monthly_reviews_select_room
  ON aureka_quality.quality_monthly_reviews;
CREATE POLICY quality_monthly_reviews_select_room
  ON aureka_quality.quality_monthly_reviews
  FOR SELECT TO authenticated
  USING (aureka_system.has_quality_room_access(room_id));

GRANT SELECT ON aureka_quality.quality_monthly_reviews TO authenticated;

-- Legacy per-record validation is retained in audit_log, while records become
-- editable final reports under the new monthly review model.
UPDATE aureka_quality.quality_records
   SET status = 'ready',
       review_required = false,
       updated_at = now()
 WHERE status IN ('validated', 'reopened');

CREATE OR REPLACE FUNCTION aureka_quality.import_outpatient_logbook_excel(
  p_profile_year integer,
  p_source_workbook text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_row jsonb;
  v_date date;
  v_clinic text;
  v_doctor text;
  v_minutes numeric;
  v_subject_key text;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_affected integer := 0;
  v_received integer := 0;
  v_source_row integer;
  v_source_column integer;
  v_form_fields jsonb;
  v_core_data jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengimpor workbook Rawat Jalan.' USING ERRCODE = '28000';
  END IF;
  IF v_role NOT IN ('ADMIN', 'PMKP', 'PIC') THEN
    RAISE EXCEPTION 'Role akun tidak diizinkan mengimpor logbook Rawat Jalan.' USING ERRCODE = '42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(11) THEN
    RAISE EXCEPTION 'Akses ke Instalasi Rawat Jalan tidak tersedia.' USING ERRCODE = '42501';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100 THEN
    RAISE EXCEPTION 'Tahun profil tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(trim(p_source_workbook), '') = '' THEN
    RAISE EXCEPTION 'Nama workbook sumber wajib dicantumkan.' USING ERRCODE = '22023';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Daftar observasi workbook kosong atau tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Satu batch impor maksimal 500 observasi.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_received := v_received + 1;

    IF coalesce(v_row->>'record_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Tanggal observasi harus menggunakan format YYYY-MM-DD.' USING ERRCODE = '22023';
    END IF;
    v_date := (v_row->>'record_date')::date;
    IF extract(year FROM v_date)::integer <> p_profile_year THEN
      RAISE EXCEPTION 'Tahun tanggal observasi tidak sesuai dengan tahun profil.' USING ERRCODE = '22023';
    END IF;

    v_clinic := nullif(trim(coalesce(v_row->>'clinic', '')), '');
    v_doctor := nullif(trim(coalesce(v_row->>'doctor', '')), '');
    IF v_clinic IS NULL OR v_doctor IS NULL THEN
      RAISE EXCEPTION 'Nama klinik dan dokter wajib diisi pada setiap observasi.' USING ERRCODE = '22023';
    END IF;

    IF coalesce(v_row->>'waiting_minutes', '') !~ '^\d+(?:[.,]\d+)?$' THEN
      RAISE EXCEPTION 'Waktu tunggu harus berupa angka nol atau lebih.' USING ERRCODE = '22023';
    END IF;
    v_minutes := replace(v_row->>'waiting_minutes', ',', '.')::numeric;
    IF v_minutes < 0 THEN
      RAISE EXCEPTION 'Waktu tunggu tidak boleh negatif.' USING ERRCODE = '22023';
    END IF;

    v_source_row := CASE WHEN coalesce(v_row->>'source_row', '') ~ '^\d+$'
                         THEN (v_row->>'source_row')::integer ELSE NULL END;
    v_source_column := CASE WHEN coalesce(v_row->>'source_column', '') ~ '^\d+$'
                            THEN (v_row->>'source_column')::integer ELSE NULL END;

    v_subject_key := '11:' || v_date::text || ':' || v_clinic || ':' || v_doctor;
    v_form_fields := jsonb_build_object(
      'Tanggal pengamatan', v_date::text,
      'Klinik', v_clinic,
      'Dokter', v_doctor,
      'Waktu Tunggu Rawat Jalan (Menit)', v_minutes
    );
    v_core_data := jsonb_build_object(
      'patient_name', '',
      'admission_at', v_date::text,
      'unit_name', 'Instalasi Rawat Jalan',
      'room_id', 11,
      'status', 'Dilaporkan',
      'workflow_status', 'Dilaporkan',
      'form_fields', v_form_fields,
      'calculated_fields', '{}'::jsonb,
      'indicator_values', '{}'::jsonb,
      'measurement_grain', 'provider_day',
      'source_import', jsonb_build_object(
        'source_workbook', p_source_workbook,
        'source_sheet', 'Logbook',
        'source_row', v_source_row,
        'source_column', v_source_column,
        'imported_at', now()
      )
    );

    INSERT INTO aureka_quality.quality_records (
      room_id, profile_year, measurement_grain, record_date, subject_key,
      subject_json, core_data, status, review_required, entered_by
    )
    VALUES (
      11, p_profile_year, 'provider_day', v_date, v_subject_key,
      jsonb_build_object('clinic', v_clinic, 'doctor', v_doctor),
      v_core_data, 'ready', false, v_user_id
    )
    ON CONFLICT (profile_year, subject_key)
      WHERE room_id = 11
        AND measurement_grain = 'provider_day'
        AND subject_key IS NOT NULL
        AND status <> 'archived'
    DO NOTHING;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 1 THEN
      v_imported := v_imported + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'received_count', v_received,
    'imported_count', v_imported,
    'skipped_existing_count', v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.import_outpatient_logbook_excel(integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.import_outpatient_logbook_excel(integer, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.invalidate_monthly_review_on_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'aureka_quality'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.record_date IS NOT NULL THEN
      DELETE FROM aureka_quality.quality_monthly_reviews
       WHERE room_id = OLD.room_id
         AND profile_year = OLD.profile_year
         AND report_month = extract(month FROM OLD.record_date)::smallint;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.record_date IS NOT NULL THEN
      DELETE FROM aureka_quality.quality_monthly_reviews
       WHERE room_id = NEW.room_id
         AND profile_year = NEW.profile_year
         AND report_month = extract(month FROM NEW.record_date)::smallint;
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.invalidate_monthly_review_on_record_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_quality_monthly_review_invalidation
  ON aureka_quality.quality_records;
CREATE TRIGGER trg_quality_monthly_review_invalidation
AFTER INSERT OR UPDATE OR DELETE ON aureka_quality.quality_records
FOR EACH ROW
EXECUTE FUNCTION aureka_quality.invalidate_monthly_review_on_record_change();

CREATE OR REPLACE FUNCTION public.aureka_validator_mark_month_reviewed(
  p_room_id bigint,
  p_profile_year integer,
  p_report_month integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'aureka_quality', 'aureka_system', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_period_start date;
  v_period_end date;
  v_deadline date;
  v_today date := (now() AT TIME ZONE 'Asia/Pontianak')::date;
  v_reports_count integer := 0;
  v_self_count integer := 0;
  v_last_update timestamptz;
  v_inserted integer := 0;
  v_review aureka_quality.quality_monthly_reviews%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk validasi bulanan.' USING ERRCODE = '28000';
  END IF;
  IF v_role NOT IN ('VALIDATOR', 'ADMIN', 'PMKP') THEN
    RAISE EXCEPTION 'Akses ditolak: role Validator diperlukan.' USING ERRCODE = '42501';
  END IF;
  IF p_room_id IS NULL OR p_profile_year IS NULL OR p_report_month IS NULL
     OR p_report_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Unit dan bulan laporan harus dipilih dengan benar.' USING ERRCODE = '22023';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses validasi untuk unit ini tidak tersedia.' USING ERRCODE = '42501';
  END IF;

  v_period_start := make_date(p_profile_year, p_report_month, 1);
  v_period_end := (v_period_start + interval '1 month')::date;
  v_deadline := v_period_end + 9;

  IF v_period_start >= date_trunc('month', v_today::timestamp)::date THEN
    RAISE EXCEPTION 'Validasi bulanan hanya untuk laporan bulan yang telah berakhir.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer, max(updated_at),
         count(*) FILTER (WHERE entered_by = v_user_id)::integer
    INTO v_reports_count, v_last_update, v_self_count
    FROM aureka_quality.quality_records
   WHERE room_id = p_room_id
     AND profile_year = p_profile_year
     AND record_date >= v_period_start
     AND record_date < v_period_end
     AND status IN ('ready', 'validated', 'reopened');

  IF v_role = 'VALIDATOR' AND v_self_count > 0 THEN
    RAISE EXCEPTION 'Validator tidak dapat memvalidasi laporan yang diinput oleh akunnya sendiri.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO aureka_quality.quality_monthly_reviews (
    room_id, profile_year, report_month, reviewed_by, reports_count,
    last_report_updated_at, deadline_date, reviewed_on_time
  )
  VALUES (
    p_room_id, p_profile_year, p_report_month, v_user_id, v_reports_count,
    v_last_update, v_deadline, v_today <= v_deadline
  )
  ON CONFLICT (room_id, profile_year, report_month) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT * INTO v_review
    FROM aureka_quality.quality_monthly_reviews
   WHERE room_id = p_room_id
     AND profile_year = p_profile_year
     AND report_month = p_report_month;

  IF v_inserted = 1 THEN
    INSERT INTO aureka_quality.audit_log(actor_id, action, table_name, record_id, before_json, after_json, created_at)
    VALUES (
      v_user_id,
      'MONTHLY_LOGBOOK_VALIDATED',
      'quality_monthly_reviews',
      v_review.id,
      NULL,
      jsonb_build_object(
        'room_id', p_room_id,
        'profile_year', p_profile_year,
        'report_month', p_report_month,
        'reports_count', v_reports_count,
        'deadline_date', v_deadline,
        'reviewed_on_time', v_today <= v_deadline
      ),
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_review.id,
    'room_id', v_review.room_id,
    'profile_year', v_review.profile_year,
    'report_month', v_review.report_month,
    'reviewed_at', v_review.reviewed_at,
    'reviewed_by', v_review.reviewed_by,
    'reports_count', v_review.reports_count,
    'deadline_date', v_review.deadline_date,
    'reviewed_on_time', v_review.reviewed_on_time
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.aureka_validator_mark_month_reviewed(bigint, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aureka_validator_mark_month_reviewed(bigint, integer, integer) TO authenticated;
