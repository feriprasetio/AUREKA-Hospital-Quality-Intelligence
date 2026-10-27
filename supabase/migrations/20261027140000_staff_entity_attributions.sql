begin;

create table if not exists aureka_quality.staff_entity_attributions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('patient_safety_incident','patient_safety_investigation')),
  entity_id uuid not null,
  staff_id uuid not null references aureka_quality.staff_directory(id) on delete restrict,
  field_key text not null,
  attribution_type text not null check (attribution_type in ('reporter','involved_person','responsible_provider','evaluator','other')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type, entity_id, field_key, staff_id)
);

comment on table aureka_quality.staff_entity_attributions is
'Canonical personnel UUID associations for non-quality-record modules. This link table deliberately does not copy HR identifiers or the full directory row into the module record. The original display-name snapshot remains in the module form_data.';
create index if not exists staff_entity_attr_staff_idx
  on aureka_quality.staff_entity_attributions (staff_id, entity_type, attribution_type);
create index if not exists staff_entity_attr_entity_idx
  on aureka_quality.staff_entity_attributions (entity_type, entity_id, field_key);

alter table aureka_quality.staff_entity_attributions enable row level security;

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
    when p_entity_type = 'patient_safety_incident' then exists (
      select 1
      from aureka_patient_safety.incidents i
      join public.master_rooms mr on mr.name = i.unit_name
      where i.id = p_entity_id
        and (p_room_id is null or mr.id = p_room_id)
        and aureka_system.has_quality_room_access(mr.id)
    )
    when p_entity_type = 'patient_safety_investigation' then exists (
      select 1
      from aureka_patient_safety.investigations inv
      join aureka_patient_safety.incidents i on i.id = inv.incident_id
      join public.master_rooms mr on mr.name = i.unit_name
      where inv.id = p_entity_id
        and (p_room_id is null or mr.id = p_room_id)
        and aureka_system.has_quality_room_access(mr.id)
    )
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
      join public.master_rooms mr on mr.id = a.room_id
      where a.staff_id = staff_id
        and a.assignment_status = 'active'
        and a.is_locked = true
        and d.directory_status = 'available'
        and (
          (entity_type = 'patient_safety_incident' and exists (
            select 1 from aureka_patient_safety.incidents i
            where i.id = entity_id and i.unit_name = mr.name
          ))
          or
          (entity_type = 'patient_safety_investigation' and exists (
            select 1
            from aureka_patient_safety.investigations inv
            join aureka_patient_safety.incidents i on i.id = inv.incident_id
            where inv.id = entity_id and i.unit_name = mr.name
          ))
        )
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
      join public.master_rooms mr on mr.id = a.room_id
      where a.staff_id = staff_id
        and a.assignment_status = 'active'
        and a.is_locked = true
        and d.directory_status = 'available'
        and (
          (entity_type = 'patient_safety_incident' and exists (
            select 1 from aureka_patient_safety.incidents i
            where i.id = entity_id and i.unit_name = mr.name
          ))
          or
          (entity_type = 'patient_safety_investigation' and exists (
            select 1
            from aureka_patient_safety.investigations inv
            join aureka_patient_safety.incidents i on i.id = inv.incident_id
            where inv.id = entity_id and i.unit_name = mr.name
          ))
        )
    )
  );

drop policy if exists staff_entity_attr_delete_room on aureka_quality.staff_entity_attributions;
create policy staff_entity_attr_delete_room
  on aureka_quality.staff_entity_attributions for delete to authenticated
  using (aureka_quality.staff_entity_has_room_access(entity_type, entity_id, null));

grant select, insert, update, delete on aureka_quality.staff_entity_attributions to authenticated;

create or replace function aureka_quality.touch_staff_entity_attribution_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog','aureka_quality'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function aureka_quality.touch_staff_entity_attribution_updated_at() from public;
create trigger staff_entity_attribution_touch_updated_at
  before update on aureka_quality.staff_entity_attributions
  for each row execute function aureka_quality.touch_staff_entity_attribution_updated_at();

commit;
