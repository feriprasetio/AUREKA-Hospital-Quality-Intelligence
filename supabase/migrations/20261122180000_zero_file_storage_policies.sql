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

-- RESTRICTIVE policies cannot be overridden by future permissive upload policies.
-- These block writes using anon/authenticated sessions to any Storage bucket in AUREKA.
-- Privileged service_role bypasses RLS: all server-side upload code must also be removed.
DROP POLICY IF EXISTS aureka_zero_file_insert_block ON storage.objects;
CREATE POLICY aureka_zero_file_insert_block ON storage.objects
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS aureka_zero_file_update_block ON storage.objects;
CREATE POLICY aureka_zero_file_update_block ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

COMMIT;
