
UPDATE aureka_quality.indicator_profiles
SET
  unit_of_measure = 'Persentase klinik (%)',
  target_text = '100% — seluruh klinik operasional memiliki rerata waktu tunggu < 60 menit',
  numerator_definition = 'Jumlah klinik pada roster operasional dengan rerata waktu tunggu klinik < 60 menit. Rerata klinik dihitung dari rerata waktu tunggu dokter yang memiliki pengukuran pada periode tersebut.',
  denominator_definition = 'Jumlah seluruh klinik dalam roster operasional pada periode pengamatan, termasuk klinik yang belum memiliki catatan waktu tunggu.',
  schema_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(schema_json, '{}'::jsonb),
        '{calculation_method}',
        '"mean_of_doctor_means_per_clinic"'::jsonb,
        true
      ),
      '{threshold_minutes}',
      '60'::jsonb,
      true
    ),
    '{missing_clinic_rule}',
    '"count_in_denominator_and_not_compliant"'::jsonb,
    true
  ),
  options_json = '[]'::jsonb,
  updated_at = now()
WHERE room_id = 11
  AND profile_year = 2026
  AND code = '11.1';
