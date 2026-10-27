begin;

-- Return only available identities that are either unassigned or already locked
-- to the requested unit. Do not disclose staff locked to another unit.
create or replace function aureka_quality.list_assignable_staff(p_room_id bigint)
returns table (
  id uuid,
  employee_code text,
  display_name text,
  normalized_name text,
  profession_group text,
  position_title text,
  source_unit text,
  staff_group text,
  directory_status text,
  already_locked_here boolean
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog','aureka_quality','aureka_system','auth'
as $function$
declare
  v_role text := aureka_system.current_role_code();
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan untuk membuka direktori tenaga kerja.';
  end if;

  if v_role not in ('ADMIN','PMKP','PIC','VALIDATOR') then
    raise exception 'Role akun tidak diizinkan mengelola roster tenaga kerja.';
  end if;

  if p_room_id is null or not aureka_system.has_quality_room_access(p_room_id) then
    raise exception 'Akses ke unit yang dipilih tidak tersedia.';
  end if;

  return query
  select
    d.id,
    d.employee_code,
    d.display_name,
    d.normalized_name,
    d.profession_group,
    d.position_title,
    d.source_unit,
    d.staff_group,
    d.directory_status,
    (a.staff_id is not null) as already_locked_here
  from aureka_quality.staff_directory d
  left join aureka_quality.staff_team_assignments a
    on a.staff_id = d.id
   and a.assignment_status = 'active'
   and a.is_locked = true
   and a.room_id = p_room_id
  where d.directory_status = 'available'
    and (
      a.staff_id is not null
      or not exists (
        select 1
        from aureka_quality.staff_team_assignments other_assignment
        where other_assignment.staff_id = d.id
          and other_assignment.assignment_status = 'active'
          and other_assignment.is_locked = true
      )
    )
  order by lower(d.display_name), d.employee_code;
end;
$function$;

revoke all on function aureka_quality.list_assignable_staff(bigint) from public;
revoke all on function aureka_quality.list_assignable_staff(bigint) from anon;
grant execute on function aureka_quality.list_assignable_staff(bigint) to authenticated;

comment on function aureka_quality.list_assignable_staff(bigint) is
'Returns only available staff that are unassigned or already locked to the requested room. Cross-room locked staff are intentionally not disclosed; the unique active-assignment index remains the concurrency backstop.';


-- Preserve roster integrity: an active identity must be released by an authorized
-- manager before its directory status can be changed away from available.
create or replace function aureka_quality.guard_staff_directory_status()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','aureka_quality'
as $function$
begin
  if new.directory_status is distinct from old.directory_status
     and new.directory_status <> 'available'
     and exists (
       select 1
       from aureka_quality.staff_team_assignments a
       where a.staff_id = old.id
         and a.assignment_status = 'active'
         and a.is_locked = true
     ) then
    raise exception 'Tenaga masih terkunci pada tim. Super Admin/Komite PMKP harus melepaskan penetapan sebelum mengubah status direktori.';
  end if;
  return new;
end;
$function$;

revoke all on function aureka_quality.guard_staff_directory_status() from public;
drop trigger if exists staff_directory_guard_locked_status on aureka_quality.staff_directory;
create trigger staff_directory_guard_locked_status
before update of directory_status on aureka_quality.staff_directory
for each row execute function aureka_quality.guard_staff_directory_status();

commit;
