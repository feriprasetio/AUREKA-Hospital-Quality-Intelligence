-- Correct approved 2026 indicator targets and formalize indicator direction.
-- Published profiles are versioned: insert v(n+1), then retire v(n). No historical row is overwritten.

DO $migration$
DECLARE
  v_old aureka_quality.indicator_profiles%ROWTYPE;
  v_schema jsonb;
  v_options jsonb;
  v_target_text text;
  v_target_operator text;
  v_target_value numeric;
  v_numerator_definition text;
  v_denominator_definition text;
  v_unit_of_measure text;
  v_direction text;
  v_updated integer := 0;
BEGIN
  IF (
    SELECT count(*)
      FROM aureka_quality.indicator_profiles
     WHERE profile_year = 2026
       AND is_active = true
       AND status = 'published'
       AND (
         (room_id = 9 AND code = '9.1')
         OR (room_id = 29 AND code = '29.1')
         OR (room_id = 12 AND code = '12.3')
         OR (room_id = 33 AND code = '33.2')
       )
  ) <> 4 THEN
    RAISE EXCEPTION 'Koreksi indikator 2026 dibatalkan: empat profil target aktif harus ditemukan tepat satu per indikator.';
  END IF;

  FOR v_old IN
    SELECT *
      FROM aureka_quality.indicator_profiles
     WHERE profile_year = 2026
       AND is_active = true
       AND status = 'published'
       AND (
         (room_id = 9 AND code = '9.1')
         OR (room_id = 29 AND code = '29.1')
         OR (room_id = 12 AND code = '12.3')
         OR (room_id = 33 AND code = '33.2')
       )
     ORDER BY room_id, code
     FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1
        FROM aureka_quality.indicator_profiles
       WHERE profile_year = v_old.profile_year
         AND room_id = v_old.room_id
         AND code = v_old.code
         AND is_active = true
         AND status = 'published'
         AND version > v_old.version
    ) THEN
      RAISE EXCEPTION 'Versi aktif yang lebih baru sudah ada untuk indikator %; migrasi dihentikan agar tidak menimpa perubahan.', v_old.code;
    END IF;

    v_direction := CASE
      WHEN v_old.room_id = 29 AND v_old.code = '29.1' THEN 'positive'
      ELSE 'negative'
    END;
    v_schema := coalesce(v_old.schema_json, '{}'::jsonb)
      || jsonb_build_object('indicator_direction', v_direction);
    v_options := coalesce(v_old.options_json, '[]'::jsonb);
    v_target_text := v_old.target_text;
    v_target_operator := v_old.target_operator;
    v_target_value := v_old.target_value;
    v_numerator_definition := v_old.numerator_definition;
    v_denominator_definition := v_old.denominator_definition;
    v_unit_of_measure := v_old.unit_of_measure;

    IF v_old.room_id = 9 AND v_old.code = '9.1' THEN
      v_target_text := '≤ 1%';
      v_target_operator := '<=';
      v_target_value := 1;
    ELSIF v_old.room_id = 29 AND v_old.code = '29.1' THEN
      v_target_text := '= 100%';
      v_target_operator := '=';
      v_target_value := 100;
    ELSIF v_old.room_id = 12 AND v_old.code = '12.3' THEN
      v_target_text := '0% — Tidak ada kejadian yang ditoleransi (Zero Tolerance)';
      v_target_operator := '=';
      v_target_value := 0;
    ELSIF v_old.room_id = 33 AND v_old.code = '33.2' THEN
      IF jsonb_typeof(v_options) <> 'array' OR jsonb_array_length(v_options) <> 6 THEN
        RAISE EXCEPTION 'Pilihan respons indikator 33.2 harus berisi tepat enam opsi yang disepakati.';
      END IF;
      v_target_text := '0% — Tidak ada kejadian ruptur perineum derajat III/IV yang ditoleransi';
      v_target_operator := '=';
      v_target_value := 0;
      v_unit_of_measure := 'Persentase (%)';
      v_numerator_definition := 'Jumlah ibu bersalin normal (tanpa bantuan vakum/forsep) yang mengalami robekan perineum hingga derajat III (mengenai sfingter ani) atau IV (mengenai mukosa rektum).';
      v_denominator_definition := 'Jumlah seluruh ibu yang menjalani persalinan pervaginam spontan/normal.';
      SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(option, '{numerator}', to_jsonb((option->>'code') = '1'), true),
          '{denominator}', 'true'::jsonb, true
        )
        ORDER BY ordinal
      )
        INTO v_options
        FROM jsonb_array_elements(v_options) WITH ORDINALITY AS item(option, ordinal);
    END IF;

    INSERT INTO aureka_quality.indicator_profiles (
      profile_year, code, room_id, unit_name, title, indicator_type, category,
      unit_of_measure, target_text, target_operator, target_value,
      numerator_definition, denominator_definition, measurement_grain,
      schema_json, options_json, version, status, is_active, created_by, updated_by
    )
    VALUES (
      v_old.profile_year, v_old.code, v_old.room_id, v_old.unit_name, v_old.title,
      v_old.indicator_type, v_old.category, v_unit_of_measure, v_target_text,
      v_target_operator, v_target_value, v_numerator_definition,
      v_denominator_definition, v_old.measurement_grain, v_schema, v_options,
      coalesce(v_old.version, 1) + 1, 'published', true, v_old.created_by, v_old.updated_by
    );

    UPDATE aureka_quality.indicator_profiles
       SET status = 'retired',
           is_active = false
     WHERE id = v_old.id;

    v_updated := v_updated + 1;
  END LOOP;

  IF v_updated <> 4 THEN
    RAISE EXCEPTION 'Koreksi indikator 2026 tidak lengkap: empat versi baru diharapkan, % diproses.', v_updated;
  END IF;
END
$migration$;

COMMENT ON TABLE aureka_quality.indicator_profiles IS
'Published indicator profile metadata is versioned. schema_json.indicator_direction is positive or negative for option-based percentage interpretation.';
