-- Accept the source workbook's "Kekosongan Linen" header alias while retaining
-- the original combined BHP/Linen value as provenance only (never mapped to 20.6/20.12).
DO $migration$
DECLARE
  v_definition text;
  v_old_block text := $old$    IF coalesce(v_unmapped->>'source_header', '') <> 'Kekosongan BHP/Linen'
       OR coalesce(v_unmapped->>'mapping_status', '') <> 'combined_bhp_linen_source_not_mapped'
       OR coalesce(v_unmapped->>'source_value', '') <> coalesce(v_form->>'Kekosongan BHP/Linen (sumber belum dipetakan)', '')
       OR coalesce(jsonb_typeof(v_unmapped->'target_profiles'), '') <> 'array'
       OR jsonb_array_length(v_unmapped->'target_profiles') <> 2 THEN
      RAISE EXCEPTION 'Sumber gabungan BHP/Linen wajib dipertahankan dan tidak boleh dipaksakan ke 20.6/20.12.' USING ERRCODE = '22023';
    END IF;$old$;
  v_new_block text := $new$    IF coalesce(v_unmapped->>'source_header', '') NOT IN ('Kekosongan BHP/Linen', 'Kekosongan Linen')
       OR coalesce(v_unmapped->>'mapping_status', '') <> 'combined_bhp_linen_source_not_mapped'
       OR coalesce(v_unmapped->>'source_value', '') <> coalesce(
         v_form->>(coalesce(v_unmapped->>'source_header', '') || ' (sumber belum dipetakan)'),
         ''
       )
       OR v_unmapped->'target_profiles' IS DISTINCT FROM
         '["20.6 Kekosongan Linen", "20.12 Kekosongan Obat"]'::jsonb THEN
      RAISE EXCEPTION 'Sumber gabungan BHP/Linen wajib dipertahankan dan tidak boleh dipaksakan ke 20.6/20.12.' USING ERRCODE = '22023';
    END IF;$new$;
BEGIN
  SELECT pg_get_functiondef(
    'aureka_quality.import_perinatology_logbook_batch(jsonb)'::regprocedure
  )
  INTO v_definition;

  IF v_definition IS NULL OR position(v_old_block IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Tidak dapat memperbarui validasi BHP/Linen: potongan fungsi lama tidak ditemukan; hentikan migrasi dan inspeksi fungsi aktif.';
  END IF;

  v_definition := replace(v_definition, v_old_block, v_new_block);
  EXECUTE v_definition;
END
$migration$;
