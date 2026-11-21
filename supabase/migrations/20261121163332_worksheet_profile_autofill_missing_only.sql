-- Workbook master bootstrap: append missing patient-episode profiles only.
-- No existing profile is replaced, retired, or re-keyed; no patient data is accepted.
CREATE OR REPLACE FUNCTION aureka_quality.autofill_missing_indicator_profiles(
  p_room_id bigint,
  p_profile_year integer,
  p_profiles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_code text;
  v_title text;
  v_target text;
  v_next_version integer;
  v_existing_room bigint;
  v_seen text[] := ARRAY[]::text[];
  v_inserted integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan untuk mengisi master indikator.' USING ERRCODE='28000';
  END IF;
  IF NOT aureka_system.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya Superadmin yang dapat menambahkan profil indikator dari workbook.' USING ERRCODE='42501';
  END IF;
  IF p_profile_year NOT BETWEEN 2000 AND 2100 OR p_room_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.master_rooms WHERE id=p_room_id) THEN
    RAISE EXCEPTION 'Tahun atau unit tujuan tidak valid.' USING ERRCODE='22023';
  END IF;
  IF p_profiles IS NULL OR jsonb_typeof(p_profiles)<>'array'
     OR jsonb_array_length(p_profiles) NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'Unggahan harus memuat 1–250 profil indikator baru.' USING ERRCODE='22023';
  END IF;

  -- Share the same lock with the existing full profile-set replacement RPC.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('aureka_quality.indicator_profile_set:' || p_profile_year::text,0)
  );

  -- Validate every input first. Any rejected item rolls back the full statement.
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_profiles) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Format metadata profil tidak valid.' USING ERRCODE='22023';
    END IF;
    v_code := pg_catalog.btrim(COALESCE(v_item->>'code',''));
    v_title := pg_catalog.btrim(COALESCE(v_item->>'title',''));
    IF v_code = '' OR pg_catalog.length(v_code)>120 OR v_title = ''
       OR pg_catalog.length(v_title)>500 THEN
      RAISE EXCEPTION 'Kode atau nama indikator kosong/terlalu panjang.' USING ERRCODE='22023';
    END IF;
    IF v_code ~ '^([0-9]+)\.' AND pg_catalog.split_part(v_code,'.',1)::bigint <> p_room_id THEN
      RAISE EXCEPTION 'Kode indikator % tidak sesuai unit tujuan.',v_code USING ERRCODE='22023';
    END IF;
    IF upper(pg_catalog.regexp_replace(v_code,'[[:space:]]','','g')) = ANY(v_seen) THEN
      RAISE EXCEPTION 'Kode indikator % berulang di workbook.',v_code USING ERRCODE='23505';
    END IF;
    v_seen := pg_catalog.array_append(v_seen,upper(pg_catalog.regexp_replace(v_code,'[[:space:]]','','g')));
    IF COALESCE(v_item->>'measurement_grain','') <> 'patient_episode'
       OR v_item->>'room_id' <> p_room_id::text
       OR v_item->>'profile_year' <> p_profile_year::text THEN
      RAISE EXCEPTION 'Identitas unit, tahun, atau jenis pengukuran indikator % tidak sesuai.',v_code USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(v_item->'schema_json') <> 'object'
       OR jsonb_typeof(v_item->'options_json') <> 'array' THEN
      RAISE EXCEPTION 'Konfigurasi dan opsi indikator % tidak valid.',v_code USING ERRCODE='22023';
    END IF;
    IF COALESCE(NULLIF(v_item->>'target_operator',''),'=') NOT IN ('=','>=','<=','>','<') THEN
      RAISE EXCEPTION 'Operator target % tidak valid.',v_code USING ERRCODE='22023';
    END IF;
    v_target := NULLIF(pg_catalog.btrim(COALESCE(v_item->>'target_value','')),'');
    IF v_target IS NOT NULL AND v_target !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Nilai target numerik indikator % tidak valid.',v_code USING ERRCODE='22023';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_profiles) LOOP
    v_code := pg_catalog.btrim(v_item->>'code');
    v_title := pg_catalog.btrim(v_item->>'title');
    v_existing_room := NULL;
    SELECT room_id INTO v_existing_room
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=p_profile_year AND code=v_code AND is_active=true
       AND status IN ('published','draft')
     ORDER BY version DESC LIMIT 1;
    IF v_existing_room IS NOT NULL THEN
      IF v_existing_room <> p_room_id THEN
        RAISE EXCEPTION 'Kode % sudah dipakai unit lain. Impor dihentikan.',v_code USING ERRCODE='23505';
      END IF;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    SELECT COALESCE(MAX(version),0)+1 INTO v_next_version
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=p_profile_year AND code=v_code;
    INSERT INTO aureka_quality.indicator_profiles (
      profile_year,code,room_id,unit_name,title,indicator_type,category,
      unit_of_measure,target_text,target_operator,target_value,
      numerator_definition,denominator_definition,measurement_grain,
      schema_json,options_json,version,status,is_active,created_by,updated_by
    ) VALUES (
      p_profile_year,v_code,p_room_id,
      COALESCE(NULLIF(pg_catalog.btrim(v_item->>'unit_name'),''),(SELECT name FROM public.master_rooms WHERE id=p_room_id)),
      v_title,NULLIF(pg_catalog.btrim(v_item->>'indicator_type'),''),
      NULLIF(pg_catalog.btrim(v_item->>'category'),''),
      NULLIF(pg_catalog.btrim(v_item->>'unit_of_measure'),''),
      NULLIF(pg_catalog.btrim(v_item->>'target_text'),''),
      COALESCE(NULLIF(v_item->>'target_operator',''),'='),
      NULLIF(pg_catalog.btrim(v_item->>'target_value'),'')::numeric,
      NULLIF(pg_catalog.btrim(v_item->>'numerator_definition'),''),
      NULLIF(pg_catalog.btrim(v_item->>'denominator_definition'),''),
      'patient_episode',v_item->'schema_json',v_item->'options_json',
      v_next_version,'published',true,v_actor,v_actor
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success',true,'room_id',p_room_id,'profile_year',p_profile_year,
    'inserted_profiles',v_inserted,'skipped_existing',v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.autofill_missing_indicator_profiles(bigint,integer,jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION aureka_quality.autofill_missing_indicator_profiles(bigint,integer,jsonb)
  TO authenticated;
