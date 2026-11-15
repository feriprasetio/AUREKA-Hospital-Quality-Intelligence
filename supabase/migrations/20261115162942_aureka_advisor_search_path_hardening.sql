-- Production advisor hardening: pin search_path for pure risk helpers and lifecycle trigger.
-- The conditional duplicate-index cleanup is retained as a no-op unless both legacy indexes exist.
ALTER FUNCTION aureka_risk.calculate_risk_score(integer, integer) SET search_path = '';
ALTER FUNCTION aureka_risk.risk_level(integer) SET search_path = '';
ALTER FUNCTION aureka_system.track_user_deactivation() SET search_path = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'aureka_risk' AND indexname = 'risk_relationships_target_idx'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'aureka_risk' AND indexname = 'risk_relationships_target_risk_id_idx'
  ) THEN
    EXECUTE 'DROP INDEX aureka_risk.risk_relationships_target_risk_id_idx';
  END IF;
END
$$;
