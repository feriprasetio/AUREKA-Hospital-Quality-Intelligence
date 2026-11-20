BEGIN;
CREATE INDEX IF NOT EXISTS standard_operating_procedures_created_by_idx
  ON aureka_quality.standard_operating_procedures (created_by);
CREATE INDEX IF NOT EXISTS standard_operating_procedures_updated_by_idx
  ON aureka_quality.standard_operating_procedures (updated_by);
CREATE INDEX IF NOT EXISTS standard_operating_procedures_approved_by_idx
  ON aureka_quality.standard_operating_procedures (approved_by);
COMMIT;
