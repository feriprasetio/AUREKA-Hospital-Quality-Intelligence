BEGIN;

ALTER TABLE aureka_quality.spm_indicators
  DROP CONSTRAINT IF EXISTS spm_indicators_profile_year_check;
ALTER TABLE aureka_quality.spm_indicators
  ADD CONSTRAINT spm_indicators_profile_year_check
  CHECK (profile_year BETWEEN 1900 AND 2200);

ALTER TABLE aureka_quality.spm_monthly_measurements
  DROP CONSTRAINT IF EXISTS spm_monthly_measurements_profile_year_check;
ALTER TABLE aureka_quality.spm_monthly_measurements
  ADD CONSTRAINT spm_monthly_measurements_profile_year_check
  CHECK (profile_year BETWEEN 1900 AND 2200);

DROP POLICY IF EXISTS spm_measurements_insert ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_insert
  ON aureka_quality.spm_monthly_measurements
  FOR INSERT TO authenticated
  WITH CHECK (
    entered_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id = spm_monthly_measurements.indicator_id
        AND i.profile_year = spm_monthly_measurements.profile_year
        AND i.is_active = true
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (
            i.owner_room_id IS NOT NULL
            AND aureka_system.has_quality_room_access(i.owner_room_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS spm_measurements_update ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_update
  ON aureka_quality.spm_monthly_measurements
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id = spm_monthly_measurements.indicator_id
        AND i.profile_year = spm_monthly_measurements.profile_year
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (
            i.owner_room_id IS NOT NULL
            AND aureka_system.has_quality_room_access(i.owner_room_id)
          )
        )
    )
  )
  WITH CHECK (
    updated_by = (SELECT auth.uid())
    AND entered_by IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id = spm_monthly_measurements.indicator_id
        AND i.profile_year = spm_monthly_measurements.profile_year
        AND i.is_active = true
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (
            i.owner_room_id IS NOT NULL
            AND aureka_system.has_quality_room_access(i.owner_room_id)
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION aureka_quality.ensure_spm_profile(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_role text := aureka_system.current_role_code();
  v_expected integer;
  v_inserted integer := 0;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000';
  END IF;

  IF COALESCE(v_role,'') NOT IN (
    'ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR',
    'DEWAN_PENGAWAS','PIC','VALIDATOR'
  ) THEN
    RAISE EXCEPTION 'Akses profil SPM tidak diberikan.' USING ERRCODE='42501';
  END IF;

  IF p_year IS NULL OR p_year NOT BETWEEN 1900 AND 2200 THEN
    RAISE EXCEPTION 'Tahun SPM harus berada pada rentang 1900–2200.' USING ERRCODE='22023';
  END IF;

  SELECT count(*)::integer
  INTO v_expected
  FROM aureka_quality.spm_indicators
  WHERE profile_year = 2026
    AND is_active = true;

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Master dasar SPM tahun 2026 tidak ditemukan.' USING ERRCODE='55000';
  END IF;

  WITH inserted AS (
    INSERT INTO aureka_quality.spm_indicators (
      profile_year, code, group_name, group_order, indicator_order, title,
      target_operator, target_value, target_text, unit_of_measure,
      numerator_definition, denominator_definition, owner_room_id,
      source_mode, source_config, calculation_config, is_active,
      created_by, updated_by
    )
    SELECT
      p_year, code, group_name, group_order, indicator_order, title,
      target_operator, target_value, target_text, unit_of_measure,
      numerator_definition, denominator_definition, owner_room_id,
      source_mode, source_config, calculation_config, is_active,
      auth.uid(), auth.uid()
    FROM aureka_quality.spm_indicators
    WHERE profile_year = 2026
      AND is_active = true
    ON CONFLICT (profile_year, code) DO NOTHING
    RETURNING id
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  SELECT count(*)::integer
  INTO v_total
  FROM aureka_quality.spm_indicators
  WHERE profile_year = p_year
    AND is_active = true;

  IF v_total <> v_expected THEN
    RAISE EXCEPTION
      'Profil SPM tahun % tidak lengkap: % dari % indikator aktif.',
      p_year, v_total, v_expected
      USING ERRCODE='55000';
  END IF;

  RETURN jsonb_build_object(
    'year', p_year,
    'inserted', v_inserted,
    'indicators', v_total,
    'source_year', 2026,
    'ready', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.ensure_spm_profile(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.ensure_spm_profile(integer) TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.spm_quality_source_summary(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_role text := aureka_system.current_role_code();
  v_visite jsonb;
  v_falls jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000';
  END IF;

  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR') THEN
    RAISE EXCEPTION 'Akses ringkasan sumber SPM tidak diberikan.' USING ERRCODE='42501';
  END IF;

  IF p_year IS NULL OR p_year NOT BETWEEN 1900 AND 2200 THEN
    RAISE EXCEPTION 'Tahun pengukuran SPM tidak valid.' USING ERRCODE='22023';
  END IF;

  WITH source_profiles(room_id,indicator_code) AS (
    VALUES
      (14::bigint,'14.4'::text),
      (18::bigint,'18.4'::text),
      (19::bigint,'19.8'::text),
      (20::bigint,'20.8'::text),
      (22::bigint,'22.7'::text),
      (23::bigint,'23.5'::text),
      (24::bigint,'24.8'::text),
      (25::bigint,'25.12'::text),
      (26::bigint,'26.7'::text),
      (27::bigint,'27.9'::text),
      (37::bigint,'37.6'::text)
  ),
  monthly AS (
    SELECT
      EXTRACT(MONTH FROM qr.record_date)::integer AS month,
      COUNT(*)::integer AS denominator,
      COUNT(*) FILTER (
        WHERE response.value->>'code'='1'
          AND response.value->>'answer'='Visite Hari Kerja (06.00-14.00)'
          AND COALESCE(response.value->>'mapping_status','mapped')
            NOT IN ('source_code_conflict','ambiguous_master','not_in_master')
      )::integer AS numerator
    FROM aureka_quality.quality_records qr
    JOIN source_profiles s ON s.room_id=qr.room_id
    CROSS JOIN LATERAL (
      SELECT qr.core_data->'indicator_values'->s.indicator_code AS value
    ) response
    WHERE qr.profile_year=p_year
      AND qr.record_date >= make_date(p_year,1,1)
      AND qr.record_date < make_date(p_year+1,1,1)
      AND qr.status IN ('ready','validated')
      AND qr.measurement_grain='patient_episode'
      AND response.value IS NOT NULL
    GROUP BY EXTRACT(MONTH FROM qr.record_date)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'month',m.month,
      'numerator',COALESCE(x.numerator,0),
      'denominator',COALESCE(x.denominator,0)
    ) ORDER BY m.month
  ),'[]'::jsonb)
  INTO v_visite
  FROM generate_series(1,12) AS m(month)
  LEFT JOIN monthly x ON x.month=m.month;

  WITH monthly AS (
    SELECT
      EXTRACT(MONTH FROM qr.record_date)::integer AS month,
      COUNT(*)::integer AS denominator
    FROM aureka_quality.quality_records qr
    WHERE qr.profile_year=p_year
      AND qr.record_date >= make_date(p_year,1,1)
      AND qr.record_date < make_date(p_year+1,1,1)
      AND qr.room_id = ANY(ARRAY[14,18,19,20,22,23,24,25,26,27,37]::bigint[])
      AND qr.status IN ('ready','validated')
      AND qr.measurement_grain='patient_episode'
    GROUP BY EXTRACT(MONTH FROM qr.record_date)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'month',m.month,
      'denominator',COALESCE(x.denominator,0)
    ) ORDER BY m.month
  ),'[]'::jsonb)
  INTO v_falls
  FROM generate_series(1,12) AS m(month)
  LEFT JOIN monthly x ON x.month=m.month;

  RETURN jsonb_build_object('visite',v_visite,'falls',v_falls);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.spm_quality_source_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.spm_quality_source_summary(integer) TO authenticated;

COMMIT;
