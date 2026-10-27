begin;

create table if not exists aureka_quality.staff_directory (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  display_name text not null,
  normalized_name text not null,
  name_prefix text not null default '',
  credentials text not null default '',
  profession_group text not null default 'Tenaga pelayanan/pendukung',
  position_title text not null default '',
  source_unit text not null default '',
  staff_group text not null default '',
  source_sheet text not null default '',
  source_year integer,
  directory_status text not null default 'needs_review'
    check (directory_status in ('available','needs_review','inactive')),
  review_note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table aureka_quality.staff_directory is
'Canonical AUREKA personnel directory. Never stores NIP, NIK, or the HR employee-status field. Rows are identified by an AUREKA UUID and internal employee_code.';
comment on column aureka_quality.staff_directory.employee_code is
'Internal AUREKA directory code, not an official personnel number.';
comment on column aureka_quality.staff_directory.normalized_name is
'Normalized matching key. Do not use as a primary identity; staff_id is authoritative.';
comment on column aureka_quality.staff_directory.directory_status is
'available=eligible for team assignment; needs_review=blocked pending review; inactive=retired from current selection.';

create index if not exists staff_directory_normalized_name_idx
  on aureka_quality.staff_directory (normalized_name);
create index if not exists staff_directory_selection_idx
  on aureka_quality.staff_directory (directory_status, profession_group, display_name);
create index if not exists staff_directory_group_idx
  on aureka_quality.staff_directory (staff_group, source_year);

alter table aureka_quality.staff_directory enable row level security;

drop policy if exists staff_directory_read_active_users on aureka_quality.staff_directory;
create policy staff_directory_read_active_users
  on aureka_quality.staff_directory for select to authenticated
  using ((select aureka_system.current_role_code()) is not null);

drop policy if exists staff_directory_admin_insert on aureka_quality.staff_directory;
create policy staff_directory_admin_insert
  on aureka_quality.staff_directory for insert to authenticated
  with check (public.aureka_is_admin());

drop policy if exists staff_directory_admin_update on aureka_quality.staff_directory;
create policy staff_directory_admin_update
  on aureka_quality.staff_directory for update to authenticated
  using (public.aureka_is_admin())
  with check (public.aureka_is_admin());

drop policy if exists staff_directory_admin_delete on aureka_quality.staff_directory;
create policy staff_directory_admin_delete
  on aureka_quality.staff_directory for delete to authenticated
  using (public.aureka_is_admin());

grant select on aureka_quality.staff_directory to authenticated;
grant insert, update, delete on aureka_quality.staff_directory to authenticated;

create table if not exists aureka_quality.staff_team_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references aureka_quality.staff_directory(id) on delete restrict,
  room_id bigint not null references public.master_rooms(id) on delete restrict,
  assigned_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assignment_status text not null default 'active'
    check (assignment_status in ('active','released')),
  is_locked boolean not null default true,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  release_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (assignment_status = 'active' and is_locked = true and released_at is null)
    or (assignment_status = 'released' and is_locked = false and released_at is not null)
  )
);

comment on table aureka_quality.staff_team_assignments is
'Locked assignment of one staff identity to one AUREKA work team (unit). An active staff identity cannot be assigned to a second team; transfers/release are restricted to ADMIN/PMKP and are audited.';

create unique index if not exists staff_team_one_active_assignment_uq
  on aureka_quality.staff_team_assignments (staff_id)
  where assignment_status = 'active';
create index if not exists staff_team_room_active_idx
  on aureka_quality.staff_team_assignments (room_id, assignment_status, assigned_at desc);
create index if not exists staff_team_user_idx
  on aureka_quality.staff_team_assignments (assigned_user_id, assignment_status);

alter table aureka_quality.staff_team_assignments enable row level security;

drop policy if exists staff_team_read_authorized_room on aureka_quality.staff_team_assignments;
create policy staff_team_read_authorized_room
  on aureka_quality.staff_team_assignments for select to authenticated
  using (
    (select aureka_system.current_role_code()) in ('ADMIN','PMKP','PIC','VALIDATOR')
    and aureka_system.has_quality_room_access(room_id)
  );

drop policy if exists staff_team_insert_authorized_room on aureka_quality.staff_team_assignments;
create policy staff_team_insert_authorized_room
  on aureka_quality.staff_team_assignments for insert to authenticated
  with check (
    (select aureka_system.current_role_code()) in ('ADMIN','PMKP','PIC','VALIDATOR')
    and aureka_system.has_quality_room_access(room_id)
    and assigned_user_id = (select auth.uid())
    and assigned_by = (select auth.uid())
    and assignment_status = 'active'
    and is_locked = true
    and exists (
      select 1 from aureka_quality.staff_directory d
      where d.id = staff_id and d.directory_status = 'available'
    )
  );

drop policy if exists staff_team_manager_update on aureka_quality.staff_team_assignments;
create policy staff_team_manager_update
  on aureka_quality.staff_team_assignments for update to authenticated
  using ((select aureka_system.current_role_code()) in ('ADMIN','PMKP'))
  with check ((select aureka_system.current_role_code()) in ('ADMIN','PMKP'));

drop policy if exists staff_team_manager_delete on aureka_quality.staff_team_assignments;
create policy staff_team_manager_delete
  on aureka_quality.staff_team_assignments for delete to authenticated
  using (public.aureka_is_admin());

grant select, insert on aureka_quality.staff_team_assignments to authenticated;
grant update, delete on aureka_quality.staff_team_assignments to authenticated;

create table if not exists aureka_quality.staff_team_assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references aureka_quality.staff_team_assignments(id) on delete restrict,
  staff_id uuid not null references aureka_quality.staff_directory(id) on delete restrict,
  event_type text not null check (event_type in ('assigned','released','reassigned','assignment_updated')),
  from_room_id bigint references public.master_rooms(id) on delete set null,
  to_room_id bigint references public.master_rooms(id) on delete set null,
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table aureka_quality.staff_team_assignment_events enable row level security;
drop policy if exists staff_team_events_read_authorized_room on aureka_quality.staff_team_assignment_events;
create policy staff_team_events_read_authorized_room
  on aureka_quality.staff_team_assignment_events for select to authenticated
  using (
    (select aureka_system.current_role_code()) in ('ADMIN','PMKP')
    or (from_room_id is not null and aureka_system.has_quality_room_access(from_room_id))
    or (to_room_id is not null and aureka_system.has_quality_room_access(to_room_id))
  );
grant select on aureka_quality.staff_team_assignment_events to authenticated;

create or replace function aureka_quality.log_staff_team_assignment_change()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','aureka_quality','aureka_system','auth'
as $function$
declare
  v_event_type text := 'assignment_updated';
  v_from_room bigint := null;
  v_from_status text := null;
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    v_event_type := 'assigned';
    insert into aureka_quality.staff_team_assignment_events
      (assignment_id, staff_id, event_type, from_room_id, to_room_id, from_status, to_status, actor_id, note)
    values
      (new.id, new.staff_id, v_event_type, null, new.room_id, null, new.assignment_status, v_actor, 'Penetapan tim awal; identitas dikunci.');
    return new;
  end if;

  v_from_room := old.room_id;
  v_from_status := old.assignment_status;
  if old.assignment_status = 'active' and new.assignment_status = 'released' then
    v_event_type := 'released';
  elsif old.room_id is distinct from new.room_id then
    v_event_type := 'reassigned';
  end if;

  if (old.staff_id is distinct from new.staff_id) then
    raise exception 'Identitas staf pada riwayat penetapan tidak boleh diganti.';
  end if;

  insert into aureka_quality.staff_team_assignment_events
    (assignment_id, staff_id, event_type, from_room_id, to_room_id, from_status, to_status, actor_id, note)
  values
    (new.id, new.staff_id, v_event_type, v_from_room, new.room_id, v_from_status, new.assignment_status, v_actor,
     coalesce(nullif(new.release_note,''), 'Perubahan penetapan tim oleh pengelola berwenang.'));
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function aureka_quality.log_staff_team_assignment_change() from public;
create trigger staff_team_assignment_audit_after_write
  after insert or update on aureka_quality.staff_team_assignments
  for each row execute function aureka_quality.log_staff_team_assignment_change();

create or replace function aureka_quality.touch_staff_directory_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog','aureka_quality'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger staff_directory_touch_updated_at
  before update on aureka_quality.staff_directory
  for each row execute function aureka_quality.touch_staff_directory_updated_at();

create table if not exists aureka_quality.quality_record_staff_attributions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references aureka_quality.quality_records(id) on delete cascade,
  staff_id uuid not null references aureka_quality.staff_directory(id) on delete restrict,
  field_key text not null,
  attribution_type text not null default 'related_provider'
    check (attribution_type in ('responsible_provider','reporter','involved_person','evaluator','clinical_team_member','related_provider','other')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_id, field_key)
);

comment on table aureka_quality.quality_record_staff_attributions is
'Canonical staff_id attribution for named people referenced in validated quality logbook records. The original user-facing name may remain as a display snapshot; staff_id is the identity key.';

create index if not exists quality_record_staff_attr_staff_idx
  on aureka_quality.quality_record_staff_attributions (staff_id, attribution_type);
create index if not exists quality_record_staff_attr_record_idx
  on aureka_quality.quality_record_staff_attributions (record_id);

alter table aureka_quality.quality_record_staff_attributions enable row level security;

drop policy if exists quality_staff_attr_read_room on aureka_quality.quality_record_staff_attributions;
create policy quality_staff_attr_read_room
  on aureka_quality.quality_record_staff_attributions for select to authenticated
  using (
    exists (
      select 1 from aureka_quality.quality_records r
      where r.id = record_id and aureka_system.has_quality_room_access(r.room_id)
    )
  );

drop policy if exists quality_staff_attr_insert_room on aureka_quality.quality_record_staff_attributions;
create policy quality_staff_attr_insert_room
  on aureka_quality.quality_record_staff_attributions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from aureka_quality.quality_records r
      where r.id = record_id and aureka_system.has_quality_room_access(r.room_id)
    )
    and exists (
      select 1 from aureka_quality.staff_directory d
      where d.id = staff_id and d.directory_status = 'available'
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
      select 1 from aureka_quality.staff_directory d
      where d.id = staff_id and d.directory_status = 'available'
    )
  );

drop policy if exists quality_staff_attr_delete_room on aureka_quality.quality_record_staff_attributions;
create policy quality_staff_attr_delete_room
  on aureka_quality.quality_record_staff_attributions for delete to authenticated
  using (
    exists (
      select 1 from aureka_quality.quality_records r
      where r.id = record_id and aureka_system.has_quality_room_access(r.room_id)
    )
  );
grant select, insert, update, delete on aureka_quality.quality_record_staff_attributions to authenticated;

alter table aureka_quality.oppe_assessments
  add column if not exists staff_id uuid references aureka_quality.staff_directory(id) on delete restrict;
create index if not exists oppe_assessments_staff_period_idx
  on aureka_quality.oppe_assessments (staff_id, period_year, period_quarter, status)
  where staff_id is not null;

commit;
