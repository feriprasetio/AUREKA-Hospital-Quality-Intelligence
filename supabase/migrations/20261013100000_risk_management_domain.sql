-- AUREKA Risk Management domain: register, risk graph, integrated RTP, FMEA and staged approval.
-- Scoring lookup and risk-appetite bands follow Kepmenkes HK.01.07/MENKES/1354/2024.
create schema if not exists aureka_risk;
grant usage on schema aureka_risk to authenticated;

insert into aureka_system.app_roles(code, name, description, is_active)
values
  ('KABID', 'Kepala Bidang', 'Reviewer tahap pertama rencana mitigasi risiko', true),
  ('DIREKTUR', 'Direktur', 'Reviewer tahap kedua rencana mitigasi risiko', true),
  ('DEWAN_PENGAWAS', 'Dewan Pengawas', 'Penelaah dan pengesah tahap akhir rencana mitigasi risiko', true)
on conflict (code) do update
set name = excluded.name, description = excluded.description, is_active = true, updated_at = now();

create or replace function aureka_risk.current_role_code()
returns text
language sql stable security definer
set search_path = aureka_system, public
as $$
  select ar.code
  from aureka_system.user_profiles up
  join aureka_system.app_roles ar on ar.id = up.role_id
  where up.user_id = auth.uid() and up.is_active = true and ar.is_active = true
  limit 1;
$$;

create or replace function aureka_risk.current_primary_room_id()
returns bigint
language sql stable security definer
set search_path = aureka_system, public
as $$
  select up.primary_room_id
  from aureka_system.user_profiles up
  where up.user_id = auth.uid() and up.is_active = true
  limit 1;
$$;

create or replace function aureka_risk.can_manage_all()
returns boolean
language sql stable security definer
set search_path = aureka_risk, aureka_system, public
as $$
  select coalesce(aureka_risk.current_role_code() in
    ('ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS'), false);
$$;

create or replace function aureka_risk.calculate_risk_score(p_likelihood integer, p_impact integer)
returns integer
language sql immutable strict
as $$
  select case p_likelihood
    when 5 then case p_impact when 1 then 8 when 2 then 14 when 3 then 17 when 4 then 23 when 5 then 25 end
    when 4 then case p_impact when 1 then 5 when 2 then 10 when 3 then 16 when 4 then 19 when 5 then 24 end
    when 3 then case p_impact when 1 then 4 when 2 then 9 when 3 then 13 when 4 then 18 when 5 then 22 end
    when 2 then case p_impact when 1 then 2 when 2 then 7 when 3 then 11 when 4 then 15 when 5 then 21 end
    when 1 then case p_impact when 1 then 1 when 2 then 3 when 3 then 6 when 4 then 12 when 5 then 20 end
    else null
  end;
$$;

create or replace function aureka_risk.risk_level(p_score integer)
returns text
language sql immutable strict
as $$
  select case
    when p_score >= 20 then 'Sangat Tinggi'
    when p_score >= 15 then 'Tinggi'
    when p_score >= 10 then 'Sedang'
    when p_score >= 5 then 'Rendah'
    else 'Sangat Rendah'
  end;
$$;

create table if not exists aureka_risk.risk_register (
  id uuid primary key default gen_random_uuid(),
  risk_code text not null unique default ('RS-PMKP-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  unit_id bigint references public.master_rooms(id),
  unit_name text not null,
  category text not null default 'Operasional',
  objective text not null default '',
  risk_event text not null,
  causes text not null default '',
  impacts text not null default '',
  existing_controls text not null default '',
  likelihood smallint not null default 3 check (likelihood between 1 and 5),
  impact smallint not null default 3 check (impact between 1 and 5),
  risk_score smallint not null default 13 check (risk_score between 1 and 25),
  risk_level text not null default 'Sedang' check (risk_level in ('Sangat Rendah','Rendah','Sedang','Tinggi','Sangat Tinggi')),
  residual_likelihood smallint check (residual_likelihood between 1 and 5),
  residual_impact smallint check (residual_impact between 1 and 5),
  residual_score smallint check (residual_score between 1 and 25),
  residual_level text check (residual_level in ('Sangat Rendah','Rendah','Sedang','Tinggi','Sangat Tinggi')),
  owner_name text not null default '',
  due_date date,
  status text not null default 'Open' check (status in ('Open','In Progress','Controlled','Accepted')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((residual_likelihood is null and residual_impact is null and residual_score is null and residual_level is null)
      or (residual_likelihood is not null and residual_impact is not null and residual_score is not null and residual_level is not null))
);

create index if not exists risk_register_score_idx on aureka_risk.risk_register (risk_score desc, updated_at desc);
create index if not exists risk_register_unit_level_idx on aureka_risk.risk_register (unit_id, risk_level);
create index if not exists risk_register_status_due_idx on aureka_risk.risk_register (status, due_date);
create index if not exists risk_register_category_idx on aureka_risk.risk_register (category);

create or replace function aureka_risk.recalculate_risk_register()
returns trigger
language plpgsql
set search_path = aureka_risk, public
as $$
begin
  new.risk_score := aureka_risk.calculate_risk_score(new.likelihood, new.impact);
  new.risk_level := aureka_risk.risk_level(new.risk_score);
  if new.residual_likelihood is null and new.residual_impact is null then
    new.residual_score := null;
    new.residual_level := null;
  elsif new.residual_likelihood is null or new.residual_impact is null then
    raise exception 'Penilaian residual harus mengisi level kemungkinan dan dampak sekaligus.';
  else
    new.residual_score := aureka_risk.calculate_risk_score(new.residual_likelihood, new.residual_impact);
    new.residual_level := aureka_risk.risk_level(new.residual_score);
  end if;
  if new.status = 'Accepted' and coalesce(new.residual_score, new.risk_score) >= 10 then
    raise exception 'Risiko hanya dapat ditetapkan Accepted jika hasil penilaian terbaru berada pada area penerimaan (skor di bawah 10).';
  end if;
  if new.status = 'Controlled' and (new.residual_score is null or new.residual_score >= 10) then
    raise exception 'Status Controlled mensyaratkan penilaian residual terverifikasi pada area penerimaan (skor di bawah 10).';
  end if;
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$;

drop trigger if exists risk_register_recalculate on aureka_risk.risk_register;
create trigger risk_register_recalculate
before insert or update on aureka_risk.risk_register
for each row execute function aureka_risk.recalculate_risk_register();

create table if not exists aureka_risk.fmea_analyses (
  id uuid primary key default gen_random_uuid(),
  fmea_code text not null unique default ('HFMEA-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  risk_register_id uuid references aureka_risk.risk_register(id) on delete restrict,
  unit_name text not null,
  process_name text not null default '',
  failure_mode text not null,
  failure_effect text not null default '',
  causes text not null default '',
  existing_controls text not null default '',
  severity smallint not null default 3 check (severity between 1 and 5),
  occurrence smallint not null default 3 check (occurrence between 1 and 5),
  detection smallint not null default 3 check (detection between 1 and 5),
  rpn smallint not null default 27 check (rpn between 1 and 125),
  priority text not null default 'Sedang' check (priority in ('Rendah','Sedang','Tinggi')),
  action_plan text not null default '',
  owner_name text not null default '',
  target_date date,
  status text not null default 'Open' check (status in ('Open','In Progress','Evaluated','Closed')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fmea_analyses_rpn_idx on aureka_risk.fmea_analyses (rpn desc);
create index if not exists fmea_analyses_risk_idx on aureka_risk.fmea_analyses (risk_register_id);

create or replace function aureka_risk.recalculate_fmea()
returns trigger
language plpgsql
set search_path = aureka_risk, public
as $$
begin
  new.rpn := new.severity * new.occurrence * new.detection;
  new.priority := case when new.severity >= 4 or new.rpn >= 30 then 'Tinggi'
                       when new.rpn >= 15 then 'Sedang' else 'Rendah' end;
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists fmea_recalculate on aureka_risk.fmea_analyses;
create trigger fmea_recalculate
before insert or update on aureka_risk.fmea_analyses
for each row execute function aureka_risk.recalculate_fmea();

create table if not exists aureka_risk.risk_relationships (
  id uuid primary key default gen_random_uuid(),
  source_risk_id uuid not null references aureka_risk.risk_register(id) on delete restrict,
  target_risk_id uuid not null references aureka_risk.risk_register(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('shared_cause','shared_control','upstream_dependency','downstream_effect','reinforcing','duplicate')),
  description text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (source_risk_id <> target_risk_id),
  unique (source_risk_id, target_risk_id, relationship_type)
);
create index if not exists risk_relationships_source_idx on aureka_risk.risk_relationships (source_risk_id);
create index if not exists risk_relationships_target_idx on aureka_risk.risk_relationships (target_risk_id);

create table if not exists aureka_risk.mitigation_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique default ('RTP-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  title text not null,
  objective text not null default '',
  action_plan text not null,
  expected_output text not null default '',
  owner_name text not null default '',
  owner_room_id bigint references public.master_rooms(id),
  target_date date not null,
  target_likelihood smallint check (target_likelihood between 1 and 5),
  target_impact smallint check (target_impact between 1 and 5),
  status text not null default 'draft' check (status in (
    'draft','pending_kabid','pending_director','pending_board','approved',
    'in_progress','evaluated','closed','returned_unit','returned_kabid','returned_director'
  )),
  created_by uuid not null default auth.uid() references auth.users(id),
  kabid_approved_by uuid references auth.users(id),
  kabid_approved_at timestamptz,
  director_approved_by uuid references auth.users(id),
  director_approved_at timestamptz,
  board_acknowledged_by uuid references auth.users(id),
  board_acknowledged_at timestamptz,
  last_return_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target_likelihood is null and target_impact is null) or (target_likelihood is not null and target_impact is not null))
);
create index if not exists mitigation_plans_status_target_idx on aureka_risk.mitigation_plans (status, target_date);
create index if not exists mitigation_plans_room_idx on aureka_risk.mitigation_plans (owner_room_id, updated_at desc);

create table if not exists aureka_risk.mitigation_plan_risks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references aureka_risk.mitigation_plans(id) on delete restrict,
  risk_id uuid not null references aureka_risk.risk_register(id) on delete restrict,
  target_likelihood smallint check (target_likelihood between 1 and 5),
  target_impact smallint check (target_impact between 1 and 5),
  created_at timestamptz not null default now(),
  unique (plan_id, risk_id),
  check ((target_likelihood is null and target_impact is null) or (target_likelihood is not null and target_impact is not null))
);
create index if not exists mitigation_plan_risks_plan_idx on aureka_risk.mitigation_plan_risks (plan_id);
create index if not exists mitigation_plan_risks_risk_idx on aureka_risk.mitigation_plan_risks (risk_id);

create table if not exists aureka_risk.risk_workflow_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references aureka_risk.mitigation_plans(id) on delete restrict,
  from_status text not null,
  to_status text not null,
  action text not null,
  note text not null default '',
  actor_id uuid references auth.users(id),
  actor_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists risk_workflow_events_plan_idx on aureka_risk.risk_workflow_events (plan_id, created_at desc);

create or replace function aureka_risk.can_edit_risk(p_risk_id uuid)
returns boolean
language sql stable security definer
set search_path = aureka_risk, aureka_system, public
as $$
  select coalesce(aureka_risk.can_manage_all(), false)
    or exists (
      select 1 from aureka_risk.risk_register r
      where r.id = p_risk_id and r.unit_id = aureka_risk.current_primary_room_id()
    );
$$;

create or replace function aureka_risk.transition_mitigation_plan(p_plan_id uuid, p_action text, p_note text default '')
returns text
language plpgsql security definer
set search_path = aureka_risk, aureka_system, public
as $$
declare
  v_plan aureka_risk.mitigation_plans%rowtype;
  v_role text;
  v_next text;
  v_note text := coalesce(trim(p_note), '');
  v_actor_name text;
begin
  select * into v_plan from aureka_risk.mitigation_plans where id = p_plan_id for update;
  if not found then raise exception 'Rencana mitigasi tidak ditemukan.'; end if;
  v_role := aureka_risk.current_role_code();
  select coalesce(full_name, 'Pengguna AUREKA') into v_actor_name
    from aureka_system.user_profiles where user_id = auth.uid();
  v_actor_name := coalesce(v_actor_name, 'Pengguna AUREKA');

  if p_action in ('submit','resubmit') then
    if not (v_plan.created_by = auth.uid() or v_plan.owner_room_id = aureka_risk.current_primary_room_id()
            or v_role in ('ADMIN','PMKP')) then
      raise exception 'Hanya penyusun, pemilik unit, atau pengelola yang dapat mengirim rencana.';
    end if;
    v_next := case v_plan.status
      when 'draft' then 'pending_kabid'
      when 'returned_unit' then 'pending_kabid'
      when 'returned_kabid' then 'pending_director'
      when 'returned_director' then 'pending_board'
      else null end;
    if v_next is null then raise exception 'Status rencana tidak dapat dikirim pada tahap ini.'; end if;
  elsif p_action = 'approve' then
    if v_plan.status = 'pending_kabid' and v_role = 'KABID' then
      v_next := 'pending_director';
    elsif v_plan.status = 'pending_director' and v_role = 'DIREKTUR' then
      v_next := 'pending_board';
    elsif v_plan.status = 'pending_board' and v_role = 'DEWAN_PENGAWAS' then
      v_next := 'approved';
    else
      raise exception 'Persetujuan harus mengikuti urutan Kabid, Direktur, kemudian Dewan Pengawas.';
    end if;
    if v_note = '' then raise exception 'Catatan persetujuan wajib diisi untuk jejak keputusan.'; end if;
  elsif p_action = 'return' then
    if v_note = '' then raise exception 'Alasan pengembalian wajib diisi.'; end if;
    if v_plan.status = 'pending_kabid' and v_role = 'KABID' then
      v_next := 'returned_unit';
    elsif v_plan.status = 'pending_director' and v_role = 'DIREKTUR' then
      v_next := 'returned_kabid';
    elsif v_plan.status = 'pending_board' and v_role = 'DEWAN_PENGAWAS' then
      v_next := 'returned_director';
    else
      raise exception 'Hanya pejabat pada tahap aktif yang dapat mengembalikan rencana.';
    end if;
  elsif p_action = 'start' then
    if v_plan.status <> 'approved' then raise exception 'Pelaksanaan hanya dapat dimulai setelah persetujuan berjenjang selesai.'; end if;
    if not (v_plan.created_by = auth.uid() or v_plan.owner_room_id = aureka_risk.current_primary_room_id()
            or v_role in ('PMKP','KABID','DIREKTUR')) then
      raise exception 'Akses tidak cukup untuk memulai pelaksanaan.';
    end if;
    v_next := 'in_progress';
  elsif p_action = 'evaluate' then
    if v_plan.status <> 'in_progress' then raise exception 'Evaluasi hanya tersedia untuk rencana yang sedang berjalan.'; end if;
    if v_note = '' then raise exception 'Hasil evaluasi wajib diisi.'; end if;
    if not (v_plan.created_by = auth.uid() or v_plan.owner_room_id = aureka_risk.current_primary_room_id()
            or v_role in ('PMKP','KABID','DIREKTUR')) then
      raise exception 'Akses tidak cukup untuk mengevaluasi rencana.';
    end if;
    v_next := 'evaluated';
  elsif p_action = 'close' then
    if v_plan.status <> 'evaluated' then raise exception 'Rencana harus dievaluasi sebelum ditutup.'; end if;
    if v_role not in ('PMKP','KABID','DIREKTUR') then raise exception 'Penutupan rencana memerlukan penelaahan PMKP atau manajemen.'; end if;
    if not exists (select 1 from aureka_risk.mitigation_plan_risks m where m.plan_id = v_plan.id) then
      raise exception 'Rencana belum memiliki risiko terkait.';
    end if;
    if exists (
      select 1 from aureka_risk.mitigation_plan_risks m
      join aureka_risk.risk_register r on r.id = m.risk_id
      where m.plan_id = v_plan.id and (r.residual_score is null or r.residual_score >= 10)
    ) then
      raise exception 'Penutupan ditolak: seluruh risiko terkait harus memiliki residual terverifikasi di area penerimaan (skor di bawah 10).';
    end if;
    if v_note = '' then raise exception 'Catatan penutupan wajib diisi.'; end if;
    v_next := 'closed';
  else
    raise exception 'Aksi workflow tidak dikenal.';
  end if;

  update aureka_risk.mitigation_plans
  set status = v_next,
      kabid_approved_by = case when p_action = 'approve' and v_plan.status = 'pending_kabid' then auth.uid() else kabid_approved_by end,
      kabid_approved_at = case when p_action = 'approve' and v_plan.status = 'pending_kabid' then now() else kabid_approved_at end,
      director_approved_by = case when p_action = 'approve' and v_plan.status = 'pending_director' then auth.uid() else director_approved_by end,
      director_approved_at = case when p_action = 'approve' and v_plan.status = 'pending_director' then now() else director_approved_at end,
      board_acknowledged_by = case when p_action = 'approve' and v_plan.status = 'pending_board' then auth.uid() else board_acknowledged_by end,
      board_acknowledged_at = case when p_action = 'approve' and v_plan.status = 'pending_board' then now() else board_acknowledged_at end,
      last_return_note = case when p_action = 'return' then v_note else last_return_note end,
      updated_at = now()
  where id = v_plan.id;

  insert into aureka_risk.risk_workflow_events(plan_id, from_status, to_status, action, note, actor_id, actor_name)
  values (v_plan.id, v_plan.status, v_next, p_action, v_note, auth.uid(), v_actor_name);
  return v_next;
end;
$$;

grant execute on function aureka_risk.current_role_code() to authenticated;
grant execute on function aureka_risk.current_primary_room_id() to authenticated;
grant execute on function aureka_risk.can_manage_all() to authenticated;
grant execute on function aureka_risk.calculate_risk_score(integer, integer) to authenticated;
grant execute on function aureka_risk.risk_level(integer) to authenticated;
grant execute on function aureka_risk.can_edit_risk(uuid) to authenticated;
grant execute on function aureka_risk.transition_mitigation_plan(uuid, text, text) to authenticated;

alter table aureka_risk.risk_register enable row level security;
alter table aureka_risk.fmea_analyses enable row level security;
alter table aureka_risk.risk_relationships enable row level security;
alter table aureka_risk.mitigation_plans enable row level security;
alter table aureka_risk.mitigation_plan_risks enable row level security;
alter table aureka_risk.risk_workflow_events enable row level security;

grant select, insert, update, delete on aureka_risk.risk_register to authenticated;
grant select, insert, update, delete on aureka_risk.fmea_analyses to authenticated;
grant select, insert, delete on aureka_risk.risk_relationships to authenticated;
grant select, insert, delete on aureka_risk.mitigation_plans to authenticated;
grant select, insert on aureka_risk.mitigation_plan_risks to authenticated;
grant select on aureka_risk.risk_workflow_events to authenticated;

drop policy if exists risk_register_read_authenticated on aureka_risk.risk_register;
create policy risk_register_read_authenticated on aureka_risk.risk_register
for select to authenticated using (true);
drop policy if exists risk_register_insert_authorized_unit on aureka_risk.risk_register;
create policy risk_register_insert_authorized_unit on aureka_risk.risk_register
for insert to authenticated with check (
  created_by = auth.uid()
  and (unit_id = aureka_risk.current_primary_room_id() or aureka_risk.can_manage_all())
);
drop policy if exists risk_register_update_authorized_unit on aureka_risk.risk_register;
create policy risk_register_update_authorized_unit on aureka_risk.risk_register
for update to authenticated
using (unit_id = aureka_risk.current_primary_room_id() or aureka_risk.can_manage_all())
with check (unit_id = aureka_risk.current_primary_room_id() or aureka_risk.can_manage_all());
drop policy if exists risk_register_delete_managers on aureka_risk.risk_register;
create policy risk_register_delete_managers on aureka_risk.risk_register
for delete to authenticated using (aureka_risk.current_role_code() in ('ADMIN','PMKP') or unit_id = aureka_risk.current_primary_room_id());

drop policy if exists fmea_read_authenticated on aureka_risk.fmea_analyses;
create policy fmea_read_authenticated on aureka_risk.fmea_analyses
for select to authenticated using (true);
drop policy if exists fmea_insert_by_unit_or_manager on aureka_risk.fmea_analyses;
create policy fmea_insert_by_unit_or_manager on aureka_risk.fmea_analyses
for insert to authenticated with check (
  created_by = auth.uid() and (
    aureka_risk.can_manage_all()
    or exists (select 1 from public.master_rooms mr where mr.id = aureka_risk.current_primary_room_id() and mr.name = unit_name)
  )
);
drop policy if exists fmea_update_by_unit_or_manager on aureka_risk.fmea_analyses;
create policy fmea_update_by_unit_or_manager on aureka_risk.fmea_analyses
for update to authenticated
using (
  aureka_risk.can_manage_all()
  or exists (select 1 from public.master_rooms mr where mr.id = aureka_risk.current_primary_room_id() and mr.name = unit_name)
)
with check (
  aureka_risk.can_manage_all()
  or exists (select 1 from public.master_rooms mr where mr.id = aureka_risk.current_primary_room_id() and mr.name = unit_name)
);
drop policy if exists fmea_delete_managers on aureka_risk.fmea_analyses;
create policy fmea_delete_managers on aureka_risk.fmea_analyses
for delete to authenticated using (aureka_risk.current_role_code() in ('ADMIN','PMKP'));

drop policy if exists risk_relationships_read_authenticated on aureka_risk.risk_relationships;
create policy risk_relationships_read_authenticated on aureka_risk.risk_relationships
for select to authenticated using (true);
drop policy if exists risk_relationships_insert_authorized on aureka_risk.risk_relationships;
create policy risk_relationships_insert_authorized on aureka_risk.risk_relationships
for insert to authenticated with check (
  created_by = auth.uid() and (
    aureka_risk.can_manage_all()
    or aureka_risk.can_edit_risk(source_risk_id) or aureka_risk.can_edit_risk(target_risk_id)
  )
);
drop policy if exists risk_relationships_delete_authorized on aureka_risk.risk_relationships;
create policy risk_relationships_delete_authorized on aureka_risk.risk_relationships
for delete to authenticated using (
  aureka_risk.can_manage_all()
  or (created_by = auth.uid() and (aureka_risk.can_edit_risk(source_risk_id) or aureka_risk.can_edit_risk(target_risk_id)))
);

drop policy if exists mitigation_plans_read_authenticated on aureka_risk.mitigation_plans;
create policy mitigation_plans_read_authenticated on aureka_risk.mitigation_plans
for select to authenticated using (true);
drop policy if exists mitigation_plans_insert_authorized on aureka_risk.mitigation_plans;
create policy mitigation_plans_insert_authorized on aureka_risk.mitigation_plans
for insert to authenticated with check (
  created_by = auth.uid() and (owner_room_id = aureka_risk.current_primary_room_id() or aureka_risk.can_manage_all())
);
-- Workflow status updates are only available through the SECURITY DEFINER transition function.
-- No direct UPDATE grant is given to authenticated clients, preventing approval-stage bypass.
drop policy if exists mitigation_plans_delete_draft on aureka_risk.mitigation_plans;
create policy mitigation_plans_delete_draft on aureka_risk.mitigation_plans
for delete to authenticated using (created_by = auth.uid() and status = 'draft');

drop policy if exists mitigation_plan_risks_read_authenticated on aureka_risk.mitigation_plan_risks;
create policy mitigation_plan_risks_read_authenticated on aureka_risk.mitigation_plan_risks
for select to authenticated using (true);
drop policy if exists mitigation_plan_risks_insert_draft_owner on aureka_risk.mitigation_plan_risks;
create policy mitigation_plan_risks_insert_draft_owner on aureka_risk.mitigation_plan_risks
for insert to authenticated with check (
  exists (
    select 1 from aureka_risk.mitigation_plans p
    where p.id = plan_id and p.created_by = auth.uid() and p.status = 'draft'
  )
  and (
    aureka_risk.can_edit_risk(risk_id) or aureka_risk.can_manage_all()
    or exists (
      select 1 from aureka_risk.risk_relationships rel
      where (rel.source_risk_id = risk_id and aureka_risk.can_edit_risk(rel.target_risk_id))
         or (rel.target_risk_id = risk_id and aureka_risk.can_edit_risk(rel.source_risk_id))
    )
  )
);

drop policy if exists risk_workflow_events_read_related_or_manager on aureka_risk.risk_workflow_events;
create policy risk_workflow_events_read_related_or_manager on aureka_risk.risk_workflow_events
for select to authenticated using (
  exists (select 1 from aureka_risk.mitigation_plans p where p.id = plan_id and
    (p.created_by = auth.uid() or p.owner_room_id = aureka_risk.current_primary_room_id() or aureka_risk.can_manage_all()))
);
