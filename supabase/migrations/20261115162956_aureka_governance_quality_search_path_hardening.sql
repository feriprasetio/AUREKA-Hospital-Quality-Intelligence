-- Pin search_path for functions whose bodies use only pg_catalog built-ins
-- or explicitly qualified extension functions.
ALTER FUNCTION aureka_quality.normalize_no_rm(text) SET search_path = '';
ALTER FUNCTION aureka_governance.audit_log_immutable() SET search_path = '';
ALTER FUNCTION aureka_governance.hash_version(text, text, text, integer) SET search_path = '';
