-- Least-privilege function execution and RLS query-plan hardening for Patient Safety.
-- Additive only: no records are deleted or rewritten.

create index if not exists investigations_created_by_idx
  on aureka_patient_safety.investigations (created_by);

create index if not exists audit_log_actor_user_id_idx
  on aureka_patient_safety.audit_log (actor_user_id);

drop policy if exists incident_select_own_or_manager on aureka_patient_safety.incidents;
create policy incident_select_own_or_manager
on aureka_patient_safety.incidents for select to authenticated
using (
  created_by = (select auth.uid())
  or aureka_patient_safety.can_manage_workflow()
);

drop policy if exists incident_insert_self on aureka_patient_safety.incidents;
create policy incident_insert_self
on aureka_patient_safety.incidents for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists incident_update_draft_or_manager on aureka_patient_safety.incidents;
create policy incident_update_draft_or_manager
on aureka_patient_safety.incidents for update to authenticated
using (
  aureka_patient_safety.can_manage_workflow()
  or (created_by = (select auth.uid()) and status = 'draft')
)
with check (
  aureka_patient_safety.can_manage_workflow()
  or (created_by = (select auth.uid()) and status in ('draft', 'submitted'))
);

drop policy if exists investigation_select_related_or_manager on aureka_patient_safety.investigations;
create policy investigation_select_related_or_manager
on aureka_patient_safety.investigations for select to authenticated
using (
  aureka_patient_safety.can_manage_workflow()
  or exists (
    select 1 from aureka_patient_safety.incidents i
    where i.id = incident_id and i.created_by = (select auth.uid())
  )
);

revoke all on function aureka_patient_safety.can_manage_workflow() from public, anon;
grant execute on function aureka_patient_safety.can_manage_workflow() to authenticated;

revoke all on function aureka_patient_safety.can_export_survey() from public, anon;
grant execute on function aureka_patient_safety.can_export_survey() to authenticated;

revoke all on function aureka_patient_safety.touch_and_audit() from public, anon, authenticated;
