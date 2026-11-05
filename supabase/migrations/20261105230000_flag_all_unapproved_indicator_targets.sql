-- Flag every 2026 published active indicator without an approved numeric target.
-- This does not invent targets and does not change measurement records.
DO $flag_missing_targets$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026
       AND status='published'
       AND is_active=true
       AND target_value IS NULL
       AND (target_text IS NULL OR btrim(target_text)='')
       AND coalesce(schema_json->>'target_review_required','false') <> 'true'
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb)
      || jsonb_build_object(
        'target_review_required',true,
        'target_review_note','Target numerik belum ditetapkan atau belum tercantum dalam Kamus Indikator Mutu 2026; perlu pengesahan pemilik indikator sebelum evaluasi ketercapaian.'
      );

    UPDATE aureka_quality.indicator_profiles
       SET status='retired',is_active=false
     WHERE id=v_old.id AND status='published' AND is_active=true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil % berubah saat penandaan target belum disahkan; transaksi dibatalkan.',v_old.code;
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
    v_changed := v_changed+1;
  END LOOP;
  RAISE NOTICE 'Target belum disahkan ditandai pada % profil aktif 2026.',v_changed;
END
$flag_missing_targets$;