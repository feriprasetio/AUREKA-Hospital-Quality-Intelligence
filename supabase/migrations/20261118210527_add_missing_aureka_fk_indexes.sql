-- AUREKA performance remediation: add indexes for application-owned foreign keys.
-- These indexes are additive. No data, constraints, or existing indexes are removed.
-- Auth/Storage vendor-owned schemas are intentionally excluded.
create index if not exists idx_aureka_action_evaluations_action_id_fk
  on aureka_governance.action_evaluations (action_id);
create index if not exists idx_aureka_actions_assigned_room_id_fk
  on aureka_governance.actions (assigned_room_id);
create index if not exists idx_aureka_actions_parent_action_id_fk
  on aureka_governance.actions (parent_action_id);
create index if not exists idx_aureka_annual_priority_areas_owner_room_id_fk
  on aureka_governance.annual_priority_areas (owner_room_id);
create index if not exists idx_aureka_role_permissions_permission_fk
  on aureka_governance.role_permissions (permission);
create index if not exists idx_aureka_clinical_death_audits_source_record_id_fk
  on aureka_quality.clinical_death_audits (source_record_id);
create index if not exists idx_aureka_quality_excel_header_mappings_created_by_fk
  on aureka_quality.quality_excel_header_mappings (created_by);
create index if not exists idx_aureka_quality_excel_header_mappings_updated_by_fk
  on aureka_quality.quality_excel_header_mappings (updated_by);
create index if not exists idx_aureka_quality_excel_mapping_audit_actor_id_fk
  on aureka_quality.quality_excel_mapping_audit (actor_id);
create index if not exists idx_aureka_quality_excel_profile_audit_actor_id_fk
  on aureka_quality.quality_excel_profile_audit (actor_id);
create index if not exists idx_aureka_quality_excel_profile_audit_room_id_fk
  on aureka_quality.quality_excel_profile_audit (room_id);
create index if not exists idx_aureka_quality_import_mappings_updated_by_fk
  on aureka_quality.quality_import_mappings (updated_by);
create index if not exists idx_aureka_quality_reconciliation_audit_indicator_id_fk
  on aureka_quality.quality_reconciliation_audit (indicator_id);
create index if not exists idx_aureka_quality_reconciliation_audit_response_id_fk
  on aureka_quality.quality_reconciliation_audit (response_id);
create index if not exists idx_aureka_quality_reconciliation_warning_reviews_reviewed_by_fk
  on aureka_quality.quality_reconciliation_warning_reviews (reviewed_by);
create index if not exists idx_aureka_staff_team_assignment_events_assignment_id_fk
  on aureka_quality.staff_team_assignment_events (assignment_id);
create index if not exists idx_aureka_staff_team_assignment_events_from_room_id_fk
  on aureka_quality.staff_team_assignment_events (from_room_id);
create index if not exists idx_aureka_staff_team_assignment_events_staff_id_fk
  on aureka_quality.staff_team_assignment_events (staff_id);
create index if not exists idx_aureka_staff_team_assignment_events_to_room_id_fk
  on aureka_quality.staff_team_assignment_events (to_room_id);
