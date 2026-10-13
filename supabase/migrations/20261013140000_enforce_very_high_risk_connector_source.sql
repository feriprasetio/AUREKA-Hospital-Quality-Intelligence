CREATE OR REPLACE FUNCTION aureka_risk.enforce_very_high_relationship_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aureka_risk
AS $function$
DECLARE
  v_source_level text;
BEGIN
  SELECT rr.risk_level::text
    INTO v_source_level
  FROM aureka_risk.risk_register AS rr
  WHERE rr.id = NEW.source_risk_id;

  IF v_source_level IS DISTINCT FROM 'Sangat Tinggi' THEN
    RAISE EXCEPTION
      'Konektor risiko harus bersumber dari risiko berlevel Sangat Tinggi. source_risk_id=%',
      NEW.source_risk_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_very_high_relationship_source
  ON aureka_risk.risk_relationships;

CREATE TRIGGER enforce_very_high_relationship_source
BEFORE INSERT OR UPDATE OF source_risk_id
ON aureka_risk.risk_relationships
FOR EACH ROW
EXECUTE FUNCTION aureka_risk.enforce_very_high_relationship_source();

CREATE OR REPLACE FUNCTION aureka_risk.prevent_downgrade_linked_primary_risk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aureka_risk
AS $function$
BEGIN
  IF NEW.risk_level::text IS DISTINCT FROM 'Sangat Tinggi'
     AND EXISTS (
       SELECT 1
       FROM aureka_risk.risk_relationships AS rel
       WHERE rel.source_risk_id = NEW.id
     ) THEN
    RAISE EXCEPTION
      'Risiko utama yang sudah memiliki konektor tidak dapat diturunkan dari level Sangat Tinggi sebelum konektornya ditinjau atau dihapus. risk_id=%',
      NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zzz_prevent_downgrade_linked_primary_risk
  ON aureka_risk.risk_register;

CREATE TRIGGER zzz_prevent_downgrade_linked_primary_risk
BEFORE UPDATE
ON aureka_risk.risk_register
FOR EACH ROW
EXECUTE FUNCTION aureka_risk.prevent_downgrade_linked_primary_risk();

CREATE INDEX IF NOT EXISTS risk_relationships_target_risk_id_idx
  ON aureka_risk.risk_relationships (target_risk_id);
