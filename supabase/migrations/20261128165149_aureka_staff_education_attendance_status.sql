CREATE OR REPLACE FUNCTION public.aureka_staff_education_summary(p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
      (select count(*) from aureka_system.education_attendance a where a.event_id=e.id and a.participant_id=p.id and a.attendance_status='hadir') present_sessions,
      (select count(*) from aureka_system.education_attendance a where a.event_id=e.id and a.participant_id=p.id) recorded_sessions,
      (select count(*) from aureka_system.education_certificates c where c.event_id=e.id and c.participant_id=p.id and c.revoked_at is null and c.render_snapshot_sha256 is not null) valid_certificates
    from aureka_system.education_participants p join aureka_system.education_events e on e.id=p.event_id
    where p.staff_id=p_staff_id and aureka_system.can_access_room_or_global(e.room_id)
    order by e.start_at desc nulls last,p.id limit 100
  ) x;
  return jsonb_build_object('staff_id',p_staff_id,'rows',v_rows,'limit',100);
end;
$function$
;
revoke all on function public.aureka_staff_education_summary(uuid) from public,anon;
grant execute on function public.aureka_staff_education_summary(uuid) to authenticated;
