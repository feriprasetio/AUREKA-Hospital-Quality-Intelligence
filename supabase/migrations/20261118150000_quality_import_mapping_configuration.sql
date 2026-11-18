BEGIN;

CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id) ON DELETE CASCADE,
  profile_year integer NOT NULL CHECK (profile_year BETWEEN 2000 AND 2100),
  importer_key text NOT NULL CHECK (length(btrim(importer_key)) BETWEEN 2 AND 64),
  sheet_name text NOT NULL DEFAULT 'Logbook' CHECK (length(btrim(sheet_name)) BETWEEN 1 AND 128),
  header_row integer NOT NULL DEFAULT 3 CHECK (header_row BETWEEN 1 AND 100),
  data_start_row integer NOT NULL DEFAULT 4 CHECK (data_start_row BETWEEN 2 AND 101),
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(field_mappings) = 'object'),
  indicator_mappings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(indicator_mappings) = 'object'),
  workbook_name_hint text,
  last_ai_provider text,
  last_ai_model text,
  last_ai_suggested_at timestamptz,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, profile_year, importer_key),
  CHECK (data_start_row > header_row)
);

CREATE INDEX IF NOT EXISTS quality_import_mappings_room_year_idx
  ON aureka_quality.quality_import_mappings(room_id, profile_year, importer_key);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_mapping_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  profile_year integer NOT NULL,
  importer_key text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'unit_mapping_saved',
    'indicator_profile_import_metadata_updated',
    'nara_mapping_suggestions_accepted'
  )),
  target_key text,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_note text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quality_import_mapping_audit_scope_idx
  ON aureka_quality.quality_import_mapping_audit(room_id, profile_year, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_import_mapping_audit_actor_idx
  ON aureka_quality.quality_import_mapping_audit(actor_id, created_at DESC);

ALTER TABLE aureka_quality.quality_import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_import_mapping_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_import_mappings_select_scope ON aureka_quality.quality_import_mappings;
CREATE POLICY quality_import_mappings_select_scope
  ON aureka_quality.quality_import_mappings
  FOR SELECT TO authenticated
  USING (aureka_system.has_quality_room_access(room_id));

DROP POLICY IF EXISTS quality_import_mappings_insert_governed ON aureka_quality.quality_import_mappings;
CREATE POLICY quality_import_mappings_insert_governed
  ON aureka_quality.quality_import_mappings
  FOR INSERT TO authenticated
  WITH CHECK (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
    AND updated_by = auth.uid()
  );

DROP POLICY IF EXISTS quality_import_mappings_update_governed ON aureka_quality.quality_import_mappings;
CREATE POLICY quality_import_mappings_update_governed
  ON aureka_quality.quality_import_mappings
  FOR UPDATE TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  )
  WITH CHECK (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
    AND updated_by = auth.uid()
  );

DROP POLICY IF EXISTS quality_import_mapping_audit_select_governed ON aureka_quality.quality_import_mapping_audit;
CREATE POLICY quality_import_mapping_audit_select_governed
  ON aureka_quality.quality_import_mapping_audit
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

DROP POLICY IF EXISTS quality_import_mapping_audit_insert_governed ON aureka_quality.quality_import_mapping_audit;
CREATE POLICY quality_import_mapping_audit_insert_governed
  ON aureka_quality.quality_import_mapping_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
    AND actor_id = auth.uid()
  );

REVOKE ALL ON TABLE aureka_quality.quality_import_mappings FROM PUBLIC, anon;
REVOKE ALL ON TABLE aureka_quality.quality_import_mapping_audit FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE aureka_quality.quality_import_mappings TO authenticated;
GRANT SELECT, INSERT ON TABLE aureka_quality.quality_import_mapping_audit TO authenticated;

-- Permit scoped import-metadata maintenance without granting PMKP permission to change
-- a profile's clinical options or classification logic.
DROP POLICY IF EXISTS quality_profiles_import_metadata_update ON aureka_quality.indicator_profiles;
CREATE POLICY quality_profiles_import_metadata_update
  ON aureka_quality.indicator_profiles
  FOR UPDATE TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
    AND status = 'published'
    AND is_active = true
  )
  WITH CHECK (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
    AND status = 'published'
    AND is_active = true
  );

GRANT UPDATE (
  title,
  target_text,
  numerator_definition,
  denominator_definition,
  schema_json,
  version,
  updated_by,
  updated_at
) ON TABLE aureka_quality.indicator_profiles TO authenticated;

COMMENT ON TABLE aureka_quality.quality_import_mappings IS
'Central workbook column mapping by unit, profile year and importer. Field keys and indicator codes resolve to source header labels, not physical Excel column positions, so column order can change safely.';
COMMENT ON TABLE aureka_quality.quality_import_mapping_audit IS
'Auditable, PHI-free history of governed workbook mapping changes and indicator profile import-metadata adjustments.';
COMMENT ON POLICY quality_profiles_import_metadata_update ON aureka_quality.indicator_profiles IS
'Admin/PMKP can update only explicitly granted import metadata columns for published, active profiles in rooms they can manage. Clinical options and numerator/denominator rules are not granted here.';

COMMIT;
