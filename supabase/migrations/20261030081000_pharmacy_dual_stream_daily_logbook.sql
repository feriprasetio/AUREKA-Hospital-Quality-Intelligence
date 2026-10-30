-- Configure Instalasi Farmasi daily logbook to mirror the two workbook service streams.
-- Preserve current published targets; store source workbook target/definition differences as explicit metadata.
DO $migration$
DECLARE
  v_profile_count integer;
BEGIN
  SELECT count(*)
    INTO v_profile_count
    FROM aureka_quality.indicator_profiles ip
   WHERE ip.room_id = 5
     AND ip.profile_year = 2026
     AND ip.is_active = true
     AND ip.status = 'published'
     AND ip.code = ANY (ARRAY['5.2','5.3','5.4','5.5']);

  IF v_profile_count <> 4 THEN
    RAISE EXCEPTION 'Master indikator Farmasi 5.2–5.5 harus tepat empat profil aktif/terbit; ditemukan %.', v_profile_count;
  END IF;
END
$migration$;

UPDATE aureka_quality.indicator_profiles
   SET schema_json = coalesce(schema_json, '{}'::jsonb) || jsonb_build_object(
     'header_label', 'Angka Copy Resep',
     'logbook_input_numerator_label', 'Jumlah Copy Resep yang Ditulis Oleh Farmasi',
     'logbook_input_denominator_label', 'Jumlah Resep yang Dilayani Farmasi',
     'source_workbook_target_text', '≤ 5%',
     'source_workbook_name', 'PMKP - Instalasi Farmasi - 2026 (SEPTEMBER).xlsx',
     'target_reconciliation_note', 'Target workbook ≤ 5% berbeda dari target master aktif ≤ 20%; target master tidak diubah oleh migrasi ini.'
   ),
       updated_at = now()
 WHERE room_id = 5
   AND profile_year = 2026
   AND code = '5.2'
   AND is_active = true
   AND status = 'published';

UPDATE aureka_quality.indicator_profiles
   SET schema_json = coalesce(schema_json, '{}'::jsonb) || jsonb_build_object(
     'header_label', 'Angka Ketidakpatuhan Penggunaan Label High Alert',
     'logbook_input_transform', 'denominator_minus_input',
     'logbook_input_numerator_label', 'Jumlah Obat yang Tidak Dilabeli High Alert',
     'logbook_input_denominator_label', 'Jumlah Obat / Sediaan yang Harusnya Dilabeli High Alert',
     'source_workbook_target_text', '0% ketidakpatuhan',
     'source_scope_warning', 'Workbook mencatat High Alert saja, sedangkan master indikator mencakup High Alert dan LASA. Hasil ini belum mewakili cakupan LASA sampai sampel LASA ikut direkam.',
     'source_workbook_name', 'PMKP - Instalasi Farmasi - 2026 (SEPTEMBER).xlsx'
   ),
       updated_at = now()
 WHERE room_id = 5
   AND profile_year = 2026
   AND code = '5.3'
   AND is_active = true
   AND status = 'published';

UPDATE aureka_quality.indicator_profiles
   SET schema_json = coalesce(schema_json, '{}'::jsonb) || jsonb_build_object(
     'header_label', 'Kepatuhan Penggunaan Formularium Nasional',
     'logbook_input_numerator_label', 'Jumlah Resep yang Patuh Dengan Formularium Nasional',
     'logbook_input_denominator_label', 'Jumlah Resep yang Dilayani Farmasi',
     'source_workbook_name', 'PMKP - Instalasi Farmasi - 2026 (SEPTEMBER).xlsx'
   ),
       updated_at = now()
 WHERE room_id = 5
   AND profile_year = 2026
   AND code = '5.4'
   AND is_active = true
   AND status = 'published';

UPDATE aureka_quality.indicator_profiles
   SET schema_json = coalesce(schema_json, '{}'::jsonb) || jsonb_build_object(
     'header_label', 'Kepatuhan Penggunaan Formularium Rumah Sakit',
     'logbook_input_numerator_label', 'Jumlah Resep yang Patuh Dengan Formularium Rumah Sakit',
     'logbook_input_denominator_label', 'Jumlah Resep yang Dilayani Farmasi',
     'source_workbook_name', 'PMKP - Instalasi Farmasi - 2026 (SEPTEMBER).xlsx'
   ),
       updated_at = now()
 WHERE room_id = 5
   AND profile_year = 2026
   AND code = '5.5'
   AND is_active = true
   AND status = 'published';

UPDATE aureka_quality.indicator_profiles
   SET schema_json = coalesce(schema_json, '{}'::jsonb) || jsonb_build_object(
     'separate_measurement_mode', 'stock_opname',
     'daily_service_stream_applicable', false
   ),
       updated_at = now()
 WHERE room_id = 5
   AND profile_year = 2026
   AND code = '5.1'
   AND is_active = true
   AND status = 'published';
