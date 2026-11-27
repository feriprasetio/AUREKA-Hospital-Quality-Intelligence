begin;

-- Save the audit and its changed staff links in the same request transaction.
-- SECURITY INVOKER preserves the existing table grants and RLS checks.
create or replace function public.aureka_save_clinical_audit(
  p_kind text,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb,
  p_staff_changes jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  pathway aureka_quality.clinical_pathway_audits;
  death aureka_quality.clinical_death_audits;
  saved jsonb;
  audit_id uuid;
  entity_kind text;
  change record;
  deleted_count integer;
  visible_count integer;
begin
  if actor is null then
    raise exception 'Sesi pengguna diperlukan.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_staff_changes) is distinct from 'object'
    or (p_id is null) <> (p_expected_updated_at is null) then
    raise exception 'Permintaan simpan audit tidak lengkap.' using errcode = '22023';
  end if;
  if p_kind = 'pathway' then
    entity_kind := 'clinical_pathway_audit';
    pathway := jsonb_populate_record(null::aureka_quality.clinical_pathway_audits, p_payload);
    if p_id is null then
      insert into aureka_quality.clinical_pathway_audits (
      room_id, patient_index_id, source_quality_record_id, template_code, template_name,
      template_version, template_snapshot, patient_name, medical_record_no, sex, date_of_birth,
      admission_date, discharge_date, unit_name, dpjp, ppa_names, clinical_data,
      selected_items_json, additional_phases_json, inclusion_json, answers_json, variations_json,
      status, created_by, updated_by
      ) values (
      pathway.room_id, pathway.patient_index_id, pathway.source_quality_record_id,
      pathway.template_code, pathway.template_name, pathway.template_version,
      pathway.template_snapshot, pathway.patient_name, pathway.medical_record_no, pathway.sex,
      pathway.date_of_birth, pathway.admission_date, pathway.discharge_date, pathway.unit_name,
      pathway.dpjp, pathway.ppa_names, pathway.clinical_data, pathway.selected_items_json,
      pathway.additional_phases_json, pathway.inclusion_json, pathway.answers_json,
      pathway.variations_json, pathway.status,
      actor, actor
      ) returning * into pathway;
    else
      update aureka_quality.clinical_pathway_audits as audit set
        (
      room_id, patient_index_id, source_quality_record_id, template_code, template_name,
      template_version, template_snapshot, patient_name, medical_record_no, sex, date_of_birth,
      admission_date, discharge_date, unit_name, dpjp, ppa_names, clinical_data,
      selected_items_json, additional_phases_json, inclusion_json, answers_json, variations_json,
      status, updated_by
        ) = (
      pathway.room_id, pathway.patient_index_id, pathway.source_quality_record_id,
      pathway.template_code, pathway.template_name, pathway.template_version,
      pathway.template_snapshot, pathway.patient_name, pathway.medical_record_no, pathway.sex,
      pathway.date_of_birth, pathway.admission_date, pathway.discharge_date, pathway.unit_name,
      pathway.dpjp, pathway.ppa_names, pathway.clinical_data, pathway.selected_items_json,
      pathway.additional_phases_json, pathway.inclusion_json, pathway.answers_json,
      pathway.variations_json, pathway.status,
      actor
        )
      where audit.id = p_id and audit.updated_at = p_expected_updated_at
      returning audit.* into pathway;
    end if;
    audit_id := pathway.id;
    saved := to_jsonb(pathway);
  elsif p_kind = 'death' then
    entity_kind := 'clinical_death_audit';
    death := jsonb_populate_record(null::aureka_quality.clinical_death_audits, p_payload);
    if p_id is null then
      insert into aureka_quality.clinical_death_audits (
      room_id, source_record_id, source_subject_key, audit_type, review_period, episode_snapshot,
      criteria_snapshot, review_json, overall_care_score, care_issue_identified,
      contribution_to_outcome, avoidability_score, status, created_by, updated_by
      ) values (
      death.room_id, death.source_record_id, death.source_subject_key, death.audit_type,
      death.review_period, death.episode_snapshot, death.criteria_snapshot, death.review_json,
      death.overall_care_score, death.care_issue_identified, death.contribution_to_outcome,
      death.avoidability_score, death.status,
      actor, actor
      ) returning * into death;
    else
      update aureka_quality.clinical_death_audits as audit set
        (
      room_id, source_record_id, source_subject_key, audit_type, review_period, episode_snapshot,
      criteria_snapshot, review_json, overall_care_score, care_issue_identified,
      contribution_to_outcome, avoidability_score, status, updated_by
        ) = (
      death.room_id, death.source_record_id, death.source_subject_key, death.audit_type,
      death.review_period, death.episode_snapshot, death.criteria_snapshot, death.review_json,
      death.overall_care_score, death.care_issue_identified, death.contribution_to_outcome,
      death.avoidability_score, death.status,
      actor
        )
      where audit.id = p_id and audit.updated_at = p_expected_updated_at
      returning audit.* into death;
    end if;
    audit_id := death.id;
    saved := to_jsonb(death);
  else
    raise exception 'Jenis audit tidak valid.' using errcode = '22023';
  end if;

  if audit_id is null then
    raise exception 'Audit tidak dapat diubah atau sudah diperbarui. Buka ulang audit sebelum menyimpan.'
      using errcode = 'P0001';
  end if;

  for change in select key as field_key, value as staff_id from jsonb_each_text(p_staff_changes)
  loop
    if (p_kind = 'death' and change.field_key <> 'dpjp')
      or (p_kind = 'pathway' and change.field_key not like 'ppa:%'
        and change.field_key not like 'performer:%') then
      raise exception 'Field atribusi audit tidak valid.' using errcode = '22023';
    end if;

    select count(*) into visible_count from aureka_quality.staff_entity_attributions as link
      where link.entity_type = entity_kind and link.entity_id = audit_id and link.field_key = change.field_key;
    delete from aureka_quality.staff_entity_attributions as link
      where link.entity_type = entity_kind and link.entity_id = audit_id and link.field_key = change.field_key;
    get diagnostics deleted_count = row_count;
    if deleted_count <> visible_count then
      raise exception 'Tautan tenaga kesehatan tidak dapat diperbarui.' using errcode = '42501';
    end if;
    if change.staff_id is not null then
      insert into aureka_quality.staff_entity_attributions
        (entity_type, entity_id, staff_id, field_key, attribution_type, created_by, updated_by)
      values (
        entity_kind, audit_id, change.staff_id::uuid, change.field_key,
        case when p_kind = 'death' or change.field_key like 'ppa:%' then 'responsible_provider'
          else 'involved_person' end,
        actor, actor
      );
    end if;
  end loop;
  return saved;
end;
$function$;

revoke all on function public.aureka_save_clinical_audit(text, uuid, timestamptz, jsonb, jsonb)
  from public, anon;
grant execute on function public.aureka_save_clinical_audit(text, uuid, timestamptz, jsonb, jsonb)
  to authenticated;

commit;
