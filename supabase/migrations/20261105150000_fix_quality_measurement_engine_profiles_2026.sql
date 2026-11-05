-- Correct the 2026 measurement-engine contract for ratio, response-option and visit indicators.
-- This migration changes only published profile versions; it does not update historical quality_records.

DO $engine_audit$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_options jsonb;
  v_target_text text;
  v_target_operator text;
  v_target_value numeric;
  v_unit text;
  v_num text;
  v_den text;
  v_direction text;
  v_changed integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year=2026
       AND status='published'
       AND is_active=true
       AND code = ANY(ARRAY[
         '14.5','14.6','14.8','14.9','15.1','16.1','21.1',
         '24.1','24.2','24.3','24.4','24.7','24.9','24.10',
         '26.15','27.1','27.5','27.8','28.1','29.1','29.2',
         '30.4','30.5','31.1','32.1','34.2','34.3','34.4','34.5','34.6',
         '35.1','35.2','36.1','37.4','37.5','37.7','37.8',
         '14.4','18.4','19.8','20.8','22.7','23.5','25.12','26.7',
         '24.8','27.9','37.6','6.3','6.7','37.9'
       ]::text[])
     ORDER BY room_id,code
     FOR UPDATE
  LOOP
    v_schema := coalesce(v_old.schema_json,'{}'::jsonb);
    v_options := coalesce(v_old.options_json,'[]'::jsonb);
    v_target_text := v_old.target_text;
    v_target_operator := v_old.target_operator;
    v_target_value := v_old.target_value;
    v_unit := v_old.unit_of_measure;
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;
    v_direction := nullif(lower(btrim(v_schema->>'indicator_direction')),'');

    -- Explicitly model ratios when the profile has no categorical option master
    -- and its numerator/denominator definitions are complete and the construct is a proportion.
    IF v_old.code = ANY(ARRAY[
      '14.5','14.6','14.8','14.9','15.1','16.1','21.1',
      '24.1','24.2','24.3','24.4','24.7','24.9','24.10',
      '26.15','27.1','27.5','27.8','28.1','29.1','29.2',
      '30.4','30.5','31.1','32.1','34.2','34.3','34.4','34.5','34.6',
      '35.1','35.2','36.1','37.4','37.5','37.7','37.8'
    ]::text[]) THEN
      IF jsonb_typeof(v_options) <> 'array' OR jsonb_array_length(v_options) <> 0
         OR nullif(btrim(coalesce(v_num,'')),'') IS NULL
         OR nullif(btrim(coalesce(v_den,'')),'') IS NULL
         OR v_direction NOT IN ('positive','negative') THEN
        RAISE EXCEPTION 'Profil rasio % tidak memenuhi prasyarat tipe pengukuran yang eksplisit.',v_old.code;
      END IF;
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio');
      IF nullif(btrim(coalesce(v_unit,'')),'') IS NULL THEN
        v_unit := 'Persentase (%)';
      END IF;
    END IF;

    -- Official PMK definition for fall-prevention compliance: all three preventive actions.
    IF v_old.room_id=14 AND v_old.code='14.6' THEN
      v_target_text := '= 100%';
      v_target_operator := '=';
      v_target_value := 100;
      v_unit := 'Persentase (%)';
      v_num := 'Jumlah pasien rawat inap berisiko tinggi jatuh yang mendapatkan ketiga upaya pencegahan risiko jatuh: asesmen awal risiko jatuh, asesmen ulang risiko jatuh, dan intervensi pencegahan jatuh.';
      v_den := 'Jumlah pasien rawat inap berisiko tinggi jatuh yang diobservasi.';
      v_schema := v_schema || jsonb_build_object('measurement_type','ratio','indicator_direction','positive');
    END IF;

    -- Kemenkes 2026 INM: emergency category-1 Caesarean decision-to-incision <=30 minutes,
    -- target >80%. This is a compliance proportion, not a continuous average in minutes.
    IF v_old.room_id=37 AND v_old.code='37.9' THEN
      v_target_text := '> 80% (kategori 1: keputusan operasi sampai insisi ≤ 30 menit)';
      v_target_operator := '>';
      v_target_value := 80;
      v_unit := 'Persentase (%)';
      v_num := 'Jumlah pasien yang diputuskan menjalani seksio sesarea emergensi kategori 1 dan mendapatkan insisi dalam waktu ≤ 30 menit sejak keputusan operasi.';
      v_den := 'Jumlah seluruh pasien yang diputuskan menjalani seksio sesarea emergensi kategori 1 pada periode pengukuran.';
      v_direction := 'positive';
      v_schema := v_schema || jsonb_build_object(
        'measurement_type','ratio',
        'indicator_direction','positive',
        'time_threshold_minutes',30,
        'time_origin','keputusan_operasi',
        'time_endpoint','insisi',
        'emergency_category',1
      );
    END IF;

    -- These indicators are captured as categorical response options. Their titles must not
    -- force the engine down the continuous minutes/time-window path.
    IF v_old.room_id=6 AND v_old.code IN ('6.3','6.7') THEN
      v_schema := v_schema || jsonb_build_object('measurement_type','compliance');
    END IF;
    IF v_old.room_id=6 AND v_old.code='6.3' THEN
      v_num := 'Jumlah pasien yang mendapatkan respons DPJP on-call dalam waktu ≤ 30 menit sejak konsultasi.';
      v_den := 'Jumlah seluruh pasien yang dikonsulkan kepada DPJP pada periode pengukuran.';
      v_direction := 'positive';
      v_schema := v_schema || jsonb_build_object('indicator_direction','positive');
    ELSIF v_old.room_id=6 AND v_old.code='6.7' THEN
      v_num := 'Jumlah pasien IGD yang memperoleh pelayanan dokter dalam batas waktu sesuai kategori triase: merah/resusitasi 0–5 menit, kuning/urgen < 30 menit, dan hijau/tidak gawat < 60 menit.';
      v_den := 'Jumlah seluruh pasien gawat darurat yang dijadikan sampel observasi pada periode pengukuran.';
    END IF;

    -- Visit profiles with coded source options are categorical responses, not free-text time values.
    IF v_old.code = ANY(ARRAY['18.4','19.8','20.8','22.7','23.5','25.12']::text[]) THEN
      v_schema := v_schema || jsonb_build_object('measurement_type','compliance');
      IF v_direction IS NULL THEN
        v_schema := v_schema || jsonb_build_object('indicator_direction','positive');
      END IF;
    END IF;

    -- Normalize two legacy visit masters whose response codes incorrectly mark every choice as success.
    -- Match by the option label: within 06:00-14:00 = code 1; late/no visit = code 3;
    -- weekend/alternate provider/other = null pending review and excluded from N/D.
    IF v_old.room_id IN (14,26) AND v_old.code IN ('14.4','26.7') THEN
      IF jsonb_typeof(v_options) <> 'array' OR jsonb_array_length(v_options) <> 6 THEN
        RAISE EXCEPTION 'Master opsi visite % tidak berisi enam pilihan yang diharapkan.',v_old.code;
      END IF;
      SELECT jsonb_agg(
        jsonb_build_object(
          'code', CASE
            WHEN lower(coalesce(opt->>'label','')) LIKE '%06.00-14.00%' THEN 1
            WHEN lower(coalesce(opt->>'label','')) LIKE '%diatas 14.00%' THEN 3
            WHEN lower(coalesce(opt->>'label','')) LIKE '%tidak visite%' THEN 3
            ELSE NULL
          END,
          'label', opt->>'label',
          'numerator', NULL,
          'denominator', true,
          'review_required', true
        ) ORDER BY ord
      )
      INTO v_options
      FROM jsonb_array_elements(v_options) WITH ORDINALITY AS x(opt,ord);

      IF (SELECT count(*) FROM jsonb_array_elements(v_options) e
           WHERE e->>'code'='1') <> 1
         OR (SELECT count(*) FROM jsonb_array_elements(v_options) e
              WHERE e->>'code'='3') <> 2 THEN
        RAISE EXCEPTION 'Pemetaan ulang opsi visite % tidak menghasilkan kode sukses dan gagal yang unik.',v_old.code;
      END IF;
      v_schema := v_schema || jsonb_build_object(
        'measurement_type','compliance',
        'indicator_direction','positive'
      );
      v_direction := 'positive';
    END IF;

    -- Free-time visit profiles use the 06:00–14:00 official window documented in their N/D text.
    IF v_old.code = ANY(ARRAY['24.8','27.9','37.6']::text[]) THEN
      v_schema := v_schema || jsonb_build_object(
        'measurement_type','visit',
        'target_start_time','06:00',
        'target_end_time','14:00',
        'indicator_direction','positive'
      );
    END IF;

    -- Clean the accidentally imported spreadsheet header token from this explicit numerator.
    IF v_num IS NOT NULL THEN
      v_num := btrim(regexp_replace(v_num, '[[:space:]]*Definisi Operasional[[:space:]]*', ' ', 'gi'));
    END IF;

    IF v_schema IS DISTINCT FROM coalesce(v_old.schema_json,'{}'::jsonb)
       OR v_target_text IS DISTINCT FROM v_old.target_text
       OR v_target_operator IS DISTINCT FROM v_old.target_operator
       OR v_target_value IS DISTINCT FROM v_old.target_value
       OR v_unit IS DISTINCT FROM v_old.unit_of_measure
       OR v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition
       OR v_options IS DISTINCT FROM v_old.options_json THEN
      UPDATE aureka_quality.indicator_profiles
         SET status='retired',is_active=false
       WHERE id=v_old.id AND status='published' AND is_active=true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah selama audit mesin ukur; transaksi dibatalkan.',v_old.code;
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
  RAISE NOTICE 'Rekonsiliasi mesin ukur menerbitkan % versi profil baru.',v_changed;
END
$engine_audit$;