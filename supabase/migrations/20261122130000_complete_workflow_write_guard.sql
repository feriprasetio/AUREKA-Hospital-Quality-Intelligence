-- Harden operational write paths for FMEA reaktif and PIC invitation responses.
alter table aureka_system.pmkp_meeting_invitees
  add column if not exists response_status text not null default 'pending',
  add column if not exists response_note text not null default '',
  add column if not exists responded_at timestamptz;

do $block$
begin
  if not exists(select 1 from pg_constraint where conname='pmkp_meeting_invitees_response_status_check') then
    alter table aureka_system.pmkp_meeting_invitees
      add constraint pmkp_meeting_invitees_response_status_check
      check(response_status in ('pending','accepted','declined'));
  end if;
end;
$block$;

create or replace function public.aureka_pmkp_respond_meeting_invitation(
  p_invitee_id uuid,
  p_response text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitee aureka_system.pmkp_meeting_invitees%rowtype;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  if p_response not in ('accepted','declined') then
    raise exception 'Respons undangan tidak valid.' using errcode='22023';
  end if;

  select * into v_invitee
  from aureka_system.pmkp_meeting_invitees
  where id=p_invitee_id and invited_user_id=auth.uid()
  for update;

  if not found then raise exception 'Undangan tidak ditemukan pada akun ini.' using errcode='42501'; end if;
  if v_invitee.delivery_status not in ('sent','delivered') then
    raise exception 'Undangan belum terkirim atau sudah dibatalkan.' using errcode='55000';
  end if;

  update aureka_system.pmkp_meeting_invitees
  set response_status=p_response,
      response_note=left(coalesce(p_note,''),1000),
      responded_at=now()
  where id=p_invitee_id;

  insert into aureka_system.pmkp_meeting_events(meeting_id,event_type,event_payload,actor_id)
  values(v_invitee.meeting_id,'invitation_response',
    jsonb_build_object('invitee_id',p_invitee_id,'response',p_response,'note',left(coalesce(p_note,''),1000)),
    auth.uid());

  return jsonb_build_object('success',true,'response_status',p_response,'responded_at',now());
end;
$function$;

create or replace function public.aureka_reactive_fmea_save(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := aureka_system.current_role_code();
  v_incident aureka_patient_safety.incidents%rowtype;
  v_id uuid;
  v_severity smallint := nullif(p->>'severity','')::smallint;
  v_occurrence smallint := nullif(p->>'occurrence','')::smallint;
  v_detection smallint := nullif(p->>'detection','')::smallint;
  v_code text := coalesce(nullif(trim(p->>'fmea_code'),''),'FMEA-R-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));
begin
  if auth.uid() is null or v_role not in ('ADMIN','PMKP','MANAGEMENT') then
    raise exception 'Role tidak berwenang mengelola FMEA Reaktif.' using errcode='42501';
  end if;
  if not aureka_system.password_rotation_complete() then
    raise exception 'Selesaikan perubahan password awal sebelum melanjutkan.' using errcode='42501';
  end if;
  if length(trim(coalesce(p->>'failure_mode',''))) < 5
     or length(trim(coalesce(p->>'failure_effect',''))) < 5
     or length(trim(coalesce(p->>'causes',''))) < 5
     or length(trim(coalesce(p->>'action_plan',''))) < 5
     or length(trim(coalesce(p->>'owner_name',''))) < 2 then
    raise exception 'Lengkapi mode kegagalan, dampak, penyebab, tindakan, dan penanggung jawab.' using errcode='22023';
  end if;
  if v_severity not between 1 and 5 or v_occurrence not between 1 and 5 or v_detection not between 1 and 5 then
    raise exception 'Severity, Occurrence, dan Detection harus 1–5.' using errcode='22023';
  end if;

  select * into v_incident
  from aureka_patient_safety.incidents
  where id=nullif(p->>'source_incident_id','')::uuid;

  if not found or not aureka_system.has_quality_room_access(v_incident.room_id) then
    raise exception 'Insiden sumber tidak ditemukan atau berada di luar kewenangan unit.' using errcode='42501';
  end if;
  if exists(select 1 from aureka_risk.fmea_analyses f
    where f.analysis_type='reactive' and f.source_incident_id=v_incident.id) then
    raise exception 'Insiden ini sudah memiliki analisis FMEA Reaktif.' using errcode='23505';
  end if;

  insert into aureka_risk.fmea_analyses(
    fmea_code,risk_register_id,unit_name,process_name,failure_mode,failure_effect,causes,
    existing_controls,severity,occurrence,detection,action_plan,owner_name,target_date,
    status,created_by,updated_by,source_data,analysis_type,source_incident_id,incident_code_snapshot
  ) values (
    v_code,nullif(p->>'risk_register_id','')::uuid,
    coalesce(nullif(v_incident.unit_name,''),'Unit tidak tercatat'),
    coalesce(nullif(v_incident.incident_type,''),'Proses pelayanan'),
    trim(p->>'failure_mode'),trim(p->>'failure_effect'),trim(p->>'causes'),
    coalesce(p->>'existing_controls',''),v_severity,v_occurrence,v_detection,
    trim(p->>'action_plan'),trim(p->>'owner_name'),nullif(p->>'target_date','')::date,
    'Open',auth.uid(),auth.uid(),
    jsonb_build_object('source','patient_safety_incident','incident_id',v_incident.id,'incident_code',v_incident.incident_code),
    'reactive',v_incident.id,coalesce(v_incident.incident_code,'')
  ) returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.aureka_reactive_fmea_update_status(p_fmea_id uuid,p_status text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := aureka_system.current_role_code();
  v_room_id bigint;
begin
  if auth.uid() is null or v_role not in ('ADMIN','PMKP','MANAGEMENT') then
    raise exception 'Role tidak berwenang mengubah FMEA Reaktif.' using errcode='42501';
  end if;
  if not aureka_system.password_rotation_complete() then
    raise exception 'Selesaikan perubahan password awal sebelum melanjutkan.' using errcode='42501';
  end if;
  if p_status not in ('Open','In Progress','Evaluated','Closed') then
    raise exception 'Status FMEA tidak valid.' using errcode='22023';
  end if;

  select i.room_id into v_room_id
  from aureka_risk.fmea_analyses f
  join aureka_patient_safety.incidents i on i.id=f.source_incident_id
  where f.id=p_fmea_id and f.analysis_type='reactive';

  if not found or not aureka_system.has_quality_room_access(v_room_id) then
    raise exception 'Analisis FMEA tidak ditemukan atau berada di luar kewenangan unit.' using errcode='42501';
  end if;

  update aureka_risk.fmea_analyses
  set status=p_status,updated_by=auth.uid(),updated_at=now()
  where id=p_fmea_id and analysis_type='reactive';
  return found;
end;
$function$;

revoke all on function public.aureka_pmkp_respond_meeting_invitation(uuid,text,text) from public,anon;
revoke all on function public.aureka_reactive_fmea_save(jsonb) from public,anon;
revoke all on function public.aureka_reactive_fmea_update_status(uuid,text) from public,anon;
grant execute on function public.aureka_pmkp_respond_meeting_invitation(uuid,text,text) to authenticated;
grant execute on function public.aureka_reactive_fmea_save(jsonb) to authenticated;
grant execute on function public.aureka_reactive_fmea_update_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
