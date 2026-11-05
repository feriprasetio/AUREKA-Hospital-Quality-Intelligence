-- Correct static direction inference in the 2026 metadata audit.
-- The profile code already includes the room prefix (e.g. code = '14.5').
-- Only profiles with no response options are assigned here; coded/ambiguous profiles retain legacy mapping.

DO $direction_fix$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_direction text;
  v_options_count integer;
  v_updated integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026
       AND status='published'
       AND is_active=true
       AND schema_json->>'indicator_direction' IS NULL
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    SELECT count(*)
      INTO v_options_count
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_old.options_json)='array'
             THEN v_old.options_json ELSE '[]'::jsonb END
      ) AS item(opt);

    IF v_options_count <> 0 THEN
      CONTINUE;
    END IF;

    v_direction := NULL;

    IF v_old.code = ANY (ARRAY[
      '11.1',
      '14.5','14.6','14.8',
      '15.1','16.1','17.1',
      '18.3','18.4',
      '19.5','19.7','19.8',
      '20.7','20.8','20.9',
      '21.1',
      '22.1','22.6','22.7',
      '23.4','23.5','23.6',
      '24.1','24.2','24.3','24.4','24.7','24.8','24.9',
      '25.5','25.6','25.8','25.11','25.12','25.16','25.17',
      '26.15','26.16',
      '27.2','27.3','27.4','27.5','27.8','27.9',
      '28.1',
      '30.1','30.2','30.3','30.5',
      '31.1','32.1',
      '34.2','34.3','34.4','34.5','34.6',
      '35.1','35.2','36.1',
      '37.4','37.5','37.6','37.7','37.8'
    ]::text[]) THEN
      v_direction := 'positive';
    ELSIF v_old.code = ANY (ARRAY[
      '14.7','14.9','18.6','22.2','23.1','27.1','27.10',
      '29.2','30.4','37.1','37.9'
    ]::text[]) THEN
      v_direction := 'negative';
    END IF;

    IF v_direction IS NULL THEN
      CONTINUE;
    END IF;

    v_schema := coalesce(v_old.schema_json,'{}'::jsonb)
      || jsonb_build_object('indicator_direction',v_direction);

    UPDATE aureka_quality.indicator_profiles
       SET status='retired', is_active=false
     WHERE id=v_old.id AND status='published' AND is_active=true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil % berubah selama koreksi arah indikator; transaksi dibatalkan.',v_old.code;
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

    v_updated := v_updated + 1;
  END LOOP;

  RAISE NOTICE 'Koreksi arah indikator tanpa opsi menerbitkan % versi profil.',v_updated;
END
$direction_fix$;