-- Quarantine historical Supabase Storage objects in zero-file AUREKA.
-- No objects are deleted. Application auth sessions must not read or delete
-- archival originals. Only separately authorized privileged administrative
-- retention/backup processes can access legacy objects.
-- Existing INSERT and UPDATE restrictive policies remain in place.
BEGIN;

DROP POLICY IF EXISTS aureka_zero_file_select_block ON storage.objects;
CREATE POLICY aureka_zero_file_select_block ON storage.objects
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS aureka_zero_file_delete_block ON storage.objects;
CREATE POLICY aureka_zero_file_delete_block ON storage.objects
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

COMMIT;
