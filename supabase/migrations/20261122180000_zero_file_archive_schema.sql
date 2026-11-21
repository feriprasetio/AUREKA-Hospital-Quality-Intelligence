-- AUREKA Zero-File Storage: additive schema compatibility and deny browser uploads.
-- Apply only after the corresponding frontend is deployed and regression-tested.
-- Existing storage objects are neither removed nor modified.
BEGIN;

ALTER TABLE aureka_system.pmkp_meeting_documents
  ALTER COLUMN bucket_id DROP NOT NULL,
  ALTER COLUMN object_path DROP NOT NULL;

ALTER TABLE aureka_system.pmkp_meeting_documents
  ADD COLUMN IF NOT EXISTS source_mode text NOT NULL DEFAULT 'legacy_storage';

ALTER TABLE aureka_system.pmkp_meeting_documents
  DROP CONSTRAINT IF EXISTS pmkp_meeting_documents_source_mode_check;
ALTER TABLE aureka_system.pmkp_meeting_documents
  ADD CONSTRAINT pmkp_meeting_documents_source_mode_check
  CHECK (source_mode IN ('legacy_storage','data_only'));

ALTER TABLE aureka_system.pmkp_meeting_documents
  DROP CONSTRAINT IF EXISTS pmkp_meeting_documents_data_only_path_check;
ALTER TABLE aureka_system.pmkp_meeting_documents
  ADD CONSTRAINT pmkp_meeting_documents_data_only_path_check
  CHECK (source_mode <> 'data_only' OR (object_path IS NULL AND bucket_id IS NULL));

COMMENT ON COLUMN aureka_system.pmkp_meeting_documents.source_mode IS
  'data_only = only extracted text and audit metadata retained, no binary file or Storage object; legacy_storage = historical record, do not delete automatically.';

COMMIT;
