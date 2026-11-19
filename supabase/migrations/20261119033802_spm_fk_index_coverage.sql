BEGIN;

CREATE INDEX IF NOT EXISTS spm_audit_actor_id_idx
  ON aureka_quality.spm_audit_log(actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS spm_indicators_created_by_idx
  ON aureka_quality.spm_indicators(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS spm_indicators_updated_by_idx
  ON aureka_quality.spm_indicators(updated_by)
  WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS spm_indicators_owner_room_id_idx
  ON aureka_quality.spm_indicators(owner_room_id)
  WHERE owner_room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS spm_monthly_measurements_entered_by_idx
  ON aureka_quality.spm_monthly_measurements(entered_by);

CREATE INDEX IF NOT EXISTS spm_monthly_measurements_updated_by_idx
  ON aureka_quality.spm_monthly_measurements(updated_by)
  WHERE updated_by IS NOT NULL;

COMMIT;
