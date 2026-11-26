-- Some deployments separately hardened Nifas with a COALESCE pending-only check.
-- Keep provenance validation and let the common validator check review status.
DO $align_nifas$
DECLARE
  definition text := pg_get_functiondef('aureka_quality.import_nifas_logbook_batch(jsonb)'::regprocedure);
  old_guard text := $old$         OR coalesce(v_response->'raw_value'->>'review_required', 'false') <> 'true' THEN$old$;
BEGIN
  IF strpos(definition, 'aureka_quality.assert_active_workbook_indicator_response') = 0 THEN
    RAISE EXCEPTION 'Validator respons workbook belum tersedia untuk Nifas.';
  END IF;
  IF strpos(definition, old_guard) > 0 THEN
    EXECUTE replace(definition, old_guard, '      THEN');
  END IF;
END
$align_nifas$;
