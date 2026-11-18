BEGIN;

-- PIC/validator roles need read-only access to their own room's approved mappings
-- so every importer can resolve the mapping configured by Admin/PMKP.
CREATE OR REPLACE FUNCTION aureka_quality.quality_excel_header_mapping_list(
  p_room_id bigint,
  p_profile_year integer,
  p_importer_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '30s'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100 THEN
    RAISE EXCEPTION 'Tahun profil tidak valid.' USING ERRCODE='22023';
  END IF;
  IF p_importer_key IS NOT NULL AND length(btrim(p_importer_key)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Jenis workbook tidak valid.' USING ERRCODE='22023';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses baca pemetaan Excel untuk unit ini tidak diberikan.' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(m) ORDER BY importer_key,target_type,target_key),
    '[]'::jsonb
  )
  INTO v_rows
  FROM aureka_quality.quality_excel_header_mappings m
  WHERE room_id=p_room_id
    AND profile_year=p_profile_year
    AND (p_importer_key IS NULL OR importer_key=p_importer_key);

  RETURN jsonb_build_object(
    'room_id',p_room_id,
    'profile_year',p_profile_year,
    'mappings',v_rows
  );
END;
$function$;

CREATE OR REPLACE FUNCTION aureka_quality.quality_excel_header_mapping_delete(
  p_room_id bigint,
  p_profile_year integer,
  p_importer_key text,
  p_target_type text,
  p_target_key text,
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
  v_note text := btrim(COALESCE(p_decision_note,''));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan.' USING ERRCODE='28000';
  END IF;
  IF COALESCE(v_role,'') NOT IN ('ADMIN','PMKP') THEN
    RAISE EXCEPTION 'Penghapusan aturan pemetaan hanya diizinkan bagi Admin/PMKP.' USING ERRCODE='42501';
  END IF;
  IF NOT aureka_system.has_quality_room_access(p_room_id) THEN
    RAISE EXCEPTION 'Akses pengaturan pemetaan untuk unit ini tidak diberikan.' USING ERRCODE='42501';
  END IF;
  IF p_profile_year IS NULL OR p_profile_year < 2000 OR p_profile_year > 2100
     OR p_importer_key IS NULL OR length(btrim(p_importer_key)) NOT BETWEEN 1 AND 80
     OR p_target_type NOT IN ('indicator','field')
     OR p_target_key IS NULL OR length(btrim(p_target_key)) NOT BETWEEN 1 AND 160
     OR length(v_note) < 10 THEN
    RAISE EXCEPTION 'Parameter penghapusan pemetaan atau alasan tidak valid.' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(m) INTO v_before
  FROM aureka_quality.quality_excel_header_mappings m
  WHERE room_id=p_room_id
    AND profile_year=p_profile_year
    AND importer_key=p_importer_key
    AND target_type=p_target_type
    AND target_key=p_target_key
  FOR UPDATE;

  IF v_before IS NULL THEN
    RETURN jsonb_build_object('success',true,'deleted_count',0);
  END IF;

  DELETE FROM aureka_quality.quality_excel_header_mappings
  WHERE room_id=p_room_id
    AND profile_year=p_profile_year
    AND importer_key=p_importer_key
    AND target_type=p_target_type
    AND target_key=p_target_key;

  INSERT INTO aureka_quality.quality_excel_mapping_audit (
    room_id,profile_year,importer_key,target_type,target_key,action_type,
    before_json,after_json,decision_note,actor_id
  ) VALUES (
    p_room_id,p_profile_year,p_importer_key,p_target_type,p_target_key,'deleted',
    v_before,'{}'::jsonb,v_note,v_user
  );

  RETURN jsonb_build_object('success',true,'deleted_count',1);
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.quality_excel_header_mapping_list(bigint,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION aureka_quality.quality_excel_header_mapping_delete(bigint,integer,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_excel_header_mapping_list(bigint,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION aureka_quality.quality_excel_header_mapping_delete(bigint,integer,text,text,text,text) TO authenticated;

COMMENT ON FUNCTION aureka_quality.quality_excel_header_mapping_list(bigint,integer,text) IS
'Read-only room-scoped workbook mapping resolver for all authenticated roles with room access. Only Admin/PMKP can write mappings; PIC and validators can use the approved mapping in their logbook imports.';
COMMENT ON FUNCTION aureka_quality.quality_excel_header_mapping_delete(bigint,integer,text,text,text,text) IS
'Delete one unit/year/importer field or indicator mapping with an audit entry. Restricted to Admin/PMKP.';

COMMIT;