
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
  IF p_room_id IS NULL OR p_room_id <= 0 OR p_report_year NOT BETWEEN 2020 AND 2100 OR p_report_month NOT BETWEEN 1 AND 12 THEN
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

  -- Audit Klinis/Kematian memakai review_period = YYYY untuk keunikan tahunan.
  -- Pengelompokan laporan bulanan mengikuti tanggal episode pada snapshot, bukan review_period.
  SELECT count(*)::integer INTO v_death_count
  FROM aureka_quality.clinical_death_audits
  WHERE room_id=p_room_id
    AND status IN ('submitted','validated')
    AND coalesce(
      nullif(episode_snapshot->>'discharge_date',''),
      nullif(episode_snapshot->>'admission_date','')
    ) ~ '^\d{4}-\d{2}-\d{2}$'
    AND coalesce(
      nullif(episode_snapshot->>'discharge_date',''),
      nullif(episode_snapshot->>'admission_date','')
    )::date >= v_period_start
    AND coalesce(
      nullif(episode_snapshot->>'discharge_date',''),
      nullif(episode_snapshot->>'admission_date','')
    )::date < v_period_end;

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

DROP POLICY IF EXISTS cp_audits_shared_room_update ON aureka_quality.clinical_pathway_audits;
CREATE POLICY cp_audits_shared_room_update
  ON aureka_quality.clinical_pathway_audits
  FOR UPDATE TO authenticated
  USING (
    aureka_system.has_quality_room_access(room_id)
    AND (
      created_by = auth.uid()
      OR aureka_system.current_role_code() IN ('ADMIN','PMKP')
    )
  )
  WITH CHECK (
    aureka_system.has_quality_room_access(room_id)
    AND (
      created_by = auth.uid()
      OR aureka_system.current_role_code() IN ('ADMIN','PMKP')
    )
  );
