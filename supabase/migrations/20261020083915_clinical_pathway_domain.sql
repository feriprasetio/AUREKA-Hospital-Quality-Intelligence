create table if not exists aureka_quality.clinical_pathway_templates (
  code text primary key,
  name text not null,
  icd10 text not null default '',
  status text not null default 'published' check (status in ('draft','published','retired')),
  version integer not null default 1 check (version > 0),
  template_json jsonb not null default '{}'::jsonb,
  source_filename text not null default '',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aureka_quality.clinical_pathway_audits (
  id uuid primary key default gen_random_uuid(),
  room_id bigint not null references public.master_rooms(id),
  template_code text not null,
  template_name text not null,
  template_version integer not null check (template_version > 0),
  template_snapshot jsonb not null,
  patient_name text not null,
  medical_record_no text not null default '',
  sex text not null default '',
  date_of_birth date,
  admission_date date,
  discharge_date date,
  unit_name text not null default '',
  dpjp text not null default '',
  clinical_data jsonb not null default '{}'::jsonb,
  inclusion_json jsonb not null default '{}'::jsonb,
  answers_json jsonb not null default '{}'::jsonb,
  variations_json jsonb not null default '{"reviewed":false,"items":[]}'::jsonb,
  calculation_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','submitted','validated','archived')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid default auth.uid() references auth.users(id),
  validated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz
);

create index if not exists clinical_pathway_audits_room_created_idx
  on aureka_quality.clinical_pathway_audits (room_id, created_at desc);
create index if not exists clinical_pathway_audits_code_status_idx
  on aureka_quality.clinical_pathway_audits (template_code, status, created_at desc);
create index if not exists clinical_pathway_audits_calculation_gin
  on aureka_quality.clinical_pathway_audits using gin (calculation_json);

alter table aureka_quality.clinical_pathway_templates enable row level security;
alter table aureka_quality.clinical_pathway_audits enable row level security;

grant usage on schema aureka_quality to authenticated;
grant select, insert, update, delete on aureka_quality.clinical_pathway_templates to authenticated;
grant select, insert, update, delete on aureka_quality.clinical_pathway_audits to authenticated;

drop policy if exists cp_templates_read_published_or_admin on aureka_quality.clinical_pathway_templates;
create policy cp_templates_read_published_or_admin
on aureka_quality.clinical_pathway_templates for select to authenticated
using (status = 'published' or aureka_system.is_superadmin());

drop policy if exists cp_templates_admin_insert on aureka_quality.clinical_pathway_templates;
create policy cp_templates_admin_insert
on aureka_quality.clinical_pathway_templates for insert to authenticated
with check (aureka_system.is_superadmin() and (created_by is null or created_by = auth.uid()));

drop policy if exists cp_templates_admin_update on aureka_quality.clinical_pathway_templates;
create policy cp_templates_admin_update
on aureka_quality.clinical_pathway_templates for update to authenticated
using (aureka_system.is_superadmin())
with check (aureka_system.is_superadmin());

drop policy if exists cp_templates_admin_delete on aureka_quality.clinical_pathway_templates;
create policy cp_templates_admin_delete
on aureka_quality.clinical_pathway_templates for delete to authenticated
using (aureka_system.is_superadmin());

drop policy if exists cp_audits_room_select on aureka_quality.clinical_pathway_audits;
create policy cp_audits_room_select
on aureka_quality.clinical_pathway_audits for select to authenticated
using (aureka_system.has_quality_room_access(room_id));

drop policy if exists cp_audits_room_insert on aureka_quality.clinical_pathway_audits;
create policy cp_audits_room_insert
on aureka_quality.clinical_pathway_audits for insert to authenticated
with check (
  aureka_system.has_quality_room_access(room_id)
  and created_by = auth.uid()
);

drop policy if exists cp_audits_owner_or_admin_update on aureka_quality.clinical_pathway_audits;
create policy cp_audits_owner_or_admin_update
on aureka_quality.clinical_pathway_audits for update to authenticated
using (
  aureka_system.has_quality_room_access(room_id)
  and (created_by = auth.uid() or aureka_system.is_superadmin())
)
with check (
  aureka_system.has_quality_room_access(room_id)
  and (created_by = auth.uid() or aureka_system.is_superadmin())
);

drop policy if exists cp_audits_admin_delete on aureka_quality.clinical_pathway_audits;
create policy cp_audits_admin_delete
on aureka_quality.clinical_pathway_audits for delete to authenticated
using (aureka_system.is_superadmin());

create or replace function aureka_quality.recalculate_clinical_pathway_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, aureka_quality, aureka_system, public
as $$
declare
  v_item jsonb;
  v_sched jsonb;
  v_answer jsonb;
  v_rule jsonb;
  v_variation jsonb;
  v_id text;
  v_day text;
  v_policy text;
  v_state text;
  v_expected integer := 0;
  v_filled integer := 0;
  v_done integer := 0;
  v_not_done integer := 0;
  v_na integer := 0;
  v_inc_ready boolean := true;
  v_included boolean := true;
  v_rule_id text;
  v_rule_value text;
  v_variations_reviewed boolean := false;
  v_variations_complete boolean := true;
  v_variation_count integer := 0;
  v_items jsonb;
  v_completion numeric;
  v_compliance numeric;
  v_completion_threshold numeric := 85;
  v_compliance_target numeric := 100;
  v_calculation jsonb;
  v_template jsonb;
begin
  if tg_op = 'INSERT' then
    select t.template_json
      into v_template
      from aureka_quality.clinical_pathway_templates t
     where t.code = new.template_code and t.status = 'published';

    if v_template is null then
      raise exception 'Format Clinical Pathway belum aktif di master. Minta Super Admin mengaktifkan format CP terlebih dahulu.';
    end if;

    new.template_snapshot := v_template;
    new.template_name := coalesce(v_template->>'name', new.template_name);
    new.template_version := coalesce((v_template->>'version')::integer, new.template_version);
    new.inclusion_json := coalesce(new.inclusion_json, '{}'::jsonb);
    new.answers_json := coalesce(new.answers_json, '{}'::jsonb);
    new.variations_json := coalesce(new.variations_json, '{"reviewed":false,"items":[]}'::jsonb);
  else
    new.template_snapshot := old.template_snapshot;
    new.template_code := old.template_code;
    new.template_name := old.template_name;
    new.template_version := old.template_version;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  v_completion_threshold := coalesce(
    nullif(new.template_snapshot->'scoring_rules'->>'completion_threshold_pct','')::numeric, 85
  );
  v_compliance_target := coalesce(
    nullif(new.template_snapshot->'scoring_rules'->>'compliance_target_pct','')::numeric, 100
  );

  for v_item in
    select value from jsonb_array_elements(coalesce(new.template_snapshot->'items','[]'::jsonb))
  loop
    v_id := v_item->>'id';
    for v_sched in
      select value from jsonb_array_elements(coalesce(v_item->'schedule','[]'::jsonb))
    loop
      v_policy := coalesce(v_sched->>'policy','not_scheduled');
      if v_policy in ('required','conditional') then
        v_expected := v_expected + 1;
        v_day := v_sched->>'day';
        v_answer := coalesce(new.answers_json->v_id->v_day, '{}'::jsonb);
        v_state := v_answer->>'status';
        if v_state in ('done','not_done','not_applicable') then
          v_filled := v_filled + 1;
          if v_state = 'done' then v_done := v_done + 1; end if;
          if v_state = 'not_done' then v_not_done := v_not_done + 1; end if;
          if v_state = 'not_applicable' then v_na := v_na + 1; end if;
        end if;
      end if;
    end loop;
  end loop;

  v_items := coalesce(new.variations_json->'items','[]'::jsonb);
  v_variations_reviewed := coalesce((new.variations_json->>'reviewed')::boolean,false);
  v_variation_count := jsonb_array_length(v_items);
  v_variations_complete := v_variations_reviewed;
  for v_variation in select value from jsonb_array_elements(v_items)
  loop
    if nullif(trim(coalesce(v_variation->>'date','')),'') is null
       or nullif(trim(coalesce(v_variation->>'variation','')),'') is null
       or nullif(trim(coalesce(v_variation->>'reason','')),'') is null
       or nullif(trim(coalesce(v_variation->>'justification','')),'') is null then
      v_variations_complete := false;
    end if;
  end loop;

  for v_rule in
    select value from jsonb_array_elements(coalesce(new.template_snapshot->'scoring_rules'->'inclusion_criteria','[]'::jsonb))
  loop
    v_rule_id := v_rule->>'id';
    v_rule_value := new.inclusion_json->>v_rule_id;
    if v_rule_id is null or v_rule_value is null or jsonb_typeof(new.inclusion_json->v_rule_id) <> 'boolean' then
      v_inc_ready := false;
      v_included := false;
    elsif v_rule_value::boolean is distinct from coalesce((v_rule->>'expected')::boolean,true) then
      v_included := false;
    end if;
  end loop;

  if v_expected > 0 then
    v_completion := round((v_filled::numeric / v_expected::numeric) * 100, 2);
  else
    v_completion := null;
  end if;
  if (v_done + v_not_done) > 0 then
    v_compliance := round((v_done::numeric / (v_done + v_not_done)::numeric) * 100, 2);
  else
    v_compliance := null;
  end if;

  v_calculation := jsonb_build_object(
    'expected_cells', v_expected,
    'filled_cells', v_filled,
    'completion_pct', v_completion,
    'completion_threshold_pct', v_completion_threshold,
    'completion_pass', coalesce(v_completion >= v_completion_threshold, false),
    'evaluation_cells', v_done + v_not_done,
    'compliant_cells', v_done,
    'noncompliant_cells', v_not_done,
    'not_applicable_cells', v_na,
    'compliance_pct', v_compliance,
    'compliance_target_pct', v_compliance_target,
    'compliance_pass', coalesce(v_compliance >= v_compliance_target, false),
    'inclusion_ready', v_inc_ready,
    'included', v_inc_ready and v_included,
    'variation_count', v_variation_count,
    'variation_reviewed', v_variations_reviewed,
    'variation_complete', v_variations_complete,
    'section_d_pass', v_inc_ready and v_included
       and coalesce(v_completion >= v_completion_threshold,false)
       and coalesce(v_compliance >= v_compliance_target,false)
       and v_variations_complete
  );

  new.calculation_json := v_calculation;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status <> 'validated') then
    new.validated_by := coalesce(auth.uid(), new.validated_by);
    new.validated_at := now();
  elsif new.status <> 'validated' then
    new.validated_by := null;
    new.validated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recalculate_clinical_pathway_audit on aureka_quality.clinical_pathway_audits;
create trigger trg_recalculate_clinical_pathway_audit
before insert or update on aureka_quality.clinical_pathway_audits
for each row execute function aureka_quality.recalculate_clinical_pathway_audit();

comment on table aureka_quality.clinical_pathway_templates is
  'Master Clinical Pathway templates and versioned source item/schedule configuration for AUREKA.';
comment on table aureka_quality.clinical_pathway_audits is
  'Patient-level Clinical Pathway audit with server-calculated Section D and PPA evidence in response cells.';
comment on column aureka_quality.clinical_pathway_audits.calculation_json is
  'Server-generated Section D engine; recalculated by trigger and must not be trusted from browser input.';
