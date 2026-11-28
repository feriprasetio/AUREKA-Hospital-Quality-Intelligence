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
  if auth.uid() is null or v_role is null then raise exception 'Akun aktif dengan role sah diperlukan.' using errcode='42501'; end if;
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
      select cr.survey_period,mr.name as unit_name,max(cr.submitted_at) as submitted_at,count(*)::integer as response_count
      from aureka_patient_safety.culture_responses cr
      left join public.master_rooms mr on mr.id=cr.respondent_room_id
      where cr.respondent_person_id=p_staff_id and cr.identity_mode='named'
        and aureka_system.has_quality_room_access(cr.respondent_room_id)
      group by cr.survey_period,mr.name
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
