-- Patient-linked quality and safety history for the patient directory drawer.
-- The routine returns only the caller's accessible room-scoped rows. Incident details
-- are withheld unless the caller is an authorized safety-workflow manager.

create or replace function public.aureka_patient_linked_history(p_no_rm text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'aureka_quality', 'aureka_patient_safety', 'aureka_system', 'auth'
as $function$
declare
  v_rm text;
  v_patient_id uuid;
  v_can_view_incidents boolean := false;
  v_episodes jsonb := '[]'::jsonb;
  v_incidents jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autentikasi diperlukan.'
      using errcode = '42501';
  end if;

  v_rm := regexp_replace(upper(coalesce(p_no_rm, '')), '[^A-Z0-9]', '', 'g');
  if v_rm = '' then
    return jsonb_build_object(
      'episodes', '[]'::jsonb,
      'incidents', '[]'::jsonb,
      'incidents_visible', false
    );
  end if;

  select patient_id into v_patient_id
    from aureka_quality.patient_index
   where regexp_replace(upper(coalesce(no_rm, '')), '[^A-Z0-9]', '', 'g') = v_rm
   order by updated_at desc
   limit 1;

  if v_patient_id is null then
    return jsonb_build_object(
      'episodes', '[]'::jsonb,
      'incidents', '[]'::jsonb,
      'incidents_visible', false
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', episode.id,
        'record_date', episode.record_date,
        'profile_year', episode.profile_year,
        'unit', episode.unit_name,
        'status', episode.status,
        'review_required', episode.review_required,
        'validated_at', episode.validated_at,
        'validation_note', episode.validation_note,
        'indicators', episode.indicators
      )
      order by episode.record_date desc, episode.created_at desc
    ),
    '[]'::jsonb
  )
  into v_episodes
  from (
    select
      qr.id,
      qr.record_date,
      qr.profile_year,
      qr.created_at,
      mr.name as unit_name,
      qr.status,
      qr.review_required,
      qr.validated_at,
      qr.validation_note,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'code', values.key,
            'title', ip.title,
            'category', ip.category,
            'answer', values.value ->> 'answer',
            'review_required', coalesce((values.value ->> 'review_required')::boolean, false)
          )
          order by ip.category, ip.title
        )
        from jsonb_each(coalesce(qr.core_data -> 'indicator_values', '{}'::jsonb)) as values(key, value)
        join aureka_quality.indicator_profiles ip
          on ip.code = values.key
         and ip.profile_year = qr.profile_year
         and ip.room_id = qr.room_id
      ), '[]'::jsonb) as indicators
    from aureka_quality.quality_records qr
    left join public.master_rooms mr on mr.id = qr.room_id
    where qr.patient_index_id = v_patient_id
      and qr.measurement_grain = 'patient_episode'
      and qr.archived_at is null
      and qr.status <> 'archived'
      and aureka_system.has_quality_room_access(qr.room_id)
    order by qr.record_date desc, qr.created_at desc
    limit 100
  ) episode;

  v_can_view_incidents := aureka_patient_safety.can_manage_workflow();

  if v_can_view_incidents then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'incident_code', i.incident_code,
          'incident_date', i.incident_date,
          'unit_name', i.unit_name,
          'incident_type', i.incident_type,
          'status', i.status,
          'summary', i.summary
        )
        order by i.incident_date desc, i.created_at desc
      ),
      '[]'::jsonb
    )
    into v_incidents
    from aureka_patient_safety.incidents i
    where i.patient_index_id = v_patient_id
      and aureka_system.has_quality_room_access(i.room_id);
  end if;

  return jsonb_build_object(
    'episodes', v_episodes,
    'incidents', case when v_can_view_incidents then v_incidents else '[]'::jsonb end,
    'incidents_visible', v_can_view_incidents
  );
end;
$function$;

revoke all on function public.aureka_patient_linked_history(text) from public, anon;
grant execute on function public.aureka_patient_linked_history(text) to authenticated;

comment on function public.aureka_patient_linked_history(text)
is 'Returns room-scoped patient-episode links and role-protected patient safety incident summaries for the AUREKA patient directory drawer.';

notify pgrst, 'reload schema';
