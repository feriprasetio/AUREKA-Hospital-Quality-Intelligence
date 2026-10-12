-- Patient Safety domain tables and row-level security.
-- Survey submissions are append-only and intentionally do not store auth user identifiers.

create schema if not exists aureka_patient_safety;
grant usage on schema aureka_patient_safety to authenticated;

create or replace function aureka_patient_safety.can_manage_workflow()
returns boolean
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select exists (
    select 1
    from aureka_system.user_profiles up
    join aureka_system.app_roles ar on ar.id = up.role_id
    where up.user_id = auth.uid()
      and up.is_active = true
      and ar.is_active = true
      and ar.code in ('ADMIN', 'PMKP', 'MANAGEMENT')
  );
$$;

grant execute on function aureka_patient_safety.can_manage_workflow() to authenticated;

create or replace function aureka_patient_safety.can_export_survey()
returns boolean
language sql
stable
security definer
set search_path = aureka_system, public
as $function$
  select exists (
    select 1
    from aureka_system.user_profiles up
    join aureka_system.app_roles ar on ar.id = up.role_id
    where up.user_id = auth.uid()
      and up.is_active = true
      and ar.is_active = true
      and ar.code = 'ADMIN'
  );
$function$;

grant execute on function aureka_patient_safety.can_export_survey() to authenticated;

create table if not exists aureka_patient_safety.incidents (
  id uuid primary key default gen_random_uuid(),
  incident_code text not null unique default (
    'IKP-' || to_char(now(), 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  incident_date date,
  incident_time time without time zone,
  unit_name text not null default '',
  incident_type text not null default '',
  summary text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review', 'investigation', 'closed')),
  form_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(form_data) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incidents_created_by_created_at_idx
  on aureka_patient_safety.incidents (created_by, created_at desc);
create index if not exists incidents_status_created_at_idx
  on aureka_patient_safety.incidents (status, created_at desc);
create index if not exists incidents_unit_date_idx
  on aureka_patient_safety.incidents (unit_name, incident_date desc);

create table if not exists aureka_patient_safety.investigations (
  id uuid primary key default gen_random_uuid(),
  investigation_code text not null unique default (
    'RCA-' || to_char(now(), 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  incident_id uuid not null references aureka_patient_safety.incidents(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'action_planned', 'closed')),
  form_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(form_data) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id)
);

create index if not exists investigations_status_updated_at_idx
  on aureka_patient_safety.investigations (status, updated_at desc);

create table if not exists aureka_patient_safety.culture_responses (
  response_id uuid primary key default gen_random_uuid(),
  response_code text not null unique default (
    'SC-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  survey_period text not null,
  unit_name text not null,
  profession_group text not null,
  hospital_tenure text not null default '',
  unit_tenure text not null default '',
  shift_pattern text not null default '',
  primary_role text not null default '',
  direct_patient_contact text not null default '',
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  answered_item_count integer not null default 0 check (answered_item_count between 0 and 100),
  submitted_at timestamptz not null default now()
);

create index if not exists culture_responses_submitted_at_idx
  on aureka_patient_safety.culture_responses (submitted_at desc);
create index if not exists culture_responses_period_unit_idx
  on aureka_patient_safety.culture_responses (survey_period, unit_name);

create table if not exists aureka_patient_safety.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('incident', 'investigation')),
  entity_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE')),
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists patient_safety_audit_entity_idx
  on aureka_patient_safety.audit_log (entity_type, entity_id, created_at desc);

alter table aureka_patient_safety.incidents enable row level security;
alter table aureka_patient_safety.investigations enable row level security;
alter table aureka_patient_safety.culture_responses enable row level security;
alter table aureka_patient_safety.audit_log enable row level security;

grant select, insert, update on aureka_patient_safety.incidents to authenticated;
grant select, insert, update on aureka_patient_safety.investigations to authenticated;
grant select, insert on aureka_patient_safety.culture_responses to authenticated;
grant select on aureka_patient_safety.audit_log to authenticated;

drop policy if exists "incident_select_own_or_manager" on aureka_patient_safety.incidents;
create policy "incident_select_own_or_manager"
on aureka_patient_safety.incidents for select to authenticated
using (created_by = auth.uid() or aureka_patient_safety.can_manage_workflow());

drop policy if exists "incident_insert_self" on aureka_patient_safety.incidents;
create policy "incident_insert_self"
on aureka_patient_safety.incidents for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "incident_update_draft_or_manager" on aureka_patient_safety.incidents;
create policy "incident_update_draft_or_manager"
on aureka_patient_safety.incidents for update to authenticated
using (
  aureka_patient_safety.can_manage_workflow()
  or (created_by = auth.uid() and status = 'draft')
)
with check (
  aureka_patient_safety.can_manage_workflow()
  or (created_by = auth.uid() and status in ('draft', 'submitted'))
);

drop policy if exists "investigation_select_related_or_manager" on aureka_patient_safety.investigations;
create policy "investigation_select_related_or_manager"
on aureka_patient_safety.investigations for select to authenticated
using (
  aureka_patient_safety.can_manage_workflow()
  or exists (
    select 1 from aureka_patient_safety.incidents i
    where i.id = incident_id and i.created_by = auth.uid()
  )
);

drop policy if exists "investigation_insert_manager" on aureka_patient_safety.investigations;
create policy "investigation_insert_manager"
on aureka_patient_safety.investigations for insert to authenticated
with check (aureka_patient_safety.can_manage_workflow());

drop policy if exists "investigation_update_manager" on aureka_patient_safety.investigations;
create policy "investigation_update_manager"
on aureka_patient_safety.investigations for update to authenticated
using (aureka_patient_safety.can_manage_workflow())
with check (aureka_patient_safety.can_manage_workflow());

-- Survey records are intentionally insert-only for ordinary users and contain no user_id,
-- email, or account identifier. Only the ADMIN/Superadmin role can read/export raw responses.
drop policy if exists "culture_response_insert_authenticated" on aureka_patient_safety.culture_responses;
create policy "culture_response_insert_authenticated"
on aureka_patient_safety.culture_responses for insert to authenticated
with check (true);

drop policy if exists "culture_response_select_superadmin" on aureka_patient_safety.culture_responses;
create policy "culture_response_select_superadmin"
on aureka_patient_safety.culture_responses for select to authenticated
using (aureka_patient_safety.can_export_survey());

drop policy if exists "safety_audit_select_manager" on aureka_patient_safety.audit_log;
create policy "safety_audit_select_manager"
on aureka_patient_safety.audit_log for select to authenticated
using (aureka_patient_safety.can_manage_workflow());

create or replace function aureka_patient_safety.touch_and_audit()
returns trigger
language plpgsql
security definer
set search_path = aureka_patient_safety, public
as $$
begin
  new.updated_at := now();
  insert into aureka_patient_safety.audit_log(entity_type, entity_id, action, actor_user_id)
  values (tg_argv[0], new.id, tg_op, auth.uid());
  return new;
end;
$$;

drop trigger if exists incidents_touch_and_audit on aureka_patient_safety.incidents;
create trigger incidents_touch_and_audit
before insert or update on aureka_patient_safety.incidents
for each row execute function aureka_patient_safety.touch_and_audit('incident');

drop trigger if exists investigations_touch_and_audit on aureka_patient_safety.investigations;
create trigger investigations_touch_and_audit
before insert or update on aureka_patient_safety.investigations
for each row execute function aureka_patient_safety.touch_and_audit('investigation');

-- Do not create a trigger/audit row for culture_responses: it would correlate a survey
-- submission with auth.uid() and weaken the instrument's anonymity.
