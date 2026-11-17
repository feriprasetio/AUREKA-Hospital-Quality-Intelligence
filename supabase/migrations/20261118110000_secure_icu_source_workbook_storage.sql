-- Private source-workbook retention for auditable ICU/HCU indicator provenance.
-- Files contain patient-identifiable clinical data and must remain room-scoped.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'aureka-quality-source-workbooks',
  'aureka-quality-source-workbooks',
  false,
  15728640,
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 15728640,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS aureka_quality_source_workbooks_select ON storage.objects;
CREATE POLICY aureka_quality_source_workbooks_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'aureka-quality-source-workbooks'
  AND split_part(name, '/', 1) ~ '^[0-9]+$'
  AND aureka_system.has_quality_room_access(split_part(name, '/', 1)::bigint)
);

DROP POLICY IF EXISTS aureka_quality_source_workbooks_insert ON storage.objects;
CREATE POLICY aureka_quality_source_workbooks_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'aureka-quality-source-workbooks'
  AND split_part(name, '/', 1) ~ '^[0-9]+$'
  AND split_part(name, '/', 2) ~ '^[0-9]{4}$'
  AND aureka_system.current_role_code() IN ('ADMIN', 'PMKP')
  AND aureka_system.has_quality_room_access(split_part(name, '/', 1)::bigint)
);

COMMENT ON POLICY aureka_quality_source_workbooks_select ON storage.objects IS
'Allows authenticated users to read source workbooks only for rooms they are authorized to access.';
COMMENT ON POLICY aureka_quality_source_workbooks_insert ON storage.objects IS
'Allows Admin/PMKP to upload private source workbooks only into an authorized room/year folder.';
