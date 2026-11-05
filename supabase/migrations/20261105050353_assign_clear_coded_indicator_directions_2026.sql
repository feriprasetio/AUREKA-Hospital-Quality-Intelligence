-- Apply established response-code semantics only to 50 profiles whose 1/2/3 options
-- have clear metric polarity. 25.16 is deliberately excluded: its code-1 option includes
-- unresolved bleeding at referral, which conflicts with the measured outcome.
DO $coded_direction_fix$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_direction text;
  v_coded_options integer;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026
       AND status='published'
       AND is_active=true
       AND schema_json->>'indicator_direction' IS NULL
       AND code = ANY (ARRAY[
         '18.1','18.3','18.4','18.5','18.6',
         '19.1','19.10','19.2','19.3','19.4','19.5','19.7','19.8','19.9',
         '20.1','20.10','20.11','20.2','20.3','20.4','20.5','20.7','20.8','20.9',
         '22.1','22.2','22.3','22.6','22.7','22.8',
         '23.1','23.4','23.5','23.6','23.7',
         '25.1','25.11','25.12','25.13','25.14','25.15','25.17','25.18',
         '25.2','25.3','25.4','25.5','25.6','25.7','25.8'
       ]::text[])
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    IF jsonb_typeof(v_old.options_json) <> 'array' THEN
      RAISE EXCEPTION 'Profil % tidak memiliki array pilihan respons; arah otomatis dibatalkan.',v_old.code;
    END IF;

    SELECT count(*)
      INTO v_coded_options
      FROM jsonb_array_elements(v_old.options_json) AS item(opt)
     WHERE opt->>'code' IN ('1','2','3');

    IF v_coded_options = 0 THEN
      RAISE EXCEPTION 'Profil % tidak memiliki opsi kode 1/2/3; arah otomatis dibatalkan.',v_old.code;
    END IF;

    v_direction := CASE
      WHEN v_old.code = ANY(ARRAY['18.1','18.6','22.2','22.3','23.1']::text[])
        THEN 'negative'
      ELSE 'positive'
    END;

    v_schema := coalesce(v_old.schema_json,'{}'::jsonb)
      || jsonb_build_object('indicator_direction',v_direction);

    UPDATE aureka_quality.indicator_profiles
       SET status='retired',is_active=false
     WHERE id=v_old.id AND status='published' AND is_active=true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil % berubah selama koreksi arah indikator berkode; transaksi dibatalkan.',v_old.code;
    END IF;

    INSERT INTO aureka_quality.indicator_profiles (
      profile_year,code,room_id,unit_name,title,indicator_type,category,
      unit_of_measure,target_text,target_operator,target_value,
      numerator_definition,denominator_definition,measurement_grain,
      schema_json,options_json,version,status,is_active,created_by,updated_by
    )
    VALUES (
      v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
      v_old.indicator_type,v_old.category,v_old.unit_of_measure,v_old.target_text,
      v_old.target_operator,v_old.target_value,v_old.numerator_definition,
      v_old.denominator_definition,v_old.measurement_grain,v_schema,v_old.options_json,
      coalesce(v_old.version,1)+1,'published',true,v_old.created_by,v_old.updated_by
    );
    v_changed := v_changed + 1;
  END LOOP;

  -- Two additional empty-option assessment-validity profiles have unambiguous polarity.
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026
       AND status='published'
       AND is_active=true
       AND schema_json->>'indicator_direction' IS NULL
       AND code = ANY(ARRAY['24.10','27.12']::text[])
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb)
      || jsonb_build_object('indicator_direction','positive');

    UPDATE aureka_quality.indicator_profiles
       SET status='retired',is_active=false
     WHERE id=v_old.id AND status='published' AND is_active=true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil asesmen % berubah; transaksi dibatalkan.',v_old.code;
    END IF;

    INSERT INTO aureka_quality.indicator_profiles (
      profile_year,code,room_id,unit_name,title,indicator_type,category,
      unit_of_measure,target_text,target_operator,target_value,
      numerator_definition,denominator_definition,measurement_grain,
      schema_json,options_json,version,status,is_active,created_by,updated_by
    )
    VALUES (
      v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
      v_old.indicator_type,v_old.category,v_old.unit_of_measure,v_old.target_text,
      v_old.target_operator,v_old.target_value,v_old.numerator_definition,
      v_old.denominator_definition,v_old.measurement_grain,v_schema,v_old.options_json,
      coalesce(v_old.version,1)+1,'published',true,v_old.created_by,v_old.updated_by
    );
    v_changed := v_changed + 1;
  END LOOP;

  RAISE NOTICE 'Penetapan arah indikator dari pola opsi eksplisit menerbitkan % profil.',v_changed;
END
$coded_direction_fix$;