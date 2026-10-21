-- Optional diagnosis-specific phases are stored per audit; only phases supported by that master count.
alter table aureka_quality.clinical_pathway_audits
  add column if not exists additional_phases_json jsonb not null default '[]'::jsonb;

comment on column aureka_quality.clinical_pathway_audits.additional_phases_json is
  'Optional per-audit phase columns (H0 or surgical perioperative phases) activated for the patient.';

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
  v_phase text;
  v_phase_enabled boolean;
  v_template_basis text;
  v_policy text;
  v_state text;
  v_expected integer := 0;
  v_selected_item_count integer := 0;
  v_filled integer := 0;
  v_done integer := 0;
  v_not_done integer := 0;
  v_na integer := 0;
  v_inc_ready boolean := true;
  v_included boolean := true;
  v_rule_id text;
  v_rule_value text;
  v_variations_reviewed boolean := false;
  v_variations_required boolean := true;
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
    new.selected_items_json := coalesce(new.selected_items_json, '{}'::jsonb);
    new.additional_phases_json := coalesce(new.additional_phases_json, '[]'::jsonb);
    new.ppa_names := coalesce(new.ppa_names, '{}'::jsonb);
    new.variations_json := coalesce(new.variations_json, '{"reviewed":false,"items":[]}'::jsonb);
  else
    new.template_snapshot := old.template_snapshot;
    new.template_code := old.template_code;
    new.template_name := old.template_name;
    new.template_version := old.template_version;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  new.additional_phases_json := coalesce(new.additional_phases_json, '[]'::jsonb);
  if jsonb_typeof(new.additional_phases_json) <> 'array' then
    new.additional_phases_json := '[]'::jsonb;
  end if;
  v_template_basis := lower(coalesce(new.template_snapshot->>'code','') || ' ' || coalesce(new.template_snapshot->>'name',''));

  v_completion_threshold := coalesce(
    nullif(new.template_snapshot->'scoring_rules'->>'completion_threshold_pct','')::numeric, 85
  );
  v_compliance_target := coalesce(
    nullif(new.template_snapshot->'scoring_rules'->>'compliance_target_pct','')::numeric, 100
  );
  v_variations_required := coalesce(
    nullif(new.template_snapshot->'scoring_rules'->>'variation_required','')::boolean, true
  );

  for v_item in
    select value from jsonb_array_elements(coalesce(new.template_snapshot->'items','[]'::jsonb))
  loop
    v_id := v_item->>'id';
    -- Only choices actively selected by the PPA contribute to CP completion and compliance.
    if coalesce((new.selected_items_json->>v_id)::boolean, false) then
      v_selected_item_count := v_selected_item_count + 1;
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

      -- Each enabled diagnosis-specific phase adds one white, assessable cell per PPA-selected item.
      for v_phase in
        select distinct value #>> '{}'
        from jsonb_array_elements(coalesce(new.additional_phases_json, '[]'::jsonb))
      loop
        v_phase_enabled :=
          (v_phase = 'phase_h0' and v_template_basis ~ '(stroke|iskemik|haemor|hemorag|hemorrh)')
          or
          (v_phase in ('phase_preop','phase_intraop','phase_postop_h0')
            and v_template_basis ~ '(seksio sesarea|caesarean|cesarean|histerektomi|mastektomi|soft tissue tumor|stt)');
        if coalesce(v_phase_enabled, false) then
          v_expected := v_expected + 1;
          v_answer := coalesce(new.answers_json->v_id->v_phase, '{}'::jsonb);
          v_state := v_answer->>'status';
          if v_state in ('done','not_done','not_applicable') then
            v_filled := v_filled + 1;
            if v_state = 'done' then v_done := v_done + 1; end if;
            if v_state = 'not_done' then v_not_done := v_not_done + 1; end if;
            if v_state = 'not_applicable' then v_na := v_na + 1; end if;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  v_items := coalesce(new.variations_json->'items','[]'::jsonb);
  v_variations_reviewed := coalesce((new.variations_json->>'reviewed')::boolean,false);
  v_variation_count := jsonb_array_length(v_items);
  v_variations_complete := not v_variations_required or v_variations_reviewed;
  for v_variation in select value from jsonb_array_elements(v_items)
  loop
    if v_variations_required and (
       nullif(trim(coalesce(v_variation->>'date','')),'') is null
       or nullif(trim(coalesce(v_variation->>'variation','')),'') is null
       or nullif(trim(coalesce(v_variation->>'reason','')),'') is null
       or nullif(trim(coalesce(v_variation->>'justification','')),'') is null
    ) then
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
    'selected_item_count', v_selected_item_count,
    'active_phase_count', jsonb_array_length(new.additional_phases_json),
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
    'variation_required', v_variations_required,
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



