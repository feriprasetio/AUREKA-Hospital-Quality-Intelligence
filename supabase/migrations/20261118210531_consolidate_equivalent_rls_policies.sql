-- Consolidate equivalent permissive policies without changing their effective access.
-- PostgreSQL combines permissive policies for the same role/action with OR.
-- The predicates below preserve that exact OR behavior while reducing policy count.
drop policy if exists culture_response_select_superadmin on aureka_patient_safety.culture_responses;
drop policy if exists culture_responses_perm_read on aureka_patient_safety.culture_responses;
create policy culture_responses_select_governed
  on aureka_patient_safety.culture_responses
  for select to authenticated
  using (
    aureka_patient_safety.can_export_survey()
    or (select public.aureka_has_permission('survey.read.named_response'))
  );

drop policy if exists investigation_select_related_or_manager on aureka_patient_safety.investigations;
drop policy if exists investigations_perm_read on aureka_patient_safety.investigations;
create policy investigations_select_governed
  on aureka_patient_safety.investigations
  for select to authenticated
  using (
    aureka_patient_safety.can_manage_workflow()
    or exists (
      select 1
      from aureka_patient_safety.incidents i
      where i.id = investigations.incident_id
        and i.created_by = (select auth.uid())
    )
    or (select public.aureka_has_permission('incident.read.investigation_detail'))
  );

drop policy if exists qi_profiles_admin_update on aureka_quality.indicator_profiles;
drop policy if exists quality_profiles_import_metadata_update on aureka_quality.indicator_profiles;
create policy qi_profiles_update_governed
  on aureka_quality.indicator_profiles
  for update to authenticated
  using (
    (select aureka_system.is_superadmin())
    or (
      aureka_system.current_role_code() = any (array['ADMIN','PMKP']::text[])
      and aureka_system.has_quality_room_access(room_id)
      and status = 'published'
      and is_active = true
    )
  )
  with check (
    (select aureka_system.is_superadmin())
    or (
      aureka_system.current_role_code() = any (array['ADMIN','PMKP']::text[])
      and aureka_system.has_quality_room_access(room_id)
      and status = 'published'
      and is_active = true
    )
  );

drop policy if exists oppe_assessments_manager_read on aureka_quality.oppe_assessments;
drop policy if exists oppe_assessments_perm_read on aureka_quality.oppe_assessments;
create policy oppe_assessments_select_governed
  on aureka_quality.oppe_assessments
  for select to authenticated
  using (
    (aureka_system.can_manage_oppe() and aureka_system.has_quality_room_access(room_id))
    or (select public.aureka_has_permission('hr.read.performance'))
  );

drop policy if exists oppe_fppe_manager_read on aureka_quality.oppe_fppe_evaluations;
drop policy if exists oppe_fppe_evaluations_perm_read on aureka_quality.oppe_fppe_evaluations;
create policy oppe_fppe_evaluations_select_governed
  on aureka_quality.oppe_fppe_evaluations
  for select to authenticated
  using (
    (aureka_system.can_manage_oppe() and aureka_system.has_quality_room_access(room_id))
    or (select public.aureka_has_permission('hr.read.performance'))
  );
