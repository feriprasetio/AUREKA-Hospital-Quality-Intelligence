BEGIN;

CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_mapping_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id) ON DELETE CASCADE,
  profile_year integer NOT NULL CHECK (profile_year BETWEEN 2000 AND 2100),
  importer_key text NOT NULL CHECK (importer_key ~ '^[a-z][a-z0-9-]{1,49}$'),
  mapping_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mapping_json) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, profile_year, importer_key)
);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_import_mapping_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid REFERENCES aureka_quality.quality_import_mapping_configs(id) ON DELETE SET NULL,
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  profile_year integer NOT NULL,
  importer_key text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quality_import_mapping_configs_scope_idx
  ON aureka_quality.quality_import_mapping_configs (room_id, profile_year, is_active, importer_key);
CREATE INDEX IF NOT EXISTS quality_import_mapping_audit_scope_idx
  ON aureka_quality.quality_import_mapping_audit (room_id, profile_year, importer_key, created_at DESC);

ALTER TABLE aureka_quality.quality_import_mapping_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_import_mapping_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_import_mapping_configs_read ON aureka_quality.quality_import_mapping_configs;
CREATE POLICY quality_import_mapping_configs_read
  ON aureka_quality.quality_import_mapping_configs
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

DROP POLICY IF EXISTS quality_import_mapping_audit_read ON aureka_quality.quality_import_mapping_audit;
CREATE POLICY quality_import_mapping_audit_read
  ON aureka_quality.quality_import_mapping_audit
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

REVOKE ALL ON TABLE aureka_quality.quality_import_mapping_configs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE aureka_quality.quality_import_mapping_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE aureka_quality.quality_import_mapping_configs TO authenticated;
GRANT SELECT ON TABLE aureka_quality.quality_import_mapping_audit TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.quality_import_mapping_list_for_room(
  p_room_id bigint,
  p_profile_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '20s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk membaca konfigurasi impor.' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Konfigurasi impor dikelola Admin atau Komite PMKP.' USING ERRCODE = '42501';
  END IF;
  IF p_room_id IS NULL OR p_profile_year IS NULL
     OR p_profile_year < 2000 OR p_profile_year > 2100
     OR NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Cakupan unit atau tahun impor tidak valid atau tidak dapat diakses.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', c.id,
        'room_id', c.room_id,
        'profile_year', c.profile_year,
        'importer_key', c.importer_key,
        'mapping_json', c.mapping_json,
        'version', c.version,
        'updated_at', c.updated_at
      )
      ORDER BY c.importer_key
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM aureka_quality.quality_import_mapping_configs c
  WHERE c.room_id = p_room_id
    AND c.profile_year = p_profile_year
    AND c.is_active = true;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_import_mapping_save(
  p_room_id bigint,
  p_profile_year integer,
  p_importer_key text,
  p_mapping_json jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '30s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_reason text := pg_catalog.btrim(COALESCE(p_reason,''));
  v_before jsonb := '{}'::jsonb;
  v_id uuid;
  v_version integer;
  v_field record;
  v_indicator record;
  v_header text;
  v_workbook jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk menyimpan konfigurasi impor.' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Hanya Admin atau Komite PMKP yang dapat menyimpan konfigurasi impor.' USING ERRCODE = '42501';
  END IF;
  IF p_room_id IS NULL OR p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100
     OR NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Cakupan unit atau tahun impor tidak valid atau tidak dapat diakses.' USING ERRCODE = '42501';
  END IF;
  IF p_importer_key IS NULL OR p_importer_key !~ '^[a-z][a-z0-9-]{1,49}$' THEN
    RAISE EXCEPTION 'Kunci importer tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_mapping_json IS NULL OR pg_catalog.jsonb_typeof(p_mapping_json) IS DISTINCT FROM 'object'
     OR pg_catalog.pg_column_size(p_mapping_json) > 24576 THEN
    RAISE EXCEPTION 'Konfigurasi mapping harus berupa objek JSON dan tidak melebihi 24 KB.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Alasan perubahan konfigurasi minimal 10 karakter.' USING ERRCODE = '22023';
  END IF;

  v_workbook := COALESCE(p_mapping_json->'workbook','{}'::jsonb);
  IF pg_catalog.jsonb_typeof(v_workbook) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Konfigurasi workbook harus berupa objek.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_workbook->>'header_row','') <> ''
     AND (v_workbook->>'header_row') !~ '^[1-9][0-9]{0,2}$' THEN
    RAISE EXCEPTION 'Baris header harus berupa angka 1 sampai 999.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_workbook->>'data_start_row','') <> ''
     AND (v_workbook->>'data_start_row') !~ '^[1-9][0-9]{0,3}$' THEN
    RAISE EXCEPTION 'Baris awal data harus berupa angka 1 sampai 9999.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_workbook->>'header_row','') <> ''
     AND COALESCE(v_workbook->>'data_start_row','') <> ''
     AND (v_workbook->>'data_start_row')::integer <= (v_workbook->>'header_row')::integer THEN
    RAISE EXCEPTION 'Baris awal data harus setelah baris header.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_workbook->>'worksheet','') <> ''
     AND pg_catalog.length(v_workbook->>'worksheet') > 120 THEN
    RAISE EXCEPTION 'Nama worksheet maksimal 120 karakter.' USING ERRCODE = '22023';
  END IF;

  IF p_mapping_json ? 'fields' THEN
    IF pg_catalog.jsonb_typeof(p_mapping_json->'fields') IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_object_length(p_mapping_json->'fields') > 100 THEN
      RAISE EXCEPTION 'Field mapping harus berupa objek dengan maksimal 100 field.' USING ERRCODE = '22023';
    END IF;
    FOR v_field IN SELECT key, value FROM pg_catalog.jsonb_each(p_mapping_json->'fields')
    LOOP
      IF v_field.key = '' OR pg_catalog.length(v_field.key) > 160
         OR pg_catalog.jsonb_typeof(v_field.value) IS DISTINCT FROM 'string'
         OR pg_catalog.length(v_field.value #>> '{}') > 160 THEN
        RAISE EXCEPTION 'Field mapping berisi kunci atau nama kolom yang tidak valid.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF p_mapping_json ? 'indicators' THEN
    IF pg_catalog.jsonb_typeof(p_mapping_json->'indicators') IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_object_length(p_mapping_json->'indicators') > 250 THEN
      RAISE EXCEPTION 'Mapping indikator harus berupa objek dengan maksimal 250 indikator.' USING ERRCODE = '22023';
    END IF;
    FOR v_indicator IN SELECT key, value FROM pg_catalog.jsonb_each(p_mapping_json->'indicators')
    LOOP
      IF v_indicator.key = '' OR pg_catalog.length(v_indicator.key) > 80
         OR pg_catalog.jsonb_typeof(v_indicator.value) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Identitas indikator dalam mapping tidak valid.' USING ERRCODE = '22023';
      END IF;
      v_header := pg_catalog.btrim(COALESCE(v_indicator.value->>'source_header',''));
      IF v_header = '' OR pg_catalog.length(v_header) > 160 THEN
        RAISE EXCEPTION 'Kolom sumber untuk indikator % wajib diisi (maksimal 160 karakter).', v_indicator.key USING ERRCODE = '22023';
      END IF;
      IF COALESCE(v_indicator.value->>'occurrence','') <> ''
         AND (v_indicator.value->>'occurrence') !~ '^[1-9][0-9]{0,2}$' THEN
        RAISE EXCEPTION 'Urutan kemunculan header indikator % tidak valid.', v_indicator.key USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('aureka_quality.import_mapping:'||p_room_id::text||':'||p_profile_year::text||':'||p_importer_key,0)
  );

  SELECT c.id, c.version, c.mapping_json
    INTO v_id, v_version, v_before
  FROM aureka_quality.quality_import_mapping_configs c
  WHERE c.room_id = p_room_id
    AND c.profile_year = p_profile_year
    AND c.importer_key = p_importer_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO aureka_quality.quality_import_mapping_configs (
      room_id, profile_year, importer_key, mapping_json, version, is_active,
      created_by, updated_by, created_at, updated_at
    ) VALUES (
      p_room_id, p_profile_year, p_importer_key, p_mapping_json, 1, true,
      v_user_id, v_user_id, now(), now()
    )
    RETURNING id, version INTO v_id, v_version;
  ELSE
    UPDATE aureka_quality.quality_import_mapping_configs
       SET mapping_json = p_mapping_json,
           version = v_version + 1,
           is_active = true,
           updated_by = v_user_id,
           updated_at = now()
     WHERE id = v_id
    RETURNING version INTO v_version;
  END IF;

  INSERT INTO aureka_quality.quality_import_mapping_audit (
    mapping_id, room_id, profile_year, importer_key,
    before_json, after_json, reason, actor_id, created_at
  ) VALUES (
    v_id, p_room_id, p_profile_year, p_importer_key,
    v_before, p_mapping_json, v_reason, v_user_id, now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'mapping_id', v_id,
    'version', v_version,
    'room_id', p_room_id,
    'profile_year', p_profile_year,
    'importer_key', p_importer_key
  );
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_import_mapping_nara_access(
  p_room_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan untuk usulan mapping NARA.' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Usulan bulk mapping NARA hanya tersedia untuk Admin/PMKP.' USING ERRCODE = '42501';
  END IF;
  IF p_room_id IS NULL OR NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses unit untuk usulan mapping NARA tidak diberikan.' USING ERRCODE = '42501';
  END IF;
  SELECT r.name INTO v_name FROM public.master_rooms r WHERE r.id = p_room_id AND r.is_active = true;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Unit tidak aktif atau tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object('room_id',p_room_id,'room_name',v_name,'role',v_role);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.quality_import_mapping_list_for_room(bigint,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_import_mapping_save(bigint,integer,text,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_import_mapping_nara_access(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_import_mapping_list_for_room(bigint,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_import_mapping_save(bigint,integer,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_import_mapping_nara_access(bigint) TO authenticated;

-- Correct the known IGD source/profile separation without rewriting the indicator profile.
INSERT INTO aureka_quality.quality_import_mapping_configs (
  room_id, profile_year, importer_key, mapping_json, version, is_active,
  created_by, updated_by, created_at, updated_at
)
SELECT 6, 2026, 'igd',
  pg_catalog.jsonb_build_object(
    'workbook', pg_catalog.jsonb_build_object('worksheet','Logbook','header_row',3,'data_start_row',4,'header_scan_max_column',23),
    'fields', pg_catalog.jsonb_build_object(
      'No','No',
      'Nama Pasien','Nama Pasien',
      'No. Rekam Medis','No. Rekam Medis',
      'Diagnosa IGD','Diagnosa IGD',
      'Waktu Masuk','Waktu Masuk',
      'Waktu Transfer','Waktu Transfer',
      'Tujuan','Tujuan',
      'Perawat Penerima','Perawat Penerima',
      'Dokter Umum','Dokter Umum',
      'DPJP','DPJP'
    ),
    'indicators', pg_catalog.jsonb_build_object(
      '6.1',pg_catalog.jsonb_build_object('source_header','Kematian IGD ≤8h','occurrence',1),
      '6.2',pg_catalog.jsonb_build_object('source_header','Door-to-Decision','occurrence',1),
      '6.3',pg_catalog.jsonb_build_object('source_header','Response Time DPJP','occurrence',1),
      '6.4',pg_catalog.jsonb_build_object('source_header','Antrian Rawat Inap','occurrence',1),
      '6.5',pg_catalog.jsonb_build_object('source_header','Kelengkapan Assessment Keperawatan','occurrence',1),
      '6.6',pg_catalog.jsonb_build_object('source_header','Overcrowding Index','occurrence',1),
      '6.7',pg_catalog.jsonb_build_object('source_header','Response Triage','occurrence',1)
    )
  ),
  1, true, NULL, NULL, now(), now()
WHERE EXISTS (SELECT 1 FROM public.master_rooms WHERE id=6 AND is_active=true)
ON CONFLICT (room_id, profile_year, importer_key) DO NOTHING;

COMMENT ON TABLE aureka_quality.quality_import_mapping_configs IS
'Reusable workbook layout and source-column mappings by hospital unit, year and importer. Values contain header metadata only, never episode rows or patient values.';
COMMENT ON TABLE aureka_quality.quality_import_mapping_audit IS
'Versioned audit history for unit-level Excel source-column mapping changes.';
COMMENT ON FUNCTION aureka_quality.quality_import_mapping_nara_access(bigint) IS
'Verifies authenticated Admin/PMKP authority and room scope before NARA receives workbook header metadata for bulk mapping suggestions.';

COMMIT;
