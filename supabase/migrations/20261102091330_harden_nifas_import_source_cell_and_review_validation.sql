-- Harden the Nifas import RPC against missing source-cell keys and absent review flags.
DO $migration$
DECLARE
  v_definition text;
  v_old_header text := $old$      IF v_header IS NULL
         OR coalesce(v_form->>v_header, '') <> coalesce(v_source_cells->>v_code, '') THEN$old$;
  v_new_header text := $new$      IF v_header IS NULL
         OR NOT (v_source_cells ? v_code)
         OR coalesce(v_form->>v_header, '') <> coalesce(v_source_cells->>v_code, '') THEN$new$;
  v_old_review text := $old$         OR v_response->'raw_value'->>'review_required' <> 'true' THEN$old$;
  v_new_review text := $new$         OR coalesce(v_response->'raw_value'->>'review_required', 'false') <> 'true' THEN$new$;
BEGIN
  SELECT pg_get_functiondef(
    'aureka_quality.import_nifas_logbook_batch(jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL
     OR position(v_old_header IN v_definition) = 0
     OR position(v_old_review IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Potongan validasi header atau status review Nifas tidak ditemukan; fungsi tidak diubah.';
  END IF;

  v_definition := replace(v_definition, v_old_header, v_new_header);
  v_definition := replace(v_definition, v_old_review, v_new_review);
  EXECUTE v_definition;
END
$migration$;
