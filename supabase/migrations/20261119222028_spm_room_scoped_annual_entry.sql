BEGIN;
ALTER TABLE aureka_quality.spm_monthly_measurements
  ADD COLUMN IF NOT EXISTS room_id bigint NULL
  REFERENCES public.master_rooms(id) ON DELETE RESTRICT;
ALTER TABLE aureka_quality.spm_monthly_measurements
  DROP CONSTRAINT IF EXISTS spm_monthly_measurements_indicator_id_profile_year_period_m_key;
CREATE UNIQUE INDEX IF NOT EXISTS spm_monthly_measurements_scope_unique
  ON aureka_quality.spm_monthly_measurements
  (indicator_id, profile_year, period_month, room_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS spm_measurements_room_year_idx
  ON aureka_quality.spm_monthly_measurements (room_id, profile_year, period_month)
  WHERE room_id IS NOT NULL;

DROP POLICY IF EXISTS spm_measurements_select ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_select ON aureka_quality.spm_monthly_measurements
FOR SELECT TO authenticated USING (
  aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS')
  OR EXISTS (SELECT 1 FROM aureka_quality.spm_indicators i
    WHERE i.id=spm_monthly_measurements.indicator_id
      AND i.profile_year=spm_monthly_measurements.profile_year
      AND ((spm_monthly_measurements.room_id IS NOT NULL AND aureka_system.has_quality_room_access(spm_monthly_measurements.room_id))
        OR (spm_monthly_measurements.room_id IS NULL AND i.owner_room_id IS NOT NULL AND aureka_system.has_quality_room_access(i.owner_room_id)))
  )
);

DROP POLICY IF EXISTS spm_measurements_insert ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_insert ON aureka_quality.spm_monthly_measurements
FOR INSERT TO authenticated WITH CHECK (
  entered_by=(SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM aureka_quality.spm_indicators i
    WHERE i.id=spm_monthly_measurements.indicator_id
      AND i.profile_year=spm_monthly_measurements.profile_year AND i.is_active=true
      AND (aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
        OR (COALESCE(spm_monthly_measurements.room_id,i.owner_room_id) IS NOT NULL
          AND aureka_system.has_quality_room_access(COALESCE(spm_monthly_measurements.room_id,i.owner_room_id))))
  )
);

DROP POLICY IF EXISTS spm_measurements_update ON aureka_quality.spm_monthly_measurements;
CREATE POLICY spm_measurements_update ON aureka_quality.spm_monthly_measurements
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM aureka_quality.spm_indicators i
  WHERE i.id=spm_monthly_measurements.indicator_id AND i.profile_year=spm_monthly_measurements.profile_year
    AND (aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
      OR (COALESCE(spm_monthly_measurements.room_id,i.owner_room_id) IS NOT NULL
        AND aureka_system.has_quality_room_access(COALESCE(spm_monthly_measurements.room_id,i.owner_room_id))))))
WITH CHECK (
  updated_by=(SELECT auth.uid()) AND entered_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM aureka_quality.spm_indicators i
    WHERE i.id=spm_monthly_measurements.indicator_id AND i.profile_year=spm_monthly_measurements.profile_year AND i.is_active=true
      AND (aureka_system.current_role_code() IN ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR')
        OR (COALESCE(spm_monthly_measurements.room_id,i.owner_room_id) IS NOT NULL
          AND aureka_system.has_quality_room_access(COALESCE(spm_monthly_measurements.room_id,i.owner_room_id)))))
);
COMMIT;
