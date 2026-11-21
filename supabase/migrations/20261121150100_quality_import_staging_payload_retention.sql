BEGIN;

CREATE OR REPLACE FUNCTION aureka_quality.purge_quality_import_staging_payload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IN ('committed','cancelled')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM aureka_quality.quality_import_batch_rows WHERE batch_id=NEW.id;
    DELETE FROM aureka_quality.quality_import_batch_errors WHERE batch_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION aureka_quality.purge_quality_import_staging_payload() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS quality_import_purge_staging_payload ON aureka_quality.quality_import_batches;
CREATE TRIGGER quality_import_purge_staging_payload
AFTER UPDATE OF status ON aureka_quality.quality_import_batches
FOR EACH ROW
WHEN (NEW.status IN ('committed','cancelled') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION aureka_quality.purge_quality_import_staging_payload();

COMMENT ON FUNCTION aureka_quality.purge_quality_import_staging_payload() IS
'Deletes staged workbook row payloads and validation errors when a batch is committed or cancelled. Batch metadata, events and hashed row provenance remain for audit; sensitive workbook copies are not retained.';

COMMIT;
