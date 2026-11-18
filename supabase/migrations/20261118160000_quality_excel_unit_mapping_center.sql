BEGIN;

CREATE TABLE IF NOT EXISTS aureka_quality.quality_excel_header_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id) ON DELETE CASCADE,
  profile_year integer NOT NULL CHECK (profile_year BETWEEN 2000 AND 2100),
  importer_key text NOT NULL CHECK (length(btrim(importer_key)) BETWEEN 1 AND 80),
  target_type text NOT NULL CHECK (target_type IN ('indicator','field')),
  target_key text NOT NULL CHECK (length(btrim(target_key)) BETWEEN 1 AND 160),
  target_label text NOT NULL CHECK (length(btrim(target_label)) BETWEEN 1 AND 240),
  source_header text NOT NULL CHECK (length(btrim(source_header)) BETWEEN 1 AND 240),
  occurrence integer NOT NULL DEFAULT 1 CHECK (occurrence BETWEEN 1 AND 20),
  transform_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(transform_json) = 'object'),
  ai_confidence numeric(5,4) CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_rationale text,
  mapping_status text NOT NULL DEFAULT 'approved' CHECK (mapping_status IN ('approved','needs_review')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, profile_year, importer_key, target_type, target_key)
);

CREATE INDEX IF NOT EXISTS quality_excel_header_mappings_lookup_idx
  ON aureka_quality.quality_excel_header_mappings(room_id, profile_year, importer_key, target_type);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_excel_mapping_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  profile_year integer NOT NULL,
  importer_key text NOT NULL,
  target_type text NOT NULL,
  target_key text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('created','updated','deleted','profile_updated')),
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_note text,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quality_excel_mapping_audit_room_created_idx
  ON aureka_quality.quality_excel_mapping_audit(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aureka_quality.quality_excel_profile_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES aureka_quality.indicator_profiles(id) ON DELETE CASCADE,
  room_id bigint NOT NULL REFERENCES public.master_rooms(id),
  profile_year integer NOT NULL,
  indicator_code text NOT NULL,
  before_json jsonb NOT NULL,
  after_json jsonb NOT NULL,
  decision_note text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quality_excel_profile_audit_idx
  ON aureka_quality.quality_excel_profile_audit(profile_id, created_at DESC);

ALTER TABLE aureka_quality.quality_excel_header_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_excel_mapping_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE aureka_quality.quality_excel_profile_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_excel_header_mappings_select ON aureka_quality.quality_excel_header_mappings;
CREATE POLICY quality_excel_header_mappings_select
  ON aureka_quality.quality_excel_header_mappings
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

DROP POLICY IF EXISTS quality_excel_mapping_audit_select ON aureka_quality.quality_excel_mapping_audit;
CREATE POLICY quality_excel_mapping_audit_select
  ON aureka_quality.quality_excel_mapping_audit
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

DROP POLICY IF EXISTS quality_excel_profile_audit_select ON aureka_quality.quality_excel_profile_audit;
CREATE POLICY quality_excel_profile_audit_select
  ON aureka_quality.quality_excel_profile_audit
  FOR SELECT TO authenticated
  USING (
    aureka_system.current_role_code() IN ('ADMIN','PMKP')
    AND aureka_system.has_quality_room_access(room_id)
  );

REVOKE ALL ON aureka_quality.quality_excel_header_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON aureka_quality.quality_excel_mapping_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON aureka_quality.quality_excel_profile_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON aureka_quality.quality_excel_header_mappings TO authenticated;
GRANT SELECT ON aureka_quality.quality_excel_mapping_audit TO authenticated;
GRANT SELECT ON aureka_quality.quality_excel_profile_audit TO authenticated;

CREATE OR REPLACE FUNCTION aureka_quality.quality_excel_header_mapping_list(
  p_room_id bigint,
  p_profile_year integer,
  p_importer_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := aureka_system.current_role_code();
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000'; END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Pengaturan pemetaan Excel hanya tersedia bagi Admin dan Komite PMKP.' USING ERRCODE='42501';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100 THEN
    RAISE EXCEPTION 'Tahun profil tidak valid.' USING ERRCODE='22023';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses pengaturan pemetaan untuk unit ini tidak diberikan.' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY importer_key,target_type,target_key),'[]'::jsonb)
    INTO v_rows
  FROM aureka_quality.quality_excel_header_mappings m
  WHERE room_id=p_room_id
    AND profile_year=p_profile_year
    AND (p_importer_key IS NULL OR importer_key=p_importer_key);

  RETURN jsonb_build_object('room_id',p_room_id,'profile_year',p_profile_year,'mappings',v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_excel_header_mapping_upsert_bulk(
  p_room_id bigint,
  p_profile_year integer,
  p_importer_key text,
  p_rules jsonb,
  p_decision_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '60s'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_rule jsonb;
  v_type text;
  v_key text;
  v_label text;
  v_header text;
  v_occurrence integer;
  v_code text;
  v_confidence numeric;
  v_before jsonb;
  v_after jsonb;
  v_saved integer := 0;
  v_note text := btrim(COALESCE(p_decision_note,'Pemetaan sumber disimpan dari Pusat Rekonsiliasi.'));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000'; END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Penyimpanan pemetaan Excel hanya diizinkan bagi Admin/PMKP.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses unit untuk pemetaan Excel tidak diberikan.' USING ERRCODE='42501';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100
     OR p_importer_key IS NULL OR length(btrim(p_importer_key)) NOT BETWEEN 1 AND 80
     OR p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array'
     OR jsonb_array_length(p_rules) < 1 OR jsonb_array_length(p_rules) > 250 THEN
    RAISE EXCEPTION 'Parameter pemetaan tidak valid. Periksa tahun, jenis workbook, dan jumlah aturan.' USING ERRCODE='22023';
  END IF;
  IF length(v_note) < 10 THEN RAISE EXCEPTION 'Alasan penyimpanan minimal 10 karakter.' USING ERRCODE='22023'; END IF;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(p_rules)
  LOOP
    v_type := COALESCE(v_rule->>'target_type','indicator');
    v_key := btrim(COALESCE(v_rule->>'target_key',''));
    v_label := btrim(COALESCE(v_rule->>'target_label',''));
    v_header := btrim(COALESCE(v_rule->>'source_header',''));
    v_occurrence := COALESCE((v_rule->>'occurrence')::integer,1);
    v_code := NULLIF(btrim(v_rule->>'indicator_code'),'');
    v_confidence := CASE WHEN v_rule->>'ai_confidence' ~ '^(0(\.[0-9]+)?|1(\.0+)?)$' THEN (v_rule->>'ai_confidence')::numeric ELSE NULL END;

    IF v_type NOT IN ('indicator','field')
       OR v_key = '' OR length(v_key)>160
       OR v_label = '' OR length(v_label)>240
       OR v_header = '' OR length(v_header)>240
       OR v_occurrence NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Aturan pemetaan memiliki target/header/posisi yang tidak valid.' USING ERRCODE='22023';
    END IF;

    IF v_type='indicator' THEN
      IF v_code IS NULL THEN
        v_code := regexp_replace(v_key,'^indicator:','');
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM aureka_quality.indicator_profiles ip
        WHERE ip.room_id=p_room_id AND ip.profile_year=p_profile_year
          AND ip.code=v_code AND ip.is_active=true
          AND ip.status IN ('published','draft')
      ) THEN
        RAISE EXCEPTION 'Profil indikator % tidak ditemukan pada unit/tahun tersebut.',v_code USING ERRCODE='22023';
      END IF;
      v_key := 'indicator:'||v_code;
    END IF;

    SELECT to_jsonb(m) INTO v_before
    FROM aureka_quality.quality_excel_header_mappings m
    WHERE room_id=p_room_id AND profile_year=p_profile_year
      AND importer_key=p_importer_key AND target_type=v_type AND target_key=v_key
    FOR UPDATE;

    INSERT INTO aureka_quality.quality_excel_header_mappings (
      room_id,profile_year,importer_key,target_type,target_key,target_label,
      source_header,occurrence,transform_json,ai_confidence,ai_rationale,
      mapping_status,created_by,updated_by,updated_at
    ) VALUES (
      p_room_id,p_profile_year,p_importer_key,v_type,v_key,v_label,
      v_header,v_occurrence,COALESCE(v_rule->'transform_json','{}'::jsonb),
      v_confidence,NULLIF(v_rule->>'ai_rationale',''),
      CASE WHEN COALESCE((v_rule->>'requires_review')::boolean,false) THEN 'needs_review' ELSE 'approved' END,
      v_user,v_user,now()
    )
    ON CONFLICT (room_id,profile_year,importer_key,target_type,target_key)
    DO UPDATE SET
      target_label=EXCLUDED.target_label,
      source_header=EXCLUDED.source_header,
      occurrence=EXCLUDED.occurrence,
      transform_json=EXCLUDED.transform_json,
      ai_confidence=EXCLUDED.ai_confidence,
      ai_rationale=EXCLUDED.ai_rationale,
      mapping_status=EXCLUDED.mapping_status,
      updated_by=EXCLUDED.updated_by,
      updated_at=now();

    SELECT to_jsonb(m) INTO v_after
    FROM aureka_quality.quality_excel_header_mappings m
    WHERE room_id=p_room_id AND profile_year=p_profile_year
      AND importer_key=p_importer_key AND target_type=v_type AND target_key=v_key;

    INSERT INTO aureka_quality.quality_excel_mapping_audit (
      room_id,profile_year,importer_key,target_type,target_key,action_type,
      before_json,after_json,decision_note,actor_id
    ) VALUES (
      p_room_id,p_profile_year,p_importer_key,v_type,v_key,
      CASE WHEN v_before IS NULL THEN 'created' ELSE 'updated' END,
      COALESCE(v_before,'{}'::jsonb),COALESCE(v_after,'{}'::jsonb),v_note,v_user
    );
    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('success',true,'saved_count',v_saved,'importer_key',p_importer_key);
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_excel_indicator_profile_update(
  p_profile_id uuid,
  p_patch jsonb,
  p_decision_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '30s'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_before jsonb;
  v_after jsonb;
  v_room bigint;
  v_year integer;
  v_code text;
  v_title text;
  v_schema jsonb;
  v_options jsonb;
  v_note text := btrim(COALESCE(p_decision_note,''));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000'; END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Perubahan master indikator hanya diizinkan bagi Admin/PMKP.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_patch)<>'object' OR length(v_note)<10 THEN
    RAISE EXCEPTION 'Data profil atau alasan perubahan tidak valid.' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(ip),ip.room_id,ip.profile_year,ip.code
  INTO v_before,v_room,v_year,v_code
  FROM aureka_quality.indicator_profiles ip
  WHERE ip.id=p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil indikator tidak ditemukan.' USING ERRCODE='22023'; END IF;
  IF NOT aureka_system.has_quality_room_access(v_room) THEN
    RAISE EXCEPTION 'Akses edit profil indikator untuk unit ini tidak diberikan.' USING ERRCODE='42501';
  END IF;

  v_title := COALESCE(NULLIF(btrim(p_patch->>'title'),''),v_before->>'title');
  v_schema := COALESCE(p_patch->'schema_json',v_before->'schema_json','{}'::jsonb);
  v_options := COALESCE(p_patch->'options_json',v_before->'options_json','[]'::jsonb);
  IF jsonb_typeof(v_schema)<>'object' OR jsonb_typeof(v_options)<>'array'
     OR jsonb_array_length(v_options)>150 OR v_title IS NULL OR length(v_title)>300 THEN
    RAISE EXCEPTION 'Schema harus JSON object, opsi harus array maksimal 150 baris, dan judul wajib diisi.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_options) opt
    WHERE (opt->>'code') IS NOT NULL AND (opt->>'code') !~ '^[1-3]$'
  ) THEN
    RAISE EXCEPTION 'Kode opsi hanya boleh 1, 2, atau 3; kode yang tidak diketahui jangan dipaksa menjadi klasifikasi.' USING ERRCODE='22023';
  END IF;

  UPDATE aureka_quality.indicator_profiles
  SET title=v_title,
      category=COALESCE(NULLIF(btrim(p_patch->>'category'),''),category),
      unit_of_measure=COALESCE(NULLIF(btrim(p_patch->>'unit_of_measure'),''),unit_of_measure),
      target_text=COALESCE(NULLIF(btrim(p_patch->>'target_text'),''),target_text),
      numerator_definition=COALESCE(NULLIF(btrim(p_patch->>'numerator_definition'),''),numerator_definition),
      denominator_definition=COALESCE(NULLIF(btrim(p_patch->>'denominator_definition'),''),denominator_definition),
      schema_json=v_schema,
      options_json=v_options,
      version=COALESCE(version,1)+1,
      updated_by=v_user,
      updated_at=now()
  WHERE id=p_profile_id;

  SELECT to_jsonb(ip) INTO v_after FROM aureka_quality.indicator_profiles ip WHERE ip.id=p_profile_id;
  INSERT INTO aureka_quality.quality_excel_profile_audit (
    profile_id,room_id,profile_year,indicator_code,before_json,after_json,decision_note,actor_id
  ) VALUES (p_profile_id,v_room,v_year,v_code,v_before,v_after,v_note,v_user);

  PERFORM pg_notify('aureka_indicator_profiles_updated',jsonb_build_object('room_id',v_room,'year',v_year,'code',v_code)::text);
  RETURN jsonb_build_object('success',true,'profile_id',p_profile_id,'indicator_code',v_code,'version',v_after->>'version');
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_excel_mapping_ai_context(
  p_room_id bigint,
  p_profile_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := aureka_system.current_role_code();
  v_profiles jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000'; END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'NARA AI untuk pemetaan Excel massal hanya tersedia bagi Admin/PMKP.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses ke unit untuk bantuan NARA tidak diberikan.' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',ip.id,'code',ip.code,'title',ip.title,
    'header_label',ip.schema_json->>'header_label',
    'header_aliases',COALESCE(ip.schema_json->'excel_header_aliases','[]'::jsonb),
    'options_count',jsonb_array_length(COALESCE(ip.options_json,'[]'::jsonb))
  ) ORDER BY ip.code),'[]'::jsonb)
  INTO v_profiles
  FROM aureka_quality.indicator_profiles ip
  WHERE ip.room_id=p_room_id AND ip.profile_year=p_profile_year
    AND ip.is_active=true AND ip.status='published';

  RETURN jsonb_build_object('room_id',p_room_id,'profile_year',p_profile_year,'profiles',v_profiles);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.quality_excel_header_mapping_list(bigint,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_excel_header_mapping_upsert_bulk(bigint,integer,text,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_excel_indicator_profile_update(uuid,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_excel_mapping_ai_context(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_excel_header_mapping_list(bigint,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_excel_header_mapping_upsert_bulk(bigint,integer,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_excel_indicator_profile_update(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_excel_mapping_ai_context(bigint,integer) TO authenticated;

COMMENT ON TABLE aureka_quality.quality_excel_header_mappings IS
'Unit/year/importer-scoped workbook source-header mappings. Stores source columns separately from clinical indicator definitions so one unit''s workbook layout cannot overwrite another unit''s indicator master.';
COMMENT ON FUNCTION aureka_quality.quality_excel_header_mapping_upsert_bulk(bigint,integer,text,jsonb,text) IS
'Validates and persists bulk source-header mappings for one room/year/importer. All changes are audit logged. AI suggestions are never applied without an explicit user save.';
COMMENT ON FUNCTION aureka_quality.quality_excel_indicator_profile_update(uuid,jsonb,text) IS
'Role-scoped indicator profile editor used when workbook mapping cannot resolve a missing/incorrect master header or option set. All changes are audit logged.';

COMMIT;
