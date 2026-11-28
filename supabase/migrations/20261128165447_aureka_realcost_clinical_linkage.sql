-- Aggregate-only linkage candidates, never automatically write a patient/episode attribution.
create or replace function public.aureka_realcost_clinical_linkage(p_import_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $f$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP')
    or not coalesce(aureka_system.password_rotation_complete(),false)
    or not coalesce(public.aureka_has_permission('realcost.read.aggregate'),false)
    or not coalesce(public.aureka_has_permission('realcost.read.detail'),false)
    or not coalesce(public.aureka_has_permission('patient.read.identifiable'),false)
    or not coalesce(public.aureka_has_permission('patient.read.clinical_detail'),false)
  then raise exception 'Akses rekonsiliasi klinis dan biaya ditolak.' using errcode='42501'; end if;
  if not exists(select 1 from aureka_quality.realcost_imports i where i.id=p_import_id and i.status='completed')
  then raise exception 'Sumber impor selesai tidak tersedia.' using errcode='42501'; end if;
  with r0 as materialized (
    select e.id,e.admission_date,e.discharge_date,e.inacbg_code,e.class_code,e.tarif_rs,e.tariff_inacbg,e.los,
      case when trim(i.medical_record_number) ~ '^[0-9][0-9 .-]{0,20}$' then aureka_quality.normalize_no_rm(i.medical_record_number) end as mrn
    from aureka_quality.realcost_episodes e left join aureka_quality.realcost_patient_identity i on i.episode_id=e.id
    where e.import_id=p_import_id
  ), r as (
    select r0.*,count(*) over(partition by mrn,admission_date,discharge_date) as key_count from r0
  ), cp0 as materialized (
    select a.id,a.template_code,a.status,a.admission_date,a.discharge_date,
      case when trim(a.medical_record_no) ~ '^[0-9][0-9 .-]{0,20}$' then aureka_quality.normalize_no_rm(a.medical_record_no) end as mrn
    from aureka_quality.clinical_pathway_audits a
    where a.status is distinct from 'archived' and aureka_system.has_quality_room_access(a.room_id)
      and a.admission_date is not null and a.discharge_date is not null
      and exists(select 1 from r0 where r0.admission_date=a.admission_date and r0.discharge_date=a.discharge_date)
  ), cp as (
    select mrn,admission_date,discharge_date,count(*) n,min(template_code) template_code,
      bool_and(status='validated') validated from cp0 where mrn is not null
    group by mrn,admission_date,discharge_date
  ), classified as (
    select r.*,
      case when r.mrn is null or r.admission_date is null or r.discharge_date is null or r.discharge_date<r.admission_date then 'identity_or_dates_missing'
        when r.key_count<>1 or coalesce(cp.n,0)>1 then 'ambiguous'
        when cp.n is null then 'no_exact_candidate'
        when cp.validated then 'unique_validated_candidate'
        else 'unique_unvalidated_candidate' end as match_state,
      cp.template_code
    from r left join cp on r.mrn=cp.mrn and r.admission_date=cp.admission_date and r.discharge_date=cp.discharge_date
  ), grouped as (
    select match_state,count(*) n from classified group by match_state
  ), comparable as (
    select template_code,inacbg_code,class_code,count(*) n,
      round(avg(tarif_rs),2) mean_tarif_rs,round(avg(tariff_inacbg),2) mean_tariff_inacbg,
      round(avg(tarif_rs-tariff_inacbg),2) mean_gap,round(avg(los),2) mean_los,
      count(tarif_rs) tarif_n,count(tariff_inacbg) ina_n,count(los) los_n
    from classified where match_state='unique_validated_candidate'
      and template_code is not null and inacbg_code is not null and class_code is not null
    group by template_code,inacbg_code,class_code having count(*)>=5
    order by count(*) desc,template_code,inacbg_code,class_code limit 100
  )
  select jsonb_build_object('import_id',p_import_id,'method','mrn_normalized_admission_discharge_unique_candidate_v1',
    'episodes',(select count(*) from classified),
    'states',coalesce((select jsonb_agg(jsonb_build_object('state',match_state,'count',n) order by match_state) from grouped),'[]'::jsonb),
    'cohorts',coalesce((select jsonb_agg(to_jsonb(c) order by c.n desc,c.template_code,c.inacbg_code,c.class_code) from comparable c),'[]'::jsonb),
    'cohort_limit',100,'minimum_cohort',5)
  into result;
  return result;
end;
$f$;
revoke all on function public.aureka_realcost_clinical_linkage(uuid) from public,anon;
grant execute on function public.aureka_realcost_clinical_linkage(uuid) to authenticated;
comment on function public.aureka_realcost_clinical_linkage(uuid) is 'Returns only aggregate linkage candidates from completed import, using exact normalized RM and admission/discharge dates, with duplicate-key exclusion and cohort threshold. No patient identity or automatic linkage.';
