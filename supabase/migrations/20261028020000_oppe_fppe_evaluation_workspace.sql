begin;

create table if not exists aureka_quality.oppe_fppe_evaluations (
  id uuid primary key default gen_random_uuid(),
  room_id bigint not null references public.master_rooms(id),
  staff_id uuid not null references aureka_quality.staff_directory(id) on delete restrict,
  staff_code_snapshot text not null,
  staff_name_snapshot text not null,
  profession_snapshot text not null default '',
  position_snapshot text not null default '',
  unit_snapshot text not null default '',
  evaluation_type text not null default 'initial' check (evaluation_type in ('initial','triggered')),
  trigger_reason text not null default '',
  trigger_detail text not null default '',
  period_start date,
  period_end date,
  scope_text text not null default '',
  status text not null default 'draft' check (status in ('draft','submitted','validated','reopened','archived')),
  form_json jsonb not null default '{}'::jsonb check (jsonb_typeof(form_json) = 'object'),
  summary_json jsonb not null default '{}'::jsonb check (jsonb_typeof(summary_json) = 'object'),
  review_note text not null default '',
  submitted_at timestamptz,
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oppe_fppe_period_dates_valid check (period_start is null or period_end is null or period_end >= period_start)
);

create index if not exists oppe_fppe_room_period_status_idx
  on aureka_quality.oppe_fppe_evaluations (room_id, status, updated_at desc);
create index if not exists oppe_fppe_staff_period_idx
  on aureka_quality.oppe_fppe_evaluations (staff_id, period_start desc);

alter table aureka_quality.oppe_fppe_evaluations enable row level security;
grant select, insert, update on aureka_quality.oppe_fppe_evaluations to authenticated;

drop policy if exists oppe_fppe_manager_read on aureka_quality.oppe_fppe_evaluations;
create policy oppe_fppe_manager_read
on aureka_quality.oppe_fppe_evaluations for select to authenticated
using (aureka_system.can_manage_oppe() and aureka_system.has_quality_room_access(room_id));

drop policy if exists oppe_fppe_manager_insert on aureka_quality.oppe_fppe_evaluations;
create policy oppe_fppe_manager_insert
on aureka_quality.oppe_fppe_evaluations for insert to authenticated
with check (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists oppe_fppe_manager_update on aureka_quality.oppe_fppe_evaluations;
create policy oppe_fppe_manager_update
on aureka_quality.oppe_fppe_evaluations for update to authenticated
using (aureka_system.can_manage_oppe() and aureka_system.has_quality_room_access(room_id))
with check (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
  and updated_by = auth.uid()
);

create table if not exists aureka_quality.oppe_fppe_evaluation_events (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references aureka_quality.oppe_fppe_evaluations(id) on delete cascade,
  event_type text not null check (event_type in ('created','draft_saved','submitted','validated','reopened','archived','updated')),
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  summary_snapshot_json jsonb not null default '{}'::jsonb check (jsonb_typeof(summary_snapshot_json) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists oppe_fppe_events_evaluation_created_idx
  on aureka_quality.oppe_fppe_evaluation_events (evaluation_id, created_at desc);

alter table aureka_quality.oppe_fppe_evaluation_events enable row level security;
grant select on aureka_quality.oppe_fppe_evaluation_events to authenticated;
revoke insert, update, delete on aureka_quality.oppe_fppe_evaluation_events from anon, authenticated;

drop policy if exists oppe_fppe_events_manager_read on aureka_quality.oppe_fppe_evaluation_events;
create policy oppe_fppe_events_manager_read
on aureka_quality.oppe_fppe_evaluation_events for select to authenticated
using (
  aureka_system.can_manage_oppe()
  and exists (
    select 1 from aureka_quality.oppe_fppe_evaluations evaluation
    where evaluation.id = evaluation_id
      and aureka_system.has_quality_room_access(evaluation.room_id)
  )
);

create or replace function aureka_quality.guard_oppe_fppe_evaluation_transition()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, aureka_quality, auth
as $$
declare
  v_allowed boolean := false;
  v_check_identity boolean := false;
  v_staff aureka_quality.staff_directory%rowtype;
begin
  if tg_op = 'INSERT' then
    v_check_identity := true;
  else
    v_check_identity := new.status = 'submitted'
      or new.staff_id is distinct from old.staff_id
      or new.staff_code_snapshot is distinct from old.staff_code_snapshot
      or new.staff_name_snapshot is distinct from old.staff_name_snapshot
      or new.position_snapshot is distinct from old.position_snapshot
      or new.unit_snapshot is distinct from old.unit_snapshot;
  end if;

  if v_check_identity then
    select * into v_staff from aureka_quality.staff_directory d
    where d.id = new.staff_id and d.directory_status = 'available';
    if not found then raise exception 'Tenaga FPPE tidak aktif/tersedia pada Metadata. Muat ulang roster sebelum menyimpan.'; end if;
    if new.staff_code_snapshot is distinct from v_staff.employee_code
      or new.staff_name_snapshot is distinct from v_staff.display_name
      or new.position_snapshot is distinct from v_staff.position_title then
      raise exception 'Identitas FPPE harus mengikuti kode, nama, dan jabatan terbaru dari Metadata tenaga kerja.';
    end if;
    if coalesce(new.form_json->'meta'->>'staffUuid', '') is distinct from new.staff_id::text
      or coalesce(new.form_json->'meta'->>'staffId', '') is distinct from v_staff.employee_code
      or coalesce(new.form_json->'meta'->>'staffName', '') is distinct from v_staff.display_name then
      raise exception 'Identitas pada formulir FPPE tidak konsisten dengan Metadata tenaga kerja.';
    end if;
    if not exists (
      select 1 from aureka_quality.staff_team_assignments a
      where a.staff_id = new.staff_id and a.room_id = new.room_id
        and a.assignment_status = 'active' and a.is_locked = true
    ) then
      raise exception 'Tenaga FPPE harus berasal dari roster Tim Tenaga Kerja yang aktif dan terkunci pada unit terpilih.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'FPPE baru harus dibuat sebagai draf.'; end if;
    if new.created_by is distinct from auth.uid() then raise exception 'Pembuat FPPE harus sama dengan pengguna yang login.'; end if;
    return new;
  end if;
  if new.created_by is distinct from old.created_by then raise exception 'Pembuat asli FPPE tidak boleh diubah.'; end if;
  if old.status = 'archived' then
    raise exception 'FPPE yang diarsipkan tidak dapat diubah.';
  elsif old.status = 'draft' then
    v_allowed := new.status in ('draft','submitted','archived');
  elsif old.status = 'submitted' then
    v_allowed := new.status in ('validated','reopened','archived');
  elsif old.status = 'reopened' then
    v_allowed := new.status in ('reopened','draft','submitted','archived');
  elsif old.status = 'validated' then
    v_allowed := new.status in ('reopened','archived');
  end if;
  if not v_allowed then raise exception 'Transisi status FPPE dari % ke % tidak diizinkan.', old.status, new.status; end if;
  if old.status = 'submitted' and new.status = 'validated' and (
    new.room_id is distinct from old.room_id
    or new.staff_id is distinct from old.staff_id
    or new.staff_code_snapshot is distinct from old.staff_code_snapshot
    or new.staff_name_snapshot is distinct from old.staff_name_snapshot
    or new.profession_snapshot is distinct from old.profession_snapshot
    or new.position_snapshot is distinct from old.position_snapshot
    or new.unit_snapshot is distinct from old.unit_snapshot
    or new.evaluation_type is distinct from old.evaluation_type
    or new.trigger_reason is distinct from old.trigger_reason
    or new.trigger_detail is distinct from old.trigger_detail
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.scope_text is distinct from old.scope_text
    or new.form_json is distinct from old.form_json
    or new.summary_json is distinct from old.summary_json
    or new.submitted_at is distinct from old.submitted_at
  ) then
    raise exception 'Isi FPPE yang sudah diajukan tidak boleh diubah saat validasi. Kembalikan untuk revisi terlebih dahulu.';
  end if;
  if new.status = 'validated' then
    if new.validated_by is null or new.validated_by is distinct from auth.uid() then raise exception 'Validasi harus dicatat atas identitas pengguna yang sedang login.'; end if;
    if new.validated_by = new.created_by then raise exception 'Validasi FPPE harus dilakukan oleh pengguna selain pembuat.'; end if;
    if new.validated_at is null then raise exception 'Waktu validasi wajib direkam.'; end if;
  else
    new.validated_by := null;
    new.validated_at := null;
  end if;
  return new;
end;
$$;
revoke all on function aureka_quality.guard_oppe_fppe_evaluation_transition() from public;

drop trigger if exists oppe_fppe_guard_before_insert on aureka_quality.oppe_fppe_evaluations;
create trigger oppe_fppe_guard_before_insert before insert on aureka_quality.oppe_fppe_evaluations
for each row execute function aureka_quality.guard_oppe_fppe_evaluation_transition();
drop trigger if exists oppe_fppe_guard_before_update on aureka_quality.oppe_fppe_evaluations;
create trigger oppe_fppe_guard_before_update before update on aureka_quality.oppe_fppe_evaluations
for each row execute function aureka_quality.guard_oppe_fppe_evaluation_transition();

create or replace function aureka_quality.touch_oppe_fppe_evaluation()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, aureka_quality, auth
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists oppe_fppe_touch_updated_at on aureka_quality.oppe_fppe_evaluations;
create trigger oppe_fppe_touch_updated_at before update on aureka_quality.oppe_fppe_evaluations
for each row execute function aureka_quality.touch_oppe_fppe_evaluation();

create or replace function aureka_quality.log_oppe_fppe_evaluation_event()
returns trigger language plpgsql security definer
set search_path = pg_catalog, aureka_quality, auth
as $$
declare v_event_type text; v_from_status text; v_actor uuid;
begin
  if tg_op = 'INSERT' then
    v_from_status := null; v_event_type := 'created';
  else
    v_from_status := old.status;
    v_event_type := case
      when old.status is distinct from new.status then
        case new.status when 'draft' then 'draft_saved' when 'submitted' then 'submitted'
          when 'validated' then 'validated' when 'reopened' then 'reopened'
          when 'archived' then 'archived' else 'updated' end
      when new.status = 'draft' then 'draft_saved' else 'updated'
    end;
  end if;
  v_actor := coalesce(auth.uid(), new.updated_by, new.created_by);
  insert into aureka_quality.oppe_fppe_evaluation_events
    (evaluation_id,event_type,from_status,to_status,actor_id,summary_snapshot_json)
  values (new.id,v_event_type,v_from_status,new.status,v_actor,coalesce(new.summary_json,'{}'::jsonb));
  return new;
end;
$$;
revoke all on function aureka_quality.log_oppe_fppe_evaluation_event() from public;

drop trigger if exists oppe_fppe_event_after_insert on aureka_quality.oppe_fppe_evaluations;
create trigger oppe_fppe_event_after_insert after insert on aureka_quality.oppe_fppe_evaluations
for each row execute function aureka_quality.log_oppe_fppe_evaluation_event();
drop trigger if exists oppe_fppe_event_after_update on aureka_quality.oppe_fppe_evaluations;
create trigger oppe_fppe_event_after_update after update on aureka_quality.oppe_fppe_evaluations
for each row execute function aureka_quality.log_oppe_fppe_evaluation_event();

comment on table aureka_quality.oppe_fppe_evaluations is
  'Focused Professional Practice Evaluation records linked to canonical staff metadata, with controlled review workflow.';
comment on table aureka_quality.oppe_fppe_evaluation_events is
  'Append-only lifecycle audit trail for FPPE records, including status transitions and summary snapshots.';

commit;