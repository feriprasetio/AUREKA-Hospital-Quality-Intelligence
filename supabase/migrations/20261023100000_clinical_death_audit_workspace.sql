begin;

create table if not exists aureka_quality.clinical_death_audits (
  id uuid primary key default gen_random_uuid(),
  room_id bigint not null references public.master_rooms(id),
  source_record_id uuid references aureka_quality.quality_records(id) on delete set null,
  source_subject_key text not null,
  audit_type text not null check (audit_type in ('clinical','death')),
  review_period text not null check (review_period ~ '^\\d{4}$'),
  episode_snapshot jsonb not null default '{}'::jsonb,
  criteria_snapshot jsonb not null default '{}'::jsonb,
  review_json jsonb not null default '{}'::jsonb,
  overall_care_score smallint check (overall_care_score between 1 and 5),
  care_issue_identified text check (care_issue_identified in ('yes','no','uncertain')),
  contribution_to_outcome text check (contribution_to_outcome in ('yes','no','uncertain','not_applicable')),
  avoidability_score smallint check (avoidability_score between 1 and 6),
  status text not null default 'draft' check (status in ('draft','submitted','validated','reopened','archived')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid default auth.uid() references auth.users(id),
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clinical_death_audits_active_episode_cycle_uidx
  on aureka_quality.clinical_death_audits (room_id, audit_type, source_subject_key, review_period)
  where status <> 'archived';

create index if not exists clinical_death_audits_room_period_status_idx
  on aureka_quality.clinical_death_audits (room_id, review_period, status, updated_at desc);

alter table aureka_quality.clinical_death_audits enable row level security;

grant usage on schema aureka_quality to authenticated;
grant select, insert, update on aureka_quality.clinical_death_audits to authenticated;

drop policy if exists clinical_death_audits_room_read on aureka_quality.clinical_death_audits;
create policy clinical_death_audits_room_read
on aureka_quality.clinical_death_audits for select to authenticated
using (aureka_system.has_quality_room_access(room_id));

drop policy if exists clinical_death_audits_room_insert on aureka_quality.clinical_death_audits;
create policy clinical_death_audits_room_insert
on aureka_quality.clinical_death_audits for insert to authenticated
with check (
  aureka_system.has_quality_room_access(room_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists clinical_death_audits_owner_or_admin_update on aureka_quality.clinical_death_audits;
create policy clinical_death_audits_owner_or_admin_update
on aureka_quality.clinical_death_audits for update to authenticated
using (
  aureka_system.has_quality_room_access(room_id)
  and (created_by = auth.uid() or public.aureka_is_admin())
)
with check (
  aureka_system.has_quality_room_access(room_id)
  and (created_by = auth.uid() or public.aureka_is_admin())
  and updated_by = auth.uid()
);

create or replace function aureka_quality.touch_clinical_death_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, aureka_quality, public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists clinical_death_audits_touch_updated_at on aureka_quality.clinical_death_audits;
create trigger clinical_death_audits_touch_updated_at
before update on aureka_quality.clinical_death_audits
for each row execute function aureka_quality.touch_clinical_death_audit();

commit;
