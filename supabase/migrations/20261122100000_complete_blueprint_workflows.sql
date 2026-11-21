-- Complete remaining navigation-blueprint workflows.
-- All new objects are additive and reuse the existing clinical, safety, workforce,
-- governance, and meeting domains. No duplicate patient, incident, or staff registers.

-- 1) Link Clinical Pathway audits to the source episode and expose a permission-scoped
-- candidate list. A candidate is never declared clinically eligible by text matching alone.
alter table aureka_quality.clinical_pathway_audits
  add column if not exists source_quality_record_id uuid
  references aureka_quality.quality_records(id) on delete set null;

create index if not exists clinical_pathway_audits_source_quality_record_idx
  on aureka_quality.clinical_pathway_audits(source_quality_record_id)
  where source_quality_record_id is not null;

create or replace function public.aureka_clinical_pathway_patient_candidates(
  p_template_code text,
  p_room_id bigint default null
)
returns table(
  source_quality_record_id uuid,
  patient_index_id uuid,
  medical_record_no text,
  patient_name text,
  sex text,
  date_of_birth date,
  admission_date date,
  discharge_date date,
  unit_id bigint,
  unit_name text,
  dpjp text,
  diagnosis text,
  match_status text,
  existing_audit_id uuid
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','aureka_quality','aureka_system','auth'
as $function$
declare
  v_template aureka_quality.clinical_pathway_templates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Autentikasi diperlukan.' using errcode='42501';
  end if;

  select * into v_template
  from aureka_quality.clinical_pathway_templates t
  where t.code = p_template_code and t.status = 'published'
  limit 1;

  if not found then
    raise exception 'Format Clinical Pathway tidak ditemukan atau belum diterbitkan.' using errcode='P0002';
  end if;

  return query
  select
    qr.id,
    qr.patient_index_id,
    pi.no_rm,
    coalesce(nullif(trim(pi.nama_pasien),''), qr.core_data->'form_fields'->>'Nama Pasien',''),
    coalesce(pi.jenis_kelamin,''),
    pi.tanggal_lahir,
    coalesce(nullif(qr.core_data->>'admission_at','')::date, qr.record_date),
    nullif(qr.core_data->>'discharge_at','')::date,
    qr.room_id,
    coalesce(mr.name, qr.core_data->'form_fields'->>'unit_name','Unit tidak tercatat'),
    coalesce(nullif(trim(qr.core_data->'form_fields'->>'DPJP'),''),'Belum tercatat'),
    coalesce(nullif(trim(qr.core_data->'form_fields'->>'Diagnosa Tegak'),''),'Diagnosis belum tercatat'),
    case
      when regexp_replace(upper(coalesce(qr.core_data->'form_fields'->>'Diagnosa Tegak','')),'[^A-Z0-9]','','g')
             like '%' || regexp_replace(upper(coalesce(v_template.icd10,'')),'[^A-Z0-9]','','g') || '%'
           and nullif(regexp_replace(upper(coalesce(v_template.icd10,'')),'[^A-Z0-9]','','g'),'') is not null
        then 'possible_code_match'
      when regexp_replace(upper(coalesce(qr.core_data->'form_fields'->>'Diagnosa Tegak','')),'[^A-Z0-9]','','g')
             like '%' || regexp_replace(upper(coalesce(v_template.name,'')),'[^A-Z0-9]','','g') || '%'
           and nullif(regexp_replace(upper(coalesce(v_template.name,'')),'[^A-Z0-9]','','g'),'') is not null
        then 'possible_name_match'
      else 'requires_clinical_review'
    end,
    ca.id
  from aureka_quality.quality_records qr
  join aureka_quality.patient_index pi on pi.patient_id=qr.patient_index_id
  left join public.master_rooms mr on mr.id=qr.room_id
  left join lateral (
    select a.id
    from aureka_quality.clinical_pathway_audits a
    where a.source_quality_record_id=qr.id
      and a.template_code=p_template_code
      and a.status <> 'archived'
    order by a.created_at desc
    limit 1
  ) ca on true
  where qr.patient_index_id is not null
    and qr.measurement_grain='patient_episode'
    and qr.archived_at is null
    and qr.status <> 'archived'
    and aureka_system.has_quality_room_access(qr.room_id)
    and (p_room_id is null or qr.room_id=p_room_id)
  order by coalesce(qr.record_date,qr.period_start) desc nulls last, qr.created_at desc
  limit 250;
end;
$function$;

revoke all on function public.aureka_clinical_pathway_patient_candidates(text,bigint) from public, anon;
grant execute on function public.aureka_clinical_pathway_patient_candidates(text,bigint) to authenticated;

-- 2) Reactive FMEA uses the existing FMEA register but carries an incident source link.
alter table aureka_risk.fmea_analyses
  add column if not exists analysis_type text not null default 'preventive',
  add column if not exists source_incident_id uuid,
  add column if not exists incident_code_snapshot text not null default '';

do $block$
begin
  if not exists(select 1 from pg_constraint where conname='fmea_analyses_source_incident_id_fkey') then
    alter table aureka_risk.fmea_analyses
      add constraint fmea_analyses_source_incident_id_fkey
      foreign key(source_incident_id) references aureka_patient_safety.incidents(id) on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='fmea_analyses_analysis_type_check') then
    alter table aureka_risk.fmea_analyses
      add constraint fmea_analyses_analysis_type_check
      check(analysis_type in ('preventive','reactive'));
  end if;
end;
$block$;

create unique index if not exists fmea_analyses_source_incident_unique
  on aureka_risk.fmea_analyses(source_incident_id)
  where analysis_type='reactive' and source_incident_id is not null;

drop policy if exists fmea_reactive_manager_guard on aureka_risk.fmea_analyses;
create policy fmea_reactive_manager_guard
  on aureka_risk.fmea_analyses
  as restrictive
  for all
  to authenticated
  using (analysis_type <> 'reactive' or aureka_patient_safety.can_manage_workflow())
  with check (analysis_type <> 'reactive' or aureka_patient_safety.can_manage_workflow());

-- 3) Annual activity timeline / Gantt. The existing area-priority register remains the
-- authoritative strategic-priority list; this table only records executable activities.
create table if not exists aureka_governance.annual_program_activities (
  id uuid primary key default gen_random_uuid(),
  program_year integer not null,
  title text not null,
  description text not null default '',
  expected_output text not null default '',
  owner_room_id bigint references public.master_rooms(id) on delete set null,
  responsible_person text not null default '',
  start_date date not null,
  end_date date not null,
  status text not null default 'planned'
    check(status in ('planned','in_progress','completed','on_hold','cancelled')),
  progress_percent integer not null default 0
    check(progress_percent between 0 and 100),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_program_activities_date_order check(end_date >= start_date),
  constraint annual_program_activities_year_check check(program_year between 2020 and 2200)
);

create index if not exists annual_program_activities_year_dates_idx
  on aureka_governance.annual_program_activities(program_year,start_date,end_date);
create index if not exists annual_program_activities_room_year_idx
  on aureka_governance.annual_program_activities(owner_room_id,program_year);

alter table aureka_governance.annual_program_activities enable row level security;
revoke all on aureka_governance.annual_program_activities from anon,authenticated;
drop policy if exists annual_program_activities_rpc_only on aureka_governance.annual_program_activities;
create policy annual_program_activities_rpc_only
  on aureka_governance.annual_program_activities
  for all to authenticated using(false) with check(false);

create or replace function public.aureka_gov_program_activity_list(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','aureka_governance','aureka_system','public','auth'
as $function$
declare
  v record;
  v_items jsonb;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.' using errcode='42501'; end if;

  select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('room_name',mr.name)
    order by a.start_date,a.end_date,a.title),'[]'::jsonb)
  into v_items
  from aureka_governance.annual_program_activities a
  left join public.master_rooms mr on mr.id=a.owner_room_id
  where a.program_year=p_year
    and (
      v.role_code in ('ADMIN','PMKP','MANAGEMENT','DIREKTUR','DEWAN_PENGAWAS')
      or (a.owner_room_id is not null and aureka_system.has_quality_room_access(a.owner_room_id))
    );

  return jsonb_build_object(
    'activities',v_items,
    'can_manage',v.role_code in ('ADMIN','PMKP'),
    'program_year',p_year
  );
end;
$function$;

create or replace function public.aureka_gov_program_activity_save(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','aureka_governance','aureka_system','public','auth'
as $function$
declare
  v record;
  v_id uuid := nullif(p->>'id','')::uuid;
  v_start date;
  v_end date;
  v_room bigint := nullif(p->>'owner_room_id','')::bigint;
  v_progress integer := coalesce(nullif(p->>'progress_percent','')::integer,0);
  v_status text := coalesce(nullif(p->>'status',''),'planned');
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then
    raise exception 'Hanya Super Admin / Komite PMKP yang dapat mengelola timeline program.' using errcode='42501';
  end if;
  if length(trim(coalesce(p->>'title',''))) < 5 then
    raise exception 'Nama kegiatan minimal 5 karakter.' using errcode='22023';
  end if;
  if coalesce(p->>'program_year','') !~ '^[0-9]{4}$' then
    raise exception 'Tahun program tidak valid.' using errcode='22023';
  end if;
  v_start := nullif(p->>'start_date','')::date;
  v_end := nullif(p->>'end_date','')::date;
  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'Tanggal mulai dan selesai wajib benar; tanggal selesai tidak boleh mendahului tanggal mulai.' using errcode='22023';
  end if;
  if v_start < make_date((p->>'program_year')::integer,1,1)
     or v_start > make_date((p->>'program_year')::integer,12,31)
     or v_end < make_date((p->>'program_year')::integer,1,1)
     or v_end > make_date((p->>'program_year')::integer,12,31) then
    raise exception 'Rentang kegiatan harus berada dalam tahun program yang dipilih.' using errcode='22023';
  end if;
  if v_status not in ('planned','in_progress','completed','on_hold','cancelled') or v_progress not between 0 and 100 then
    raise exception 'Status atau persentase progres tidak valid.' using errcode='22023';
  end if;
  if v_room is not null and not aureka_system.has_quality_room_access(v_room) then
    raise exception 'Unit pemilik berada di luar ruang lingkup pengguna.' using errcode='42501';
  end if;

  if v_id is null then
    insert into aureka_governance.annual_program_activities
      (program_year,title,description,expected_output,owner_room_id,responsible_person,start_date,end_date,status,progress_percent,created_by,updated_by)
    values
      ((p->>'program_year')::integer,trim(p->>'title'),coalesce(p->>'description',''),coalesce(p->>'expected_output',''),
       v_room,coalesce(p->>'responsible_person',''),v_start,v_end,v_status,v_progress,auth.uid(),auth.uid())
    returning id into v_id;
    perform aureka_governance.write_audit('create','annual_program_activity',v_id::text,p);
  else
    update aureka_governance.annual_program_activities
       set program_year=(p->>'program_year')::integer,
           title=trim(p->>'title'),description=coalesce(p->>'description',''),
           expected_output=coalesce(p->>'expected_output',''),owner_room_id=v_room,
           responsible_person=coalesce(p->>'responsible_person',''),
           start_date=v_start,end_date=v_end,status=v_status,
           progress_percent=v_progress,updated_by=auth.uid(),updated_at=now()
     where id=v_id;
    if not found then raise exception 'Kegiatan tahunan tidak ditemukan.' using errcode='P0002'; end if;
    perform aureka_governance.write_audit('update','annual_program_activity',v_id::text,p);
  end if;
  return v_id;
end;
$function$;

revoke all on function public.aureka_gov_program_activity_list(integer) from public,anon;
revoke all on function public.aureka_gov_program_activity_save(jsonb) from public,anon;
grant execute on function public.aureka_gov_program_activity_list(integer) to authenticated;
grant execute on function public.aureka_gov_program_activity_save(jsonb) to authenticated;

-- 4) Secretariat: resolve active PIC accounts by unit and deliver an in-app invitation
-- to the existing invitees table. "sent" means visible in the AUREKA PIC inbox, not email.
create or replace function public.aureka_pmkp_list_pic_recipients(p_room_id bigint default null)
returns table(user_id uuid,display_name text,email text,room_id bigint,room_name text,role_code text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog','aureka_system','public','auth'
as $function$
begin
  if auth.uid() is null or not aureka_system.can_manage_pmkp_workspace() then
    raise exception 'Hanya pengelola Sekretariat yang dapat memilih PIC penerima.' using errcode='42501';
  end if;
  return query
  select distinct up.user_id,up.full_name,coalesce(up.email,au.email),mr.id,mr.name,ar.code
  from aureka_system.user_profiles up
  join aureka_system.app_roles ar on ar.id=up.role_id and ar.is_active
  join auth.users au on au.id=up.user_id
  join lateral (
    select up.primary_room_id as assigned_room_id where up.primary_room_id is not null
    union
    select ura.room_id from aureka_system.user_room_assignments ura
      where ura.user_id=up.user_id and ura.is_active=true
  ) assignments on true
  join public.master_rooms mr on mr.id=assignments.assigned_room_id
  where up.is_active=true and not coalesce(up.must_change_password,true)
    and ar.code='PIC'
    and (p_room_id is null or mr.id=p_room_id)
    and (p_room_id is null or aureka_system.can_access_room_or_global(p_room_id))
  order by up.full_name,mr.name;
end;
$function$;

create or replace function public.aureka_pmkp_send_meeting_invitation(
  p_meeting_id uuid,
  p_invited_user_id uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','aureka_system','public','auth'
as $function$
declare
  v_meeting aureka_system.pmkp_meetings%rowtype;
  v_invitee record;
  v_room bigint;
  v_existing uuid;
  v_id uuid;
begin
  if auth.uid() is null or not aureka_system.can_manage_pmkp_workspace() then
    raise exception 'Hanya pengelola Sekretariat yang dapat mengirim undangan.' using errcode='42501';
  end if;

  select * into v_meeting from aureka_system.pmkp_meetings where id=p_meeting_id;
  if not found or not aureka_system.can_access_room_or_global(v_meeting.room_id) then
    raise exception 'Kegiatan tidak ditemukan atau berada di luar ruang lingkup.' using errcode='P0002';
  end if;

  select up.user_id,up.full_name,coalesce(up.email,au.email) as email,ar.code,
         coalesce(ura.room_id,up.primary_room_id) as room_id
  into v_invitee
  from aureka_system.user_profiles up
  join aureka_system.app_roles ar on ar.id=up.role_id and ar.is_active
  join auth.users au on au.id=up.user_id
  left join aureka_system.user_room_assignments ura
    on ura.user_id=up.user_id and ura.is_active=true
    and (v_meeting.room_id is null or ura.room_id=v_meeting.room_id)
  where up.user_id=p_invited_user_id and up.is_active=true
    and not coalesce(up.must_change_password,true)
    and ar.code='PIC'
    and (v_meeting.room_id is null
      or up.primary_room_id=v_meeting.room_id
      or ura.room_id=v_meeting.room_id)
  order by (ura.room_id is not null) desc
  limit 1;

  if not found then
    raise exception 'Akun PIC tidak aktif, belum menyelesaikan password awal, atau bukan anggota unit kegiatan.' using errcode='42501';
  end if;

  select id into v_existing from aureka_system.pmkp_meeting_invitees
   where meeting_id=p_meeting_id and invited_user_id=p_invited_user_id
   order by created_at desc limit 1;

  if v_existing is null then
    insert into aureka_system.pmkp_meeting_invitees(
      meeting_id,invited_user_id,invited_room_id,invitee_name,invitee_email,invitee_role,
      delivery_status,invitation_note,sent_at,created_by
    ) values (
      p_meeting_id,p_invited_user_id,coalesce(v_invitee.room_id,v_meeting.room_id),v_invitee.full_name,
      v_invitee.email,v_invitee.code,'sent',coalesce(p_note,''),now(),auth.uid()
    ) returning id into v_id;
  else
    update aureka_system.pmkp_meeting_invitees
      set invited_room_id=coalesce(v_invitee.room_id,v_meeting.room_id),
          invitee_name=v_invitee.full_name,invitee_email=v_invitee.email,
          invitee_role=v_invitee.code,delivery_status='sent',
          invitation_note=coalesce(p_note,''),sent_at=now()
      where id=v_existing returning id into v_id;
  end if;

  insert into aureka_system.pmkp_meeting_events(meeting_id,event_type,event_payload,actor_id)
  values(p_meeting_id,'invitation_sent',
    jsonb_build_object('invitee_id',v_id,'invited_user_id',p_invited_user_id,'delivery_channel','in_app'),
    auth.uid());

  return jsonb_build_object('success',true,'invitee_id',v_id,'delivery_status','sent','channel','in_app');
end;
$function$;

revoke all on function public.aureka_pmkp_list_pic_recipients(bigint) from public,anon;
revoke all on function public.aureka_pmkp_send_meeting_invitation(uuid,uuid,text) from public,anon;
grant execute on function public.aureka_pmkp_list_pic_recipients(bigint) to authenticated;
grant execute on function public.aureka_pmkp_send_meeting_invitation(uuid,uuid,text) to authenticated;

-- 5) Workforce profile: cross-module data is returned only when room and role gates pass.
-- Culture survey answers are never returned here; only named-response period metadata.
create or replace function public.aureka_staff_cross_module_profile(p_staff_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','aureka_quality','aureka_patient_safety','aureka_system','auth'
as $function$
declare
  v_role text := aureka_system.current_role_code();
  v_staff aureka_quality.staff_directory%rowtype;
  v_can_manage boolean;
  v_can_read_performance boolean;
  v_can_read_named_survey boolean;
  v_assignments jsonb := '[]'::jsonb;
  v_performance jsonb := '[]'::jsonb;
  v_incidents jsonb := '[]'::jsonb;
  v_culture jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='42501'; end if;
  select * into v_staff from aureka_quality.staff_directory where id=p_staff_id;
  if not found then raise exception 'Tenaga kerja tidak ditemukan.' using errcode='P0002'; end if;

  v_can_manage := v_role in ('ADMIN','PMKP','MANAGEMENT','KABID');
  if not v_can_manage and not exists(
    select 1 from aureka_quality.staff_team_assignments a
    where a.staff_id=p_staff_id and a.assignment_status='active'
      and aureka_system.has_quality_room_access(a.room_id)
  ) then
    raise exception 'Profil tenaga kerja berada di luar ruang lingkup akses akun.' using errcode='42501';
  end if;

  v_can_read_performance := v_role in ('ADMIN','PMKP','MANAGEMENT','KABID')
    or coalesce(public.aureka_has_permission('hr.read.performance'),false);
  v_can_read_named_survey := v_role in ('ADMIN','PMKP','MANAGEMENT');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'room_id',a.room_id,'room_name',mr.name,'assignment_status',a.assignment_status,
    'assigned_at',a.assigned_at,'released_at',a.released_at,'is_locked',a.is_locked
  ) order by a.assigned_at desc),'[]'::jsonb)
  into v_assignments
  from aureka_quality.staff_team_assignments a
  left join public.master_rooms mr on mr.id=a.room_id
  where a.staff_id=p_staff_id and aureka_system.has_quality_room_access(a.room_id);

  if v_can_read_performance then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'evaluation_type',e.evaluation_type,'status',e.status,
      'period_start',e.period_start,'period_end',e.period_end,
      'summary',e.summary_json,'review_note',e.review_note,'validated_at',e.validated_at,
      'room_name',mr.name
    ) order by e.created_at desc),'[]'::jsonb)
    into v_performance
    from aureka_quality.oppe_fppe_evaluations e
    left join public.master_rooms mr on mr.id=e.room_id
    where e.staff_id=p_staff_id and aureka_system.has_quality_room_access(e.room_id);
  end if;

  if v_can_manage then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,'incident_code',i.incident_code,'incident_date',i.incident_date,
      'unit_name',i.unit_name,'incident_type',i.incident_type,'status',i.status
    ) order by i.incident_date desc,i.created_at desc),'[]'::jsonb)
    into v_incidents
    from aureka_quality.staff_entity_attributions a
    join aureka_patient_safety.incidents i on i.id=a.entity_id
    where a.staff_id=p_staff_id and a.entity_type in ('incident','patient_safety_incident')
      and aureka_system.has_quality_room_access(i.room_id);
  end if;

  if v_can_read_named_survey then
    select coalesce(jsonb_agg(jsonb_build_object(
      'survey_period',s.survey_period,'unit_name',s.unit_name,'submitted_at',s.submitted_at,
      'response_count',s.response_count
    ) order by s.submitted_at desc),'[]'::jsonb)
    into v_culture
    from (
      select survey_period,unit_name,max(submitted_at) as submitted_at,count(*)::integer as response_count
      from aureka_patient_safety.culture_responses
      where respondent_person_id=p_staff_id and identity_mode='named'
      group by survey_period,unit_name
    ) s;
  end if;

  return jsonb_build_object(
    'staff',jsonb_build_object('id',v_staff.id,'employee_code',v_staff.employee_code,
      'display_name',v_staff.display_name,'profession_group',v_staff.profession_group,
      'position_title',v_staff.position_title,'source_unit',v_staff.source_unit,
      'directory_status',v_staff.directory_status),
    'assignments',v_assignments,
    'performance',v_performance,
    'incidents',v_incidents,
    'named_culture_history',v_culture,
    'permissions',jsonb_build_object(
      'performance',v_can_read_performance,'incidents',v_can_manage,'named_culture_history',v_can_read_named_survey
    )
  );
end;
$function$;

revoke all on function public.aureka_staff_cross_module_profile(uuid) from public,anon;
grant execute on function public.aureka_staff_cross_module_profile(uuid) to authenticated;

notify pgrst,'reload schema';
