-- Extend PIC oversight to Direktur and constrain Kabid to assigned service areas.
begin;

insert into aureka_governance.role_permissions(role_code,permission,granted)
values ('DIREKTUR','hr.read.pic_performance',true)
on conflict (role_code,permission) do nothing;

create or replace function public.aureka_pic_performance_dashboard(p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = aureka_governance, aureka_quality, aureka_system, public, auth
as $$
declare v record; v_days integer := least(greatest(coalesce(p_days,30),1),365);
begin
  select * into v from aureka_governance.me();
  if v.role_code is null or not public.aureka_has_permission('hr.read.pic_performance') then
    raise exception 'Anda tidak memiliki hak untuk melihat monitoring kinerja PIC.';
  end if;

  return jsonb_build_object(
    'role', v.role_code,
    'window_days', v_days,
    'generated_at', now(),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.room_name, x.pic_name)
      from (
        select
          up.user_id,
          up.full_name as pic_name,
          up.email,
          active_pic.room_id,
          mr.name as room_name,
          stats.records_total,
          stats.records_window,
          stats.records_draft,
          stats.records_ready,
          stats.records_validated,
          stats.records_archived,
          stats.last_created_at,
          stats.last_record_date,
          stats.last_status
        from (
          select distinct sta2.assigned_user_id, sta2.room_id
          from aureka_quality.staff_team_assignments sta2
          where sta2.assignment_status = 'active' and sta2.is_locked = true
        ) active_pic
        join aureka_system.user_profiles up on up.user_id = active_pic.assigned_user_id and up.is_active = true
        join public.master_rooms mr on mr.id = active_pic.room_id
        left join lateral (
          select
            count(*)::integer as records_total,
            count(*) filter (where qr.created_at >= now() - make_interval(days => v_days))::integer as records_window,
            count(*) filter (where qr.status = 'draft')::integer as records_draft,
            count(*) filter (where qr.status = 'ready')::integer as records_ready,
            count(*) filter (where qr.status = 'validated')::integer as records_validated,
            count(*) filter (where qr.status = 'archived')::integer as records_archived,
            max(qr.created_at) as last_created_at,
            (array_agg(qr.record_date order by qr.created_at desc))[1] as last_record_date,
            (array_agg(qr.status order by qr.created_at desc))[1] as last_status
          from aureka_quality.quality_records qr
          where qr.entered_by = active_pic.assigned_user_id and qr.room_id = active_pic.room_id
        ) stats on true
        where (v.role_code <> 'PIC' or active_pic.assigned_user_id = auth.uid())
          and (v.role_code <> 'KABID'
               or active_pic.room_id = v.room_id
               or exists (
                 select 1 from aureka_system.user_room_assignments ura
                 where ura.user_id = auth.uid()
                   and ura.room_id = active_pic.room_id
                   and ura.is_active = true
               ))
          and v.role_code in ('ADMIN','PMKP','MANAGEMENT','DIREKTUR','KABID','PIC')
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.aureka_pic_performance_dashboard(integer) from public,anon;
grant execute on function public.aureka_pic_performance_dashboard(integer) to authenticated;

commit;
