-- Reconcile explicit eligibility exclusions for selected maternal/neonatal indicators.
-- These are profile-only changes and do not rewrite existing quality observations.
DO $eligible_exclusions$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_options jsonb;
  v_schema jsonb;
  v_unit text;
  v_num text;
  v_den text;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026 AND status='published' AND is_active=true
       AND code IN ('19.10','19.2','20.2')
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_options := v_old.options_json;
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb);
    v_unit := 'Persentase (%)';
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;

    IF v_old.room_id=19 AND v_old.code='19.10' THEN
      -- This indicator assesses short post-elective-CS stay in uncomplicated cases.
      v_den := 'Jumlah seluruh pasien yang menjalani seksio sesarea elektif tanpa komplikasi ibu atau bayi yang memerlukan perawatan lanjutan pada periode pengukuran.';
      SELECT jsonb_agg(
        CASE
          WHEN opt->>'label' ILIKE '%Ada Komplikasi Ibu%' OR opt->>'label' ILIKE '%Kondisi Bayi Perlu Perawatan%' THEN
            opt || jsonb_build_object('denominator',false)
          ELSE opt
        END ORDER BY ord
      )
      INTO v_options
      FROM jsonb_array_elements(v_options) WITH ORDINALITY AS x(opt,ord);
    ELSIF v_old.room_id=19 AND v_old.code='19.2' THEN
      -- Eligibility requires a vigorous infant and a clinically stable mother without IMD contraindication.
      v_den := 'Jumlah seluruh persalinan seksio sesarea dengan bayi lahir bugar (APGAR menit pertama ≥ 7) dan ibu tidak memiliki kontraindikasi klinis terhadap inisiasi menyusu dini pada periode pengukuran.';
      SELECT jsonb_agg(
        CASE
          WHEN opt->>'label' ILIKE '%Kondisi Ibu Tidak Stabil%'
            OR opt->>'label' ILIKE '%Kondisi Bayi Asfiksia%' THEN
            opt || jsonb_build_object('denominator',false)
          ELSE opt
        END ORDER BY ord
      )
      INTO v_options
      FROM jsonb_array_elements(v_options) WITH ORDINALITY AS x(opt,ord);
    ELSIF v_old.room_id=20 AND v_old.code='20.2' THEN
      -- Babies breathing spontaneously and those managed under an explicit palliative/DNR plan are not eligible.
      v_num := 'Jumlah bayi baru lahir dengan asfiksia neonatorum yang memenuhi indikasi bantuan napas dan mendapatkan ventilator/CPAP sesuai keputusan klinis.';
      v_den := 'Jumlah bayi baru lahir dengan asfiksia neonatorum yang tidak bernapas spontan atau tidak memiliki usaha napas adekuat sehingga memenuhi indikasi ventilator/CPAP menurut penilaian klinis dan protokol resusitasi.';
      SELECT jsonb_agg(
        CASE
          WHEN opt->>'label' ILIKE '%Bayi Bernafas Spontan%'
            OR opt->>'label' ILIKE '%DNR/Palliative Care%' THEN
            opt || jsonb_build_object('denominator',false)
          ELSE opt
        END ORDER BY ord
      )
      INTO v_options
      FROM jsonb_array_elements(v_options) WITH ORDINALITY AS x(opt,ord);
    END IF;

    v_schema := v_schema || jsonb_build_object('measurement_type','compliance');

    IF v_options IS DISTINCT FROM v_old.options_json
       OR v_schema IS DISTINCT FROM coalesce(v_old.schema_json,'{}'::jsonb)
       OR v_unit IS DISTINCT FROM v_old.unit_of_measure
       OR v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah saat rekonsiliasi eligibility; transaksi dibatalkan.',v_old.code;
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
  RAISE NOTICE 'Perbaikan denominator eligible menerbitkan % profil baru.',v_changed;
END
$eligible_exclusions$;