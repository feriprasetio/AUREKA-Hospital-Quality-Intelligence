BEGIN;

-- SPM-019 follows the same 06:00–14:00 definition as the Mutu source profiles.
UPDATE aureka_quality.spm_indicators
SET numerator_definition='Jumlah visite dokter spesialis antara jam 06.00 - 14.00 yang disurvei',
    unit_of_measure='proporsi',
    calculation_config=calculation_config || jsonb_build_object(
      'method','ratio','multiplier',1,'aggregation','weighted_ratio','result_unit','proporsi'
    ),
    updated_at=now()
WHERE profile_year=2026 AND code='SPM-019' AND source_mode='quality_linked';

-- Hospital-wide parent indicators (no owner_room_id) remain visible as aggregate-only SPM records.
DROP POLICY IF EXISTS spm_indicators_select ON aureka_quality.spm_indicators;
CREATE POLICY spm_indicators_select
  ON aureka_quality.spm_indicators FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR')
    AND (
      owner_room_id IS NULL
      OR aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS')
      OR aureka_system.has_quality_room_access(owner_room_id)
    )
  );

DROP POLICY IF EXISTS spm_measurements_select ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_select
  ON aureka_quality.spm_monthly_measurements FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR')
    AND EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id=indicator_id
        AND (
          i.owner_room_id IS NULL
          OR aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS')
          OR aureka_system.has_quality_room_access(i.owner_room_id)
        )
    )
  );

-- A manager may update a record originally entered by a PIC; keep entered_by immutable and
-- require updated_by to identify the authenticated actor on every upsert/update.
DROP POLICY IF EXISTS spm_measurements_update ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_update
  ON aureka_quality.spm_monthly_measurements FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id=indicator_id
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (i.owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(i.owner_room_id))
        )
    )
  )
  WITH CHECK (
    updated_by=(SELECT auth.uid())
    AND entered_by IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM aureka_quality.spm_indicators i
      WHERE i.id=indicator_id
        AND i.profile_year=profile_year
        AND i.is_active=true
        AND (
          aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
          OR (i.owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(i.owner_room_id))
        )
    )
  );

COMMIT;
