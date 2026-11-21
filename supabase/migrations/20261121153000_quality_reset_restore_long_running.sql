BEGIN;
ALTER FUNCTION aureka_private.run_quality_domain_reset(text) SET statement_timeout = '0';
ALTER FUNCTION aureka_private.restore_quality_domain_backup(uuid,text) SET statement_timeout = '0';
COMMENT ON FUNCTION aureka_private.restore_quality_domain_backup(uuid,text) IS
'Restores a checksummed full quality-domain snapshot, including original audit_log rows. Runs without a short statement timeout because restoring full audit history can involve tens of thousands of actor foreign-key checks.';
COMMIT;