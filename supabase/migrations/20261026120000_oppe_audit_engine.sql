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

grant execute on function aureka_system.can_manage_oppe() to authenticated;

create table if not exists aureka_quality.oppe_indicator_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references aureka_quality.indicator_profiles(id) on delete cascade,
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

commit;
