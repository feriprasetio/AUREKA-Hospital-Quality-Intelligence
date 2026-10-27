begin;

alter table aureka_quality.staff_entity_attributions
  drop constraint if exists staff_entity_attributions_entity_type_check;
alter table aureka_quality.staff_entity_attributions
  add constraint staff_entity_attributions_entity_type_check
  check (entity_type in (
    'patient_safety_incident',
    'patient_safety_investigation',
    'clinical_pathway_audit',
    'clinical_death_audit'
  ));

create or replace function aureka_quality.staff_entity_room_id(
  p_entity_type text,
  p_entity_id uuid
) returns bigint
language sql
stable
security definer
set search_path to 'pg_catalog','aureka_quality','aureka_system','aureka_patient_safety','public'
as $function$
  select case
    when p_entity_type = 'patient_safety_incident' then (
      select mr.id
      from aureka_patient_safety.incidents i
      join public.master_rooms mr on mr.name = i.unit_name
      where i.id = p_entity_id
      limit 1
    )
    when p_entity_type = 'patient_safety_investigation' then (
      select mr.id
      from aureka_patient_safety.investigations inv
      join aureka_patient_safety.incidents i on i.id = inv.incident_id
      join public.master_rooms mr on mr.name = i.unit_name
      where inv.id = p_entity_id
      limit 1
    )
    when p_entity_type = 'clinical_pathway_audit' then (
      select c.room_id from aureka_quality.clinical_pathway_audits c where c.id = p_entity_id
    )
    when p_entity_type = 'clinical_death_audit' then (
      select c.room_id from aureka_quality.clinical_death_audits c where c.id = p_entity_id
    )
    else null
  end
$function$;

revoke all on function aureka_quality.staff_entity_room_id(text,uuid) from public;
grant execute on function aureka_quality.staff_entity_room_id(text,uuid) to authenticated;

create or replace function aureka_quality.staff_entity_has_room_access(
  p_entity_type text,
  p_entity_id uuid,
  p_room_id bigint default null
) returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','aureka_quality','aureka_system','aureka_patient_safety','public'
as $function$
  select case
    when p_entity_type in ('patient_safety_incident','patient_safety_investigation') then
      aureka_quality.staff_entity_room_id(p_entity_type,p_entity_id) is not null
      and (p_room_id is null or aureka_quality.staff_entity_room_id(p_entity_type,p_entity_id)=p_room_id)
      and aureka_system.has_quality_room_access(aureka_quality.staff_entity_room_id(p_entity_type,p_entity_id))
    when p_entity_type in ('clinical_pathway_audit','clinical_death_audit') then
      aureka_quality.staff_entity_room_id(p_entity_type,p_entity_id) is not null
      and (p_room_id is null or aureka_quality.staff_entity_room_id(p_entity_type,p_entity_id)=p_room_id)
      and aureka_system.has_quality_room_access(aureka_quality.staff_entity_room_id(p_entity_type,p_entity_id))
    else false
  end
$function$;

revoke all on function aureka_quality.staff_entity_has_room_access(text,uuid,bigint) from public;
grant execute on function aureka_quality.staff_entity_has_room_access(text,uuid,bigint) to authenticated;

drop policy if exists staff_entity_attr_read_room on aureka_quality.staff_entity_attributions;
create policy staff_entity_attr_read_room
  on aureka_quality.staff_entity_attributions for select to authenticated
  using (aureka_quality.staff_entity_has_room_access(entity_type, entity_id, null));

drop policy if exists staff_entity_attr_insert_room on aureka_quality.staff_entity_attributions;
create policy staff_entity_attr_insert_room
  on aureka_quality.staff_entity_attributions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and aureka_quality.staff_entity_has_room_access(entity_type, entity_id, null)
    and exists (
      select 1
      from aureka_quality.staff_team_assignments a
      join aureka_quality.staff_directory d on d.id = a.staff_id
      where a.staff_id = staff_entity_attributions.staff_id
        and a.room_id = aureka_quality.staff_entity_room_id(staff_entity_attributions.entity_type, staff_entity_attributions.entity_id)
        and a.assignment_status = 'active'
        and a.is_locked = true
        and d.directory_status = 'available'
    )
  );

drop policy if exists staff_entity_attr_update_room on aureka_quality.staff_entity_attributions;
create policy staff_entity_attr_update_room
  on aureka_quality.staff_entity_attributions for update to authenticated
  using (aureka_quality.staff_entity_has_room_access(entity_type, entity_id, null))
  with check (
    updated_by = (select auth.uid())
    and aureka_quality.staff_entity_has_room_access(entity_type, entity_id, null)
    and exists (
      select 1
      from aureka_quality.staff_team_assignments a
      join aureka_quality.staff_directory d on d.id = a.staff_id
      where a.staff_id = staff_entity_attributions.staff_id
        and a.room_id = aureka_quality.staff_entity_room_id(staff_entity_attributions.entity_type, staff_entity_attributions.entity_id)
        and a.assignment_status = 'active'
        and a.is_locked = true
        and d.directory_status = 'available'
    )
  );

drop policy if exists staff_entity_attr_delete_room on aureka_quality.staff_entity_attributions;
create policy staff_entity_attr_delete_room
  on aureka_quality.staff_entity_attributions for delete to authenticated
  using (aureka_quality.staff_entity_has_room_access(entity_type, entity_id, null));

commit;
