-- Convert explicit clinical denominator exclusions into a dedicated eligibility attribute.
-- Restore denominator=true on master options so legacy flags cannot override approved 1/2/3 semantics.
DO $eligibility_flags$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_options jsonb;
  v_schema jsonb;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026 AND status='published' AND is_active=true
       AND (room_id,code) IN ((19,'19.10'),(19,'19.2'),(20,'20.2'))
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_options := (
      SELECT jsonb_agg(
        CASE
          WHEN opt->>'denominator'='false' THEN
            (opt - 'denominator') || jsonb_build_object(
              'denominator',true,
              'eligible',false
            )
          ELSE opt
        END ORDER BY ord
      )
      FROM jsonb_array_elements(v_old.options_json) WITH ORDINALITY AS x(opt,ord)
    );

    IF v_options IS DISTINCT FROM v_old.options_json THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah selama koreksi eligibility; transaksi dibatalkan.',v_old.code;
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
        v_old.denominator_definition,v_old.measurement_grain,
        coalesce(v_old.schema_json,'{}'::jsonb),v_options,
        coalesce(v_old.version,1)+1,'published',true,v_old.created_by,v_old.updated_by
      );
      v_changed := v_changed+1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Dedicated clinical eligibility flags published on % indicator profiles.',v_changed;
END
$eligibility_flags$;