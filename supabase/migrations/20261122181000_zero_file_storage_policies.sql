-- Enforce after frontend deploy and schema compatibility migration.
BEGIN;
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
