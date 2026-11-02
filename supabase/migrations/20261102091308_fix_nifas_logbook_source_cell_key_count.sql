-- Fix a source-cell JSON key-count alias in the Nifas batch RPC.
DO $migration$
DECLARE
  v_definition text;
  v_old text := $old$FROM jsonb_object_keys(v_source_cells) AS cells(code, value)
       WHERE coalesce(v_source_cells->>code, '') <> ''$old$;
  v_new text := $new$FROM jsonb_object_keys(v_source_cells) AS cells(code)
       WHERE coalesce(v_source_cells->>code, '') <> ''$new$;
BEGIN
  SELECT pg_get_functiondef(
    'aureka_quality.import_nifas_logbook_batch(jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL OR position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Ekspresi validasi source_indicator_cells Nifas tidak ditemukan; fungsi tidak diubah.';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END
$migration$;
