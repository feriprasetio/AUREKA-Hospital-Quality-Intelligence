begin;

create or replace function aureka_quality.touch_staff_team_assignment_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog','aureka_quality'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function aureka_quality.touch_staff_team_assignment_updated_at() from public;
drop trigger if exists staff_team_assignment_touch_updated_at on aureka_quality.staff_team_assignments;
create trigger staff_team_assignment_touch_updated_at
  before update on aureka_quality.staff_team_assignments
  for each row execute function aureka_quality.touch_staff_team_assignment_updated_at();

-- A staff identity can only be attributed to a logbook record from the same locked team.
drop policy if exists quality_staff_attr_insert_room on aureka_quality.quality_record_staff_attributions;
create policy quality_staff_attr_insert_room
  on aureka_quality.quality_record_staff_attributions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from aureka_quality.quality_records r
      where r.id = record_id and aureka_system.has_quality_room_access(r.room_id)
    )
    and exists (
      select 1
      from aureka_quality.quality_records r
      join aureka_quality.staff_team_assignments a
        on a.staff_id = quality_record_staff_attributions.staff_id
       and a.room_id = r.room_id
       and a.assignment_status = 'active'
       and a.is_locked = true
      join aureka_quality.staff_directory d
        on d.id = a.staff_id
       and d.directory_status = 'available'
      where r.id = quality_record_staff_attributions.record_id
    )
  );

drop policy if exists quality_staff_attr_update_room on aureka_quality.quality_record_staff_attributions;
create policy quality_staff_attr_update_room
  on aureka_quality.quality_record_staff_attributions for update to authenticated
  using (
    exists (
      select 1 from aureka_quality.quality_records r
      where r.id = record_id and aureka_system.has_quality_room_access(r.room_id)
    )
  )
  with check (
    updated_by = (select auth.uid())
    and exists (
      select 1 from aureka_quality.quality_records r
      where r.id = record_id and aureka_system.has_quality_room_access(r.room_id)
    )
    and exists (
      select 1
      from aureka_quality.quality_records r
      join aureka_quality.staff_team_assignments a
        on a.staff_id = quality_record_staff_attributions.staff_id
       and a.room_id = r.room_id
       and a.assignment_status = 'active'
       and a.is_locked = true
      join aureka_quality.staff_directory d
        on d.id = a.staff_id
       and d.directory_status = 'available'
      where r.id = quality_record_staff_attributions.record_id
    )
  );

commit;
