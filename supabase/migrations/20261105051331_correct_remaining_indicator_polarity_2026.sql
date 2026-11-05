-- Apply explicit polarity to profiles where the coded response options and target clearly establish
-- an adverse-event/positive-compliance metric, following AUREKA's universal 1/2/3 semantics.
-- No quality_records rows are modified.

DO $polarity_fix$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_options jsonb;
  v_direction text;
  v_unit text;
  v_num text;
  v_den text;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026
       AND status='published'
       AND is_active=true
       AND code = ANY(ARRAY[
         '1.2','3.1','4.3','4.5','5.1','5.2','5.3','5.4','5.5',
         '6.1','6.4','6.6','8.1','8.3','9.2','9.3','10.2','10.3',
         '10.4','12.2','13.1','13.2','14.7'
       ]::text[])
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb);
    v_options := coalesce(v_old.options_json,'[]'::jsonb);
    v_unit := v_old.unit_of_measure;
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;

    v_direction := CASE
      WHEN v_old.code IN ('5.3','5.4','5.5') THEN 'positive'
      ELSE 'negative'
    END;
    v_schema := v_schema || jsonb_build_object('indicator_direction',v_direction);

    -- All 1.2/3.1/4.3/4.5/5.1/6.1/6.4/6.6/8.1/8.3/9.2/9.3/10.2/10.3/10.4/12.2/13.1/13.2
    -- profiles use explicit categorical response options.
    IF v_old.code = ANY(ARRAY[
      '1.2','3.1','4.3','4.5','5.1','6.1','6.4','6.6','8.1','8.3',
      '9.2','9.3','10.2','10.3','10.4','12.2','13.1','13.2'
    ]::text[]) THEN
      IF jsonb_typeof(v_options) <> 'array' OR jsonb_array_length(v_options)=0 THEN
        RAISE EXCEPTION 'Profil opsi % tidak memiliki master respons; koreksi polaritas dibatalkan.',v_old.code;
      END IF;
      v_schema := v_schema || jsonb_build_object('measurement_type','compliance');
    END IF;

    -- Pharmacy metrics 5.2-5.5 have explicit N/D definitions but only a placeholder "Lainnya"
    -- option; classify them as ratios so the placeholder cannot block the metric calculation.
    IF v_old.code = ANY(ARRAY['5.2','5.3','5.4','5.5']::text[]) THEN
      IF nullif(btrim(coalesce(v_num,'')),'') IS NULL
         OR nullif(btrim(coalesce(v_den,'')),'') IS NULL THEN
        RAISE EXCEPTION 'Profil farmasi % tidak memiliki numerator/denominator lengkap.',v_old.code;
      END IF;
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio');
    END IF;

    -- Correct the denominator for communication problems to all patients treated in the unit.
    IF v_old.room_id=14 AND v_old.code='14.7' THEN
      v_den := 'Jumlah seluruh pasien yang dirawat di unit pada periode pengukuran.';
      IF jsonb_typeof(v_options)='array' AND jsonb_array_length(v_options)=0 THEN
        v_schema := v_schema || jsonb_build_object('measurement_type','ratio');
      ELSE
        v_schema := v_schema || jsonb_build_object('measurement_type','compliance');
      END IF;
    END IF;

    -- An unplanned ICU transfer is the adverse outcome regardless of whether its cause is
    -- judged avoidable; the existing response categories preserve cause for stratified review.
    IF v_old.room_id=4 AND v_old.code='4.5' THEN
      v_num := 'Jumlah pasien operasi dengan rencana awal perawatan pascaoperasi di ruang rawat biasa yang mengalami transfer tidak terencana ke ICU pada periode pengukuran.';
      v_den := 'Jumlah seluruh pasien operasi dengan rencana awal perawatan pascaoperasi di ruang rawat biasa pada periode pengukuran.';
    END IF;

    -- Remove spreadsheet header tokens accidentally embedded in source definitions.
    IF v_num IS NOT NULL THEN
      v_num := btrim(regexp_replace(v_num,'[[:space:]]*Definisi Operasional[[:space:]]*',' ','gi'));
    END IF;
    IF v_den IS NOT NULL THEN
      v_den := btrim(regexp_replace(v_den,'[[:space:]]*Definisi Operasional[[:space:]]*',' ','gi'));
    END IF;

    -- Strip appended unit annotations without altering the underlying measurement unit.
    IF v_unit ILIKE 'Persentase (%)%' THEN
      v_unit := 'Persentase (%)';
    END IF;

    IF v_schema IS DISTINCT FROM coalesce(v_old.schema_json,'{}'::jsonb)
       OR v_unit IS DISTINCT FROM v_old.unit_of_measure
       OR v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah saat koreksi polaritas; transaksi dibatalkan.',v_old.code;
      END IF;
      INSERT INTO aureka_quality.indicator_profiles (
        profile_year,code,room_id,unit_name,title,indicator_type,category,
        unit_of_measure,target_text,target_operator,target_value,
        numerator_definition,denominator_definition,measurement_grain,
        schema_json,options_json,version,status,is_active,created_by,updated_by
      )
      VALUES (
        v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
        v_old.indicator_type,v_old.category,v_unit,v_old.target_text,v_old.target_operator,
        v_old.target_value,v_num,v_den,v_old.measurement_grain,
        v_schema,v_options,coalesce(v_old.version,1)+1,'published',true,
        v_old.created_by,v_old.updated_by
      );
      v_changed := v_changed+1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Koreksi polaritas dan pemetaan mesin indikator menerbitkan % profil.',v_changed;
END
$polarity_fix$;