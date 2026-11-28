-- Restrict trigger-only functions to trusted owners; keep existing trigger definitions and data.
REVOKE EXECUTE ON FUNCTION aureka_quality.audit_row_change(), aureka_quality.guard_standard_operating_procedure(), aureka_quality.recalculate_clinical_pathway_audit(), aureka_risk.enforce_very_high_relationship_source(), aureka_risk.prevent_downgrade_linked_primary_risk(), aureka_system.fill_username_from_signup(), aureka_system.guard_user_profile_security_fields(), aureka_system.handle_new_user() FROM PUBLIC, anon, authenticated;
-- This administrative import retains its existing explicit authenticated grant and internal superadmin check.
REVOKE EXECUTE ON FUNCTION aureka_quality.import_quality_profile_chunk(text) FROM PUBLIC, anon;
