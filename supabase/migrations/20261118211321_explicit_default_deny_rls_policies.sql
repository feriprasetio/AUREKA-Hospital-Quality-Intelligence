-- Explicitly document the existing default-deny posture for sensitive internal tables.
-- These tables grant no direct privileges to anon/authenticated; access is mediated by
-- guarded SECURITY DEFINER RPCs. The false policy preserves that denial and changes
-- no access path for service_role or the postgres owner.
create policy explicit_default_deny_client_access
  on aureka_governance.action_evaluations
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.actions
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.annual_priority_areas
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.audit_log
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.indicator_proposal_events
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.indicator_proposals
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.permissions
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.recommendations
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.role_permissions
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_governance.system_settings
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_quality.nara_clinical_access_audit
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_quality.nara_icd10_dictionary
  for all to anon, authenticated using (false) with check (false);
create policy explicit_default_deny_client_access
  on aureka_quality.patient_index
  for all to anon, authenticated using (false) with check (false);
