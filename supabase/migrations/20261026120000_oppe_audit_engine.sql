begin;

create or replace function aureka_system.can_manage_oppe()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aureka_system, auth
as $$
  select exists (
    select 1
    from aureka_system.user_profiles up
    join aureka_system.app_roles ar on ar.id = up.role_id
    where up.user_id = auth.uid()
      and up.is_active = true
      and up.deactivated_at is null
      and upper(ar.code) in ('ADMIN', 'PMKP')
  );
$$;

revoke all on function aureka_system.can_manage_oppe() from public;\ngrant execute on function aureka_system.can_manage_oppe() to authenticated;

create table if not exists aureka_quality.oppe_indicator_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references aureka_quality.indicator_profiles(id) on delete cascade,
  room_id bigint not null references public.master_rooms(id),
  profile_year integer not null check (profile_year between 2000 and 2200),
  is_oppe_eligible boolean not null default false,
  profession_label text not null default '',
  responsibility_field text not null default '',
  measurement_method text not null default 'manual_review'
    check (measurement_method in ('numerator_denominator', 'option_response', 'numeric_target', 'manual_review')),
  minimum_observations integer not null default 5 check (minimum_observations between 1 and 5000),
  criticality text not null default 'standard' check (criticality in ('standard', 'high', 'critical')),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oppe_rule_active_requires_configuration check (
    status <> 'active'
    or (
      is_oppe_eligible = true
      and length(btrim(profession_label)) > 0
      and length(btrim(responsibility_field)) > 0
    )
  )
);

create unique index if not exists oppe_indicator_rules_profile_profession_uidx
  on aureka_quality.oppe_indicator_rules (
    profile_id,
    lower(btrim(profession_label))
  );

create index if not exists oppe_indicator_rules_room_year_status_idx
  on aureka_quality.oppe_indicator_rules (room_id, profile_year, status, is_oppe_eligible);

alter table aureka_quality.oppe_indicator_rules enable row level security;
grant select, insert, update on aureka_quality.oppe_indicator_rules to authenticated;

drop policy if exists oppe_indicator_rules_manager_read on aureka_quality.oppe_indicator_rules;
create policy oppe_indicator_rules_manager_read
on aureka_quality.oppe_indicator_rules for select to authenticated
using (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
);

drop policy if exists oppe_indicator_rules_manager_insert on aureka_quality.oppe_indicator_rules;
create policy oppe_indicator_rules_manager_insert
on aureka_quality.oppe_indicator_rules for insert to authenticated
with check (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists oppe_indicator_rules_manager_update on aureka_quality.oppe_indicator_rules;
create policy oppe_indicator_rules_manager_update
on aureka_quality.oppe_indicator_rules for update to authenticated
using (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
)
with check (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
  and updated_by = auth.uid()
);

create table if not exists aureka_quality.oppe_assessments (
  id uuid primary key default gen_random_uuid(),
  room_id bigint not null references public.master_rooms(id),
  staff_key text not null,
  staff_identifier text,
  staff_name text not null,
  profession text not null,
  period_year integer not null check (period_year between 2000 and 2200),
  period_quarter smallint not null check (period_quarter between 1 and 4),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'validated', 'reopened', 'archived')),
  behavior_json jsonb not null default '[]'::jsonb check (jsonb_typeof(behavior_json) = 'array'),
  professionalism_json jsonb not null default '[]'::jsonb check (jsonb_typeof(professionalism_json) = 'array'),
  clinical_snapshot_json jsonb not null default '[]'::jsonb check (jsonb_typeof(clinical_snapshot_json) = 'array'),
  score_json jsonb not null default '{}'::jsonb check (jsonb_typeof(score_json) = 'object'),
  source_records_count integer not null default 0 check (source_records_count >= 0),
  evaluator_name text not null default '',
  evaluator_role text not null default '',
  assessment_notes text not null default '',
  development_plan text not null default '',
  submitted_at timestamptz,
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists oppe_assessments_active_staff_period_uidx
  on aureka_quality.oppe_assessments (room_id, staff_key, period_year, period_quarter)
  where status <> 'archived';

create index if not exists oppe_assessments_room_period_status_idx
  on aureka_quality.oppe_assessments (room_id, period_year, period_quarter, status, updated_at desc);

alter table aureka_quality.oppe_assessments enable row level security;
grant select, insert, update on aureka_quality.oppe_assessments to authenticated;

drop policy if exists oppe_assessments_manager_read on aureka_quality.oppe_assessments;
create policy oppe_assessments_manager_read
on aureka_quality.oppe_assessments for select to authenticated
using (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
);

drop policy if exists oppe_assessments_manager_insert on aureka_quality.oppe_assessments;
create policy oppe_assessments_manager_insert
on aureka_quality.oppe_assessments for insert to authenticated
with check (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists oppe_assessments_manager_update on aureka_quality.oppe_assessments;
create policy oppe_assessments_manager_update
on aureka_quality.oppe_assessments for update to authenticated
using (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
)
with check (
  aureka_system.can_manage_oppe()
  and aureka_system.has_quality_room_access(room_id)
  and updated_by = auth.uid()
);

create table if not exists aureka_quality.oppe_assessment_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references aureka_quality.oppe_assessments(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'draft_saved', 'submitted', 'validated', 'reopened', 'archived', 'updated')),
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  source_records_count integer not null default 0 check (source_records_count >= 0),
  score_snapshot_json jsonb not null default '{}'::jsonb check (jsonb_typeof(score_snapshot_json) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists oppe_assessment_events_assessment_created_idx
  on aureka_quality.oppe_assessment_events (assessment_id, created_at desc);

alter table aureka_quality.oppe_assessment_events enable row level security;
grant select on aureka_quality.oppe_assessment_events to authenticated;
revoke insert, update, delete on aureka_quality.oppe_assessment_events from anon, authenticated;

drop policy if exists oppe_assessment_events_manager_read on aureka_quality.oppe_assessment_events;
create policy oppe_assessment_events_manager_read
on aureka_quality.oppe_assessment_events for select to authenticated
using (
  aureka_system.can_manage_oppe()
  and exists (
    select 1
    from aureka_quality.oppe_assessments assessment
    where assessment.id = assessment_id
      and aureka_system.has_quality_room_access(assessment.room_id)
  )
);

create or replace function aureka_quality.log_oppe_assessment_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, aureka_quality, auth
as $$
declare
  v_event_type text;
  v_from_status text;
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    v_from_status := null;
    v_event_type := case new.status
      when 'submitted' then 'submitted'
      when 'validated' then 'validated'
      when 'reopened' then 'reopened'
      when 'archived' then 'archived'
      else 'created'
    end;
  else
    v_from_status := old.status;
    v_event_type := case
      when old.status is distinct from new.status then
        case new.status
          when 'draft' then 'draft_saved'
          when 'submitted' then 'submitted'
          when 'validated' then 'validated'
          when 'reopened' then 'reopened'
          when 'archived' then 'archived'
          else 'updated'
        end
      when new.status = 'draft' then 'draft_saved'
      else 'updated'
    end;
  end if;

  v_actor := coalesce(auth.uid(), new.updated_by, new.created_by);
  insert into aureka_quality.oppe_assessment_events (
    assessment_id, event_type, from_status, to_status, actor_id,
    source_records_count, score_snapshot_json
  ) values (
    new.id, v_event_type, v_from_status, new.status, v_actor,
    new.source_records_count, coalesce(new.score_json, '{}'::jsonb)
  );
  return new;
end;
$$;

revoke all on function aureka_quality.log_oppe_assessment_event() from public;

drop trigger if exists oppe_assessment_event_after_insert on aureka_quality.oppe_assessments;
create trigger oppe_assessment_event_after_insert
after insert on aureka_quality.oppe_assessments
for each row execute function aureka_quality.log_oppe_assessment_event();

drop trigger if exists oppe_assessment_event_after_update on aureka_quality.oppe_assessments;
create trigger oppe_assessment_event_after_update
after update on aureka_quality.oppe_assessments
for each row execute function aureka_quality.log_oppe_assessment_event();

create or replace function aureka_quality.guard_oppe_assessment_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, aureka_quality, auth
as $
declare
  v_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'OPPE baru harus dibuat sebagai draf.';
    end if;
    if new.created_by is distinct from auth.uid() then
      raise exception 'Pembuat OPPE harus sama dengan pengguna yang login.';
    end if;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Pembuat asli OPPE tidak boleh diubah.';
  end if;

  if old.status = 'archived' then
    raise exception 'OPPE yang diarsipkan tidak dapat diubah.';
  elsif old.status = 'draft' then
    v_allowed := new.status in ('draft', 'submitted', 'archived');
  elsif old.status = 'submitted' then
    v_allowed := new.status in ('validated', 'reopened', 'archived');
  elsif old.status = 'reopened' then
    v_allowed := new.status in ('reopened', 'draft', 'submitted', 'archived');
  elsif old.status = 'validated' then
    v_allowed := new.status in ('reopened', 'archived');
  end if;

  if not v_allowed then
    raise exception 'Transisi status OPPE dari % ke % tidak diizinkan.', old.status, new.status;
  end if;

  if old.status = 'submitted' and new.status = 'validated' and (
    new.room_id is distinct from old.room_id
    or new.staff_key is distinct from old.staff_key
    or new.staff_identifier is distinct from old.staff_identifier
    or new.staff_name is distinct from old.staff_name
    or new.profession is distinct from old.profession
    or new.period_year is distinct from old.period_year
    or new.period_quarter is distinct from old.period_quarter
    or new.behavior_json is distinct from old.behavior_json
    or new.professionalism_json is distinct from old.professionalism_json
    or new.clinical_snapshot_json is distinct from old.clinical_snapshot_json
    or new.score_json is distinct from old.score_json
  ) then
    raise exception 'Isi dan snapshot OPPE yang sudah disubmit tidak boleh diubah saat validasi. Kembalikan untuk revisi terlebih dahulu.';
  end if;

  if new.status = 'validated' then
    if new.validated_by is null or new.validated_by is distinct from auth.uid() then
      raise exception 'Validasi harus dicatat atas identitas pengguna yang sedang login.';
    end if;
    if new.validated_by = new.created_by then
      raise exception 'Validasi OPPE harus dilakukan oleh pengguna selain pembuat.';
    end if;
    if new.validated_at is null then
      raise exception 'Waktu validasi wajib direkam.';
    end if;
  else
    new.validated_by := null;
    new.validated_at := null;
  end if;

  return new;
end;
$;

revoke all on function aureka_quality.guard_oppe_assessment_transition() from public;

drop trigger if exists oppe_assessment_guard_before_insert on aureka_quality.oppe_assessments;
create trigger oppe_assessment_guard_before_insert
before insert on aureka_quality.oppe_assessments
for each row execute function aureka_quality.guard_oppe_assessment_transition();

drop trigger if exists oppe_assessment_guard_before_update on aureka_quality.oppe_assessments;
create trigger oppe_assessment_guard_before_update
before update on aureka_quality.oppe_assessments
for each row execute function aureka_quality.guard_oppe_assessment_transition();

create or replace function aureka_quality.touch_oppe_audit_row()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, aureka_quality, auth
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists oppe_indicator_rules_touch_updated_at on aureka_quality.oppe_indicator_rules;
create trigger oppe_indicator_rules_touch_updated_at
before update on aureka_quality.oppe_indicator_rules
for each row execute function aureka_quality.touch_oppe_audit_row();

drop trigger if exists oppe_assessments_touch_updated_at on aureka_quality.oppe_assessments;
create trigger oppe_assessments_touch_updated_at
before update on aureka_quality.oppe_assessments
for each row execute function aureka_quality.touch_oppe_audit_row();

comment on table aureka_quality.oppe_indicator_rules is
  'Versioned-by-profile OPPE eligibility and attribution rules; automatic scoring requires explicit, reviewed configuration.';
comment on table aureka_quality.oppe_assessments is
  'OPPE periodic assessments, manual evidence, validated-record clinical score snapshots, and review workflow.';
comment on table aureka_quality.oppe_assessment_events is
  'Append-only lifecycle events for OPPE assessments, including actor, status transitions, source counts, and score snapshots.';

commit;
