-- 2026 indicator metadata audit: safe directional inference, literal target normalization,
-- clear duplicate-definition reconciliation, and narrowly bounded corrections.
-- All profile mutations are versioned; historical profile versions and quality records are retained.

DO $audit$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_direction text;
  v_c1 integer;
  v_c23 integer;
  v_c1_true boolean;
  v_c1_false boolean;
  v_c23_true boolean;
  v_c23_false boolean;
  v_option_count integer;
  v_target_text text;
  v_target_operator text;
  v_target_value numeric;
  v_unit text;
  v_num text;
  v_den text;
  v_match text[];
  v_key text;
  v_changed boolean;
  v_updated integer := 0;
BEGIN
  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year = 2026
       AND status = 'published'
       AND is_active = true
     ORDER BY room_id, code
     FOR UPDATE
  LOOP
    v_schema := coalesce(v_old.schema_json, '{}'::jsonb);
    v_direction := nullif(lower(btrim(v_schema->>'indicator_direction')), '');
    v_target_text := v_old.target_text;
    v_target_operator := v_old.target_operator;
    v_target_value := v_old.target_value;
    v_unit := v_old.unit_of_measure;
    v_num := v_old.numerator_definition;
    v_den := v_old.denominator_definition;
    v_key := v_old.room_id::text || '.' || v_old.code;
    v_changed := false;

    -- Infer polarity only where all coded numerator flags exactly match code 1 vs codes 2/3.
    SELECT
      count(*) FILTER (WHERE opt->>'code' = '1'),
      count(*) FILTER (WHERE opt->>'code' IN ('2','3')),
      bool_and((opt->>'numerator') = 'true') FILTER (WHERE opt->>'code' = '1'),
      bool_and((opt->>'numerator') = 'false') FILTER (WHERE opt->>'code' = '1'),
      bool_and((opt->>'numerator') = 'true') FILTER (WHERE opt->>'code' IN ('2','3')),
      bool_and((opt->>'numerator') = 'false') FILTER (WHERE opt->>'code' IN ('2','3')),
      count(*)
    INTO v_c1, v_c23, v_c1_true, v_c1_false, v_c23_true, v_c23_false, v_option_count
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_old.options_json) = 'array'
           THEN v_old.options_json ELSE '[]'::jsonb END
    ) AS item(opt);

    IF v_direction IS NULL AND v_c1 > 0 AND v_c23 > 0
       AND v_c1_true IS TRUE AND v_c23_false IS TRUE THEN
      v_direction := 'positive';
    ELSIF v_direction IS NULL AND v_c1 > 0 AND v_c23 > 0
       AND v_c1_false IS TRUE AND v_c23_true IS TRUE THEN
      v_direction := 'negative';
    END IF;

    -- For profiles without categorical response options, assign polarity only where
    -- the numerator/title gives a clear favorable or adverse construct.
    IF v_direction IS NULL AND v_option_count = 0 THEN
      IF v_key = ANY (ARRAY[
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
      ELSIF v_key = ANY (ARRAY[
        '14.7','14.9','18.6','22.2','23.1','27.1','27.10',
        '29.2','30.4','37.1','37.9'
      ]::text[]) THEN
        v_direction := 'negative';
      END IF;
    END IF;

    IF v_direction IN ('positive','negative')
       AND v_schema->>'indicator_direction' IS DISTINCT FROM v_direction THEN
      v_schema := v_schema || jsonb_build_object('indicator_direction', v_direction);
    END IF;

    -- Correct three clearly identified missing/placeholder targets from the agreed
    -- hospital indicator specifications and fix the reversed event-rate threshold.
    IF v_old.room_id = 14 AND v_old.code = '14.5' THEN
      v_target_text := '100% — seluruh petugas patuh menggunakan APD sesuai indikasi';
      v_target_operator := '=';
      v_target_value := 100;
      v_unit := 'Persentase (%)';
    ELSIF v_old.room_id = 16 AND v_old.code = '16.1' THEN
      v_target_text := '≥ 85%';
      v_target_operator := '>=';
      v_target_value := 85;
      v_unit := 'Persentase (%)';
    ELSIF v_old.room_id = 6 AND v_old.code = '6.7' THEN
      v_target_text := '= 100% — pasien gawat darurat memperoleh pelayanan dokter ≤ 5 menit';
      v_target_operator := '=';
      v_target_value := 100;
      v_unit := 'Persentase (%)';
    ELSIF v_old.room_id = 14 AND v_old.code = '14.7' THEN
      v_target_text := '≤ 5%';
      v_target_operator := '<=';
      v_target_value := 5;
      v_unit := 'Persentase (%)';
    END IF;

    -- Parse numeric targets only from an explicit leading percentage expression.
    -- Placeholder entries saying "Target dikaji secara absolut" are intentionally excluded.
    v_match := regexp_match(
      coalesce(v_target_text, ''),
      '^[[:space:]]*(≥|<=|>=|≤|=|>|<)?[[:space:]]*([0-9]+([.][0-9]+)?)[[:space:]]*%'
    );
    IF v_target_value IS NULL
       AND v_match IS NOT NULL
       AND position('Target dikaji' in coalesce(v_target_text, '')) = 0
       AND v_key <> '27.11' THEN
      v_target_value := v_match[2]::numeric;
    END IF;

    -- Derive the unit only when the target itself explicitly starts as a percentage.
    -- Index 17.1 and the contradictory 27.11 profile are deliberately left for review.
    IF v_unit IS NULL
       AND v_match IS NOT NULL
       AND position('Target dikaji' in coalesce(v_target_text, '')) = 0
       AND v_key NOT IN ('17.1','27.11') THEN
      v_unit := 'Persentase (%)';
    END IF;

    -- Correct target semantics for "Kelengkapan Assessment Pengantar Transfer Pasien dari IGD".
    -- The same indicator is used in 11 units; use one consistent numerator/denominator pair.
    IF v_old.title = 'Kelengkapan Assessment Pengantar Transfer Pasien dari IGD' THEN
      v_num := 'Jumlah pasien yang ditransfer dari IGD dengan assessment pengantar transfer yang terisi lengkap sesuai standar.';
      v_den := 'Jumlah seluruh pasien yang ditransfer dari IGD pada periode pengukuran.';
    END IF;

    -- Definitions that are directly recoverable from the indicator name and its existing
    -- inclusion/denominator text. Do not invent clinical thresholds or eligibility rules.
    IF v_old.room_id = 29 AND v_old.code = '29.1'
       AND nullif(btrim(coalesce(v_num,'')), '') IS NULL THEN
      v_num := 'Jumlah laporan insiden keselamatan pasien yang disampaikan sesuai batas waktu yang ditetapkan.';
    ELSIF v_old.room_id = 29 AND v_old.code = '29.2' THEN
      v_num := 'Jumlah insiden keselamatan pasien yang berkaitan dengan kegagalan identifikasi pasien.';
      v_den := 'Jumlah seluruh laporan insiden keselamatan pasien yang diterima pada periode pengukuran.';
    ELSIF v_old.room_id = 14 AND v_old.code = '14.9' THEN
      v_den := 'Jumlah seluruh pasien yang selesai menjalani perawatan dan keluar dari ICU pada periode pengukuran.';
    ELSIF v_old.room_id = 18 AND v_old.code = '18.6' THEN
      v_den := 'Jumlah seluruh pasien yang selesai menjalani perawatan dan keluar dari NICU pada periode pengukuran.';
    ELSIF v_old.room_id = 23 AND v_old.code = '23.1' THEN
      v_num := 'Jumlah pasien yang jadwal operasinya dibatalkan karena perburukan kondisi klinis sebelum operasi.';
      v_den := 'Jumlah seluruh pasien yang dijadwalkan menjalani operasi pada periode pengukuran.';
    ELSIF v_old.room_id = 27 AND v_old.code = '27.1'
       AND nullif(btrim(coalesce(v_num,'')), '') IS NULL THEN
      v_num := 'Jumlah pasien operasi katarak atau trauma mata yang mengalami hifema pada periode pengukuran.';
    ELSIF v_old.room_id = 28 AND v_old.code = '28.1' THEN
      v_num := 'Jumlah rekomendasi hasil audit internal yang telah selesai ditindaklanjuti (status closed) pada batas waktu yang ditetapkan.';
      v_den := 'Jumlah seluruh rekomendasi hasil audit internal yang jatuh tempo penyelesaiannya pada periode pengukuran.';
    ELSIF v_old.room_id = 31 AND v_old.code = '31.1' THEN
      v_den := 'Jumlah seluruh pasien HIV yang memenuhi jadwal kontrol ARV bulanan pada periode pengukuran.';
    ELSIF v_old.room_id = 32 AND v_old.code = '32.1' THEN
      v_num := 'Jumlah ibu bersalin yang menjadi akseptor kontrasepsi pascapersalinan sebelum pulang dari rumah sakit.';
      v_den := 'Jumlah seluruh ibu bersalin yang memenuhi kriteria inklusi program KB pascapersalinan pada periode pengukuran.';
    ELSIF v_old.room_id = 34 AND v_old.code = '34.3' THEN
      v_num := 'Jumlah pasien Ca Mammae baru atau pascaoperasi pengangkatan tumor yang menjalani pemeriksaan imunohistokimia ER, PR, HER2, dan Ki-67.';
    ELSIF v_old.room_id = 34 AND v_old.code = '34.5' THEN
      v_num := 'Jumlah pasien pascaoperasi Ca Mammae yang memiliki catatan follow-up pada jadwal 3 bulan, 6 bulan, dan 1 tahun pertama sesuai masa observasi.';
    ELSIF v_old.room_id = 34 AND v_old.code = '34.6' THEN
      v_num := 'Jumlah pasien pascamastektomi yang tidak mengalami limfedema pada sisi operasi saat evaluasi.';
    ELSIF v_old.room_id = 35 AND v_old.code = '35.1' THEN
      v_den := 'Jumlah seluruh pasien yang memulai terapi antibiotik pada periode pengukuran.';
    ELSIF v_old.room_id = 35 AND v_old.code = '35.2' THEN
      v_den := 'Jumlah seluruh pasien yang menerima terapi antibiotik dan dinilai ketepatan penggunaannya pada periode pengukuran.';
    ELSIF v_old.room_id = 36 AND v_old.code = '36.1' THEN
      v_den := 'Jumlah seluruh pasien yang teridentifikasi sebagai pasien high risk dan high cost pada periode pengukuran.';
    ELSIF v_old.room_id = 37 AND v_old.code = '37.5' THEN
      v_num := 'Jumlah persalinan pervaginam yang memasuki fase aktif dengan partograf terisi lengkap sesuai standar.';
    ELSIF v_old.room_id = 37 AND v_old.code = '37.7' THEN
      v_den := 'Jumlah seluruh instruksi dan arahan atasan yang wajib dilaksanakan oleh petugas pada periode pengukuran.';
    END IF;

    IF v_direction IS DISTINCT FROM nullif(lower(btrim(coalesce(v_schema->>'indicator_direction',''))), '')
       OR v_target_text IS DISTINCT FROM v_old.target_text
       OR v_target_operator IS DISTINCT FROM v_old.target_operator
       OR v_target_value IS DISTINCT FROM v_old.target_value
       OR v_unit IS DISTINCT FROM v_old.unit_of_measure
       OR v_num IS DISTINCT FROM v_old.numerator_definition
       OR v_den IS DISTINCT FROM v_old.denominator_definition
       OR v_schema IS DISTINCT FROM coalesce(v_old.schema_json, '{}'::jsonb) THEN
      v_changed := true;
    END IF;

    IF v_changed THEN
      UPDATE aureka_quality.indicator_profiles
         SET status = 'retired',
             is_active = false
       WHERE id = v_old.id
         AND status = 'published'
         AND is_active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil % berubah selama audit; migrasi dibatalkan.', v_old.code;
      END IF;

      INSERT INTO aureka_quality.indicator_profiles (
        profile_year, code, room_id, unit_name, title, indicator_type, category,
        unit_of_measure, target_text, target_operator, target_value,
        numerator_definition, denominator_definition, measurement_grain,
        schema_json, options_json, version, status, is_active, created_by, updated_by
      )
      VALUES (
        v_old.profile_year, v_old.code, v_old.room_id, v_old.unit_name, v_old.title,
        v_old.indicator_type, v_old.category, v_unit, v_target_text, v_target_operator,
        v_target_value, v_num, v_den, v_old.measurement_grain,
        v_schema, v_old.options_json, coalesce(v_old.version,1)+1,
        'published', true, v_old.created_by, v_old.updated_by
      );
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Audit metadata indikator 2026 menerbitkan % versi profil baru.', v_updated;
END
$audit$;