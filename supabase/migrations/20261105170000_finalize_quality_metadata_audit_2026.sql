-- Final metadata reconciliation for the 2026 quality indicator register.
-- Versioned profile changes only; no existing patient/quality records are rewritten.

DO $final_metadata$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_options jsonb;
  v_unit text;
  v_target_text text;
  v_target_operator text;
  v_target_value numeric;
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
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb);
    v_options := coalesce(v_old.options_json,'[]'::jsonb);
    v_unit := v_old.unit_of_measure;
    v_target_text := v_old.target_text;
    v_target_operator := v_old.target_operator;
    v_target_value := v_old.target_value;
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;

    -- Any published choice list is a categorical response contract.
    -- Make this explicit so keywords such as "waktu" or "visite" in titles
    -- cannot cause the measurement engine to interpret an option response as minutes.
    IF jsonb_typeof(v_options)='array' AND jsonb_array_length(v_options)>0
       AND nullif(btrim(coalesce(v_schema->>'measurement_type','')),'') IS NULL THEN
      v_schema := v_schema || jsonb_build_object('measurement_type','compliance');
    END IF;

    -- Explicit N/D profiles without response options are proportion indicators.
    -- Only assign this when direction and both definitions are already established.
    IF jsonb_typeof(v_options)='array' AND jsonb_array_length(v_options)=0
       AND v_schema->>'indicator_direction' IN ('positive','negative')
       AND nullif(btrim(coalesce(v_num,'')),'') IS NOT NULL
       AND nullif(btrim(coalesce(v_den,'')),'') IS NOT NULL
       AND nullif(btrim(coalesce(v_schema->>'measurement_type','')),'') IS NULL THEN
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio');
    END IF;

    -- Percentage units are inferred only for defined categorical/proportion indicators.
    IF nullif(btrim(coalesce(v_unit,'')),'') IS NULL
       AND v_schema->>'measurement_type' IN ('compliance','ratio')
       AND v_schema->>'indicator_direction' IN ('positive','negative')
       AND nullif(btrim(coalesce(v_num,'')),'') IS NOT NULL
       AND nullif(btrim(coalesce(v_den,'')),'') IS NOT NULL THEN
      v_unit := 'Persentase (%)';
    END IF;

    -- Room 10.1: the three options clearly distinguish no shortage from a shortage event.
    -- Previous master incorrectly assigned code 1 to every response.
    IF v_old.room_id=10 AND v_old.code='10.1' THEN
      v_options := (
        SELECT jsonb_agg(
          CASE
            WHEN opt->>'label'='Pasien Dirawat Tanpa Kendala' THEN
              jsonb_build_object('code',1,'label',opt->>'label','numerator',false,'denominator',true,'review_required',false)
            WHEN opt->>'label'='Pasien Dirawat Dengan Kekosongan BHP' THEN
              jsonb_build_object('code',3,'label',opt->>'label','numerator',true,'denominator',true,'review_required',false)
            WHEN opt->>'label'='Pasien Dirawat Dengan Kendala Penunjang Lainnya' THEN
              jsonb_build_object('code',3,'label',opt->>'label','numerator',true,'denominator',true,'review_required',false)
            ELSE opt
          END ORDER BY ord
        )
        FROM jsonb_array_elements(v_options) WITH ORDINALITY AS x(opt,ord)
      );
      IF (SELECT count(*) FROM jsonb_array_elements(v_options) opt WHERE opt->>'code'='1')<>1
         OR (SELECT count(*) FROM jsonb_array_elements(v_options) opt WHERE opt->>'code'='3')<>2 THEN
        RAISE EXCEPTION 'Koreksi opsi 10.1 gagal menghasilkan satu kondisi aman dan dua kondisi kendala.';
      END IF;

      v_schema := v_schema || jsonb_build_object(
        'indicator_direction','negative',
        'measurement_type','compliance'
      );
      v_unit := 'Persentase (%)';
      v_num := 'Jumlah pasien radiologi yang mengalami kendala kekosongan BHP atau barang penunjang perawatan pada periode pengukuran.';
      v_den := 'Jumlah seluruh pasien yang mendapatkan pelayanan di Instalasi Radiologi pada periode pengukuran.';
    END IF;

    -- Official 2026 INM definition: clinical-pathway compliance target is >80%.
    -- The response list remains categorical; code 1/2/3 is interpreted by the positive direction.
    IF v_old.room_id=25 AND v_old.code='25.13' THEN
      v_target_text := '> 80%';
      v_target_operator := '>';
      v_target_value := 80;
      v_unit := 'Persentase (%)';
      v_schema := v_schema || jsonb_build_object(
        'indicator_direction','positive',
        'measurement_type','compliance'
      );
    END IF;

    IF v_schema IS DISTINCT FROM coalesce(v_old.schema_json,'{}'::jsonb)
       OR v_options IS DISTINCT FROM v_old.options_json
       OR v_unit IS DISTINCT FROM v_old.unit_of_measure
       OR v_target_text IS DISTINCT FROM v_old.target_text
       OR v_target_operator IS DISTINCT FROM v_old.target_operator
       OR v_target_value IS DISTINCT FROM v_old.target_value
       OR v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah saat rekonsiliasi final; transaksi dibatalkan.',v_old.code;
      END IF;

      INSERT INTO aureka_quality.indicator_profiles (
        profile_year,code,room_id,unit_name,title,indicator_type,category,
        unit_of_measure,target_text,target_operator,target_value,
        numerator_definition,denominator_definition,measurement_grain,
        schema_json,options_json,version,status,is_active,created_by,updated_by
      )
      VALUES (
        v_old.profile_year,v_old.code,v_old.room_id,v_old.unit_name,v_old.title,
        v_old.indicator_type,v_old.category,v_unit,v_target_text,v_target_operator,
        v_target_value,v_num,v_den,v_old.measurement_grain,
        v_schema,v_options,coalesce(v_old.version,1)+1,'published',true,
        v_old.created_by,v_old.updated_by
      );
      v_changed := v_changed+1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Rekonsiliasi final metadata 2026 menerbitkan % profil baru.',v_changed;
END
$final_metadata$;