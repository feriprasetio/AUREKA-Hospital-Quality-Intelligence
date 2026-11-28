-- One improvement action can reference many existing source objects; no operational record is duplicated.
create table if not exists aureka_governance.action_source_links (
  action_id uuid not null references aureka_governance.actions(id) on delete restrict,
  source_kind text not null check(source_kind in ('indicator','incident','investigation','risk','fmea','mitigation','pathway','clinical_audit','priority','annual_activity','meeting','education','sop')),
  source_id uuid not null,
  linked_at timestamptz not null default now(),
  linked_by uuid not null,
  unlinked_at timestamptz,
  unlinked_by uuid,
  primary key(action_id,source_kind,source_id)
);
alter table aureka_governance.action_source_links enable row level security;
revoke all on aureka_governance.action_source_links from public,anon,authenticated;
create index if not exists action_source_links_reverse_idx on aureka_governance.action_source_links(source_kind,source_id) where unlinked_at is null;
-- Catalog deliberately omits patient/staff names and free-text clinical findings.
create or replace function aureka_governance.improvement_source_catalog(p_kind text)
returns table(source_id uuid,label text,source_status text,room_id bigint,source_date date)
language plpgsql stable security invoker set search_path=''
as $f$
begin
  if auth.uid() is null or coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP')
    or not coalesce(aureka_system.password_rotation_complete(),false)
  then raise exception 'Akses relasi RTL ditolak.' using errcode='42501'; end if;
  case p_kind
  when 'indicator' then
    if coalesce(public.aureka_has_permission('quality.read.aggregate'),false) then
      return query select t.id,concat(t.code,' · ',t.title,' · ',t.profile_year),t.status,t.room_id,t.created_at::date
      from aureka_quality.indicator_profiles t where aureka_system.has_quality_room_access(t.room_id);
    end if;
  when 'incident' then
    if coalesce(public.aureka_has_permission('incident.read'),false) and aureka_patient_safety.can_manage_workflow() then
      return query select t.id,concat(t.incident_code,' · ',t.incident_date),t.status,t.room_id,t.incident_date
      from aureka_patient_safety.incidents t where aureka_system.can_access_room_or_global(t.room_id);
    end if;
  when 'investigation' then
    if coalesce(public.aureka_has_permission('incident.read.investigation_detail'),false) and aureka_patient_safety.can_manage_workflow() then
      return query select t.id,concat(t.investigation_code,' · ',i.incident_code),t.status,i.room_id,t.created_at::date
      from aureka_patient_safety.investigations t join aureka_patient_safety.incidents i on i.id=t.incident_id
      where aureka_system.can_access_room_or_global(i.room_id);
    end if;
  when 'risk' then
    if coalesce(public.aureka_has_permission('risk.read'),false) then
      return query select t.id,concat(t.risk_code,' · ',t.unit_name),t.status,t.unit_id,t.created_at::date
      from aureka_risk.risk_register t where aureka_system.can_access_room_or_global(t.unit_id);
    end if;
  when 'fmea' then
    if coalesce(public.aureka_has_permission('risk.read'),false) then
      return query select t.id,concat(t.fmea_code,' · ',t.analysis_type),t.status,r.unit_id,t.created_at::date
      from aureka_risk.fmea_analyses t left join aureka_risk.risk_register r on r.id=t.risk_register_id
      where aureka_system.can_access_room_or_global(r.unit_id)
        and (t.analysis_type is distinct from 'reactive' or (coalesce(public.aureka_has_permission('incident.read.investigation_detail'),false) and aureka_patient_safety.can_manage_workflow()));
    end if;
  when 'mitigation' then
    if coalesce(public.aureka_has_permission('risk.read'),false) then
      return query select t.id,concat(t.plan_code,' · ',t.title),t.status,t.owner_room_id,t.created_at::date
      from aureka_risk.mitigation_plans t where aureka_system.can_access_room_or_global(t.owner_room_id);
    end if;
  when 'pathway' then
    if coalesce(public.aureka_has_permission('patient.read.clinical_detail'),false) then
      return query select t.id,concat(t.template_code,' · ',t.admission_date,' · ',left(t.id::text,8)),t.status,t.room_id,t.admission_date
      from aureka_quality.clinical_pathway_audits t where aureka_system.has_quality_room_access(t.room_id);
    end if;
  when 'clinical_audit' then
    if coalesce(public.aureka_has_permission('patient.read.clinical_detail'),false) then
      return query select t.id,concat(t.audit_type,' · ',t.review_period,' · ',left(t.id::text,8)),t.status,t.room_id,t.created_at::date
      from aureka_quality.clinical_death_audits t where aureka_system.has_quality_room_access(t.room_id);
    end if;
  when 'priority' then
    return query select t.id,concat(t.code,' · ',t.title,' · ',t.program_year),t.status,t.owner_room_id,t.created_at::date
    from aureka_governance.annual_priority_areas t where aureka_system.can_access_room_or_global(t.owner_room_id);
  when 'annual_activity' then
    return query select t.id,concat(t.title,' · ',t.program_year),t.status,t.owner_room_id,t.start_date
    from aureka_governance.annual_program_activities t where aureka_system.can_access_room_or_global(t.owner_room_id);
  when 'meeting' then
    if aureka_system.can_manage_pmkp_workspace() then
      return query select t.id,concat(t.meeting_code,' · ',t.meeting_date),t.status,t.room_id,t.meeting_date
      from aureka_system.pmkp_meetings t where aureka_system.can_access_room_or_global(t.room_id);
    end if;
  when 'education' then
    if aureka_system.can_manage_education() then
      return query select t.id,concat(t.event_code,' · ',t.title),t.status,t.room_id,t.start_at::date
      from aureka_system.education_events t where aureka_system.can_access_room_or_global(t.room_id);
    end if;
  when 'sop' then
    if coalesce(public.aureka_has_permission('quality.read.aggregate'),false) then
      return query select t.id,concat(t.document_number,' · ',t.title,' · Rev ',t.revision_number),t.status,null::bigint,t.issue_date
      from aureka_quality.standard_operating_procedures t;
    end if;
  else raise exception 'Jenis sumber tidak valid.' using errcode='22023';
  end case;
end;
$f$;
revoke all on function aureka_governance.improvement_source_catalog(text) from public,anon,authenticated;
create or replace function public.aureka_improvement_sources(p_kind text,p_query text default '',p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP') or not coalesce(aureka_system.password_rotation_complete(),false)
  then raise exception 'Akses relasi RTL ditolak.' using errcode='42501'; end if;
  if length(coalesce(p_query,''))>100 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Filter tidak valid.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.source_date desc nulls last,x.source_id),'[]'::jsonb) into result
  from (select * from aureka_governance.improvement_source_catalog(p_kind) c
    where coalesce(p_query,'')='' or strpos(lower(c.label),lower(p_query))>0 or c.source_id::text=p_query
    order by c.source_date desc nulls last,c.source_id limit p_limit) x;
  return result;
end;
$f$;
create or replace function public.aureka_action_sources(p_action_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP') or not coalesce(aureka_system.password_rotation_complete(),false)
  then raise exception 'Akses relasi RTL ditolak.' using errcode='42501'; end if;
  if not exists(select 1 from aureka_governance.actions a where a.id=p_action_id and aureka_system.can_access_room_or_global(a.assigned_room_id)) then raise exception 'RTL di luar cakupan.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('source_kind',l.source_kind,'source_id',l.source_id,'label',c.label,'source_status',c.source_status,'linked_at',l.linked_at,'room_id',c.room_id) order by l.linked_at desc),'[]'::jsonb)
  into result from aureka_governance.action_source_links l
  join lateral (select * from aureka_governance.improvement_source_catalog(l.source_kind) s where s.source_id=l.source_id) c on true
  where l.action_id=p_action_id and l.unlinked_at is null;
  return result;
end;
$f$;
create or replace function public.aureka_set_action_source(p_action_id uuid,p_kind text,p_source_id uuid,p_active boolean)
returns boolean language plpgsql security definer set search_path=''
as $f$
declare v_source record;
begin
  if auth.uid() is null or coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP') or not coalesce(aureka_system.password_rotation_complete(),false)
  then raise exception 'Akses relasi RTL ditolak.' using errcode='42501'; end if;
  if p_active is null or p_action_id is null or p_source_id is null then raise exception 'Relasi tidak lengkap.' using errcode='22023'; end if;
  perform 1 from aureka_governance.actions a where a.id=p_action_id and aureka_system.can_access_room_or_global(a.assigned_room_id) for update;
  if not found then raise exception 'RTL di luar cakupan.' using errcode='42501'; end if;
  select * into v_source from aureka_governance.improvement_source_catalog(p_kind) c where c.source_id=p_source_id;
  if not found then raise exception 'Sumber tidak tersedia atau di luar cakupan.' using errcode='42501'; end if;
  if p_active then
    insert into aureka_governance.action_source_links(action_id,source_kind,source_id,linked_by)
    values(p_action_id,p_kind,p_source_id,auth.uid())
    on conflict(action_id,source_kind,source_id) do update set linked_at=now(),linked_by=auth.uid(),unlinked_at=null,unlinked_by=null
    where aureka_governance.action_source_links.unlinked_at is not null;
  else
    update aureka_governance.action_source_links set unlinked_at=now(),unlinked_by=auth.uid()
    where action_id=p_action_id and source_kind=p_kind and source_id=p_source_id and unlinked_at is null;
  end if;
  if found then
    perform aureka_governance.write_audit(case when p_active then 'link' else 'unlink' end,'action_source',p_action_id::text,jsonb_build_object('source_kind',p_kind,'source_id',p_source_id));
  end if;
  return true;
end;
$f$;
revoke all on function public.aureka_improvement_sources(text,text,integer),public.aureka_action_sources(uuid),public.aureka_set_action_source(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.aureka_improvement_sources(text,text,integer),public.aureka_action_sources(uuid),public.aureka_set_action_source(uuid,text,uuid,boolean) to authenticated;
-- Extend Staff 360 with education records and certificates using the existing RLS policies.
create or replace function public.aureka_staff_education_summary(p_staff_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $f$
declare v_rows jsonb;
begin
  if auth.uid() is null or not coalesce(public.aureka_has_permission('hr.read.directory'),false)
    or not coalesce(aureka_system.password_rotation_complete(),false)
    or (coalesce(aureka_system.current_role_code(),'') not in ('ADMIN','PMKP') and not exists(
      select 1 from aureka_quality.staff_team_assignments a where a.staff_id=p_staff_id and a.assignment_status='active' and aureka_system.has_quality_room_access(a.room_id)))
  then raise exception 'Akses riwayat pendidikan ditolak.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.start_at desc nulls last,x.participant_id),'[]'::jsonb) into v_rows
  from (
    select p.id participant_id,e.id event_id,e.title,e.event_type,e.start_at,p.status participant_status,
      (select count(*) from aureka_system.education_attendance a where a.event_id=e.id and a.participant_id=p.id and a.attendance_status='present') present_sessions,
      (select count(*) from aureka_system.education_attendance a where a.event_id=e.id and a.participant_id=p.id) recorded_sessions,
      (select count(*) from aureka_system.education_certificates c where c.event_id=e.id and c.participant_id=p.id and c.revoked_at is null and c.render_snapshot_sha256 is not null) valid_certificates
    from aureka_system.education_participants p join aureka_system.education_events e on e.id=p.event_id
    where p.staff_id=p_staff_id and aureka_system.can_access_room_or_global(e.room_id)
    order by e.start_at desc nulls last,p.id limit 100
  ) x;
  return jsonb_build_object('staff_id',p_staff_id,'rows',v_rows,'limit',100);
end;
$f$;
revoke all on function public.aureka_staff_education_summary(uuid) from public,anon;
grant execute on function public.aureka_staff_education_summary(uuid) to authenticated;
