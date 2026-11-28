-- Aggregate-only care patterns. Existing RLS remains authoritative.
create or replace function public.aureka_care_pattern_summary(p_room bigint,p_year integer,p_include_ready boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $fn$
declare v_named boolean; v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.aureka_has_permission('quality.read.aggregate'),false)
    or not coalesce(aureka_system.password_rotation_complete(),false)
    or p_year is null or p_year not between 2000 and 2100
    or not exists(select 1 from public.master_rooms m where (p_room is null or m.id=p_room) and aureka_system.has_quality_room_access(m.id))
  then raise exception 'Akses pola perawatan ditolak.' using errcode='42501'; end if;
  v_named := coalesce(public.aureka_has_permission('hr.read.performance'),false);
  with records as materialized (
    select r.id,r.room_id,r.status,
      coalesce(nullif(btrim(r.core_data->>'discharge_at'),''),nullif(btrim(r.core_data->'form_fields'->>'Tanggal Keluar'),''),nullif(btrim(r.core_data->'form_data'->>'Tanggal Keluar'),'')) discharge_raw
    from aureka_quality.quality_records r
    where r.profile_year=p_year and r.measurement_grain='patient_episode' and r.archived_at is null
      and (r.status='validated' or (p_include_ready is true and r.status='ready'))
      and (p_room is null or r.room_id=p_room) and aureka_system.has_quality_room_access(r.room_id)
  ), visit_input as (
    select r.id,case lower(btrim(rr.response_label))
        when 'visite hari kerja (06.00-14.00)' then 'Visite hari kerja 06.00–14.00'
        when 'visite hari kerja (diatas 14.00)' then 'Visite hari kerja setelah 14.00'
        when 'visite hari libur' then 'Visite hari libur'
        when 'tidak visite' then 'Tidak visite'
        when 'divisitekan spesialis lain' then 'Divisitekan spesialis lain' end category,
      rr.review_status in ('classified','not_required') as approved
    from records r join aureka_quality.quality_record_responses rr on rr.record_id=r.id
    join aureka_quality.indicator_profiles ip on ip.id=rr.indicator_id and ip.room_id=r.room_id and ip.profile_year=p_year
    where ip.status='published' and ip.is_active and lower(ip.title)='kepatuhan jam visite dokter spesialis'
  ), visits as (
    select id,min(category) category from visit_input
    group by id having bool_and(coalesce(approved,false)) and bool_and(category is not null) and count(distinct category)=1
  ), parsed as (
    select id,
      case when discharge_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|[T ])' and pg_catalog.pg_input_is_valid(left(discharge_raw,10),'date')
        then left(discharge_raw,10)::date end as source_date,
      case when discharge_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
        and substring(discharge_raw,12,5)<>'00:00'
        then case when discharge_raw ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' and pg_catalog.pg_input_is_valid(discharge_raw,'timestamp with time zone')
          then discharge_raw::timestamptz at time zone 'Asia/Pontianak'
          when discharge_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?$'
            and pg_catalog.pg_input_is_valid(discharge_raw,'timestamp without time zone') then discharge_raw::timestamp end
      end as recorded_time
    from records where discharge_raw is not null
  ), discharges as (
    select id,coalesce(recorded_time::date,source_date) discharge_day,extract(hour from recorded_time)::int discharge_hour from parsed
  ), attribution as (
    select a.record_id,min(a.staff_id::text) staff_id
    from aureka_quality.quality_record_staff_attributions a join records r on r.id=a.record_id
    where v_named and lower(btrim(a.field_key)) in ('dpjp','dokter penanggung jawab pasien')
    group by a.record_id having count(distinct a.staff_id)=1
  ), doctor_summary as (
    select d.id,d.display_name,count(*) filter(where v.id is not null) as visite_n,
      count(*) filter(where x.discharge_day is not null) as discharge_n,
      count(*) filter(where x.discharge_hour is not null) as clock_n,
      count(*) filter(where v.category='Visite hari kerja 06.00–14.00') as visit_regular,
      count(*) filter(where v.category='Visite hari kerja setelah 14.00') as visit_late
    from attribution a join aureka_quality.staff_directory d on d.id::text=a.staff_id
    left join visits v on v.id=a.record_id left join discharges x on x.id=a.record_id
    group by d.id,d.display_name
    having count(*) filter(where v.id is not null)>=5 or count(*) filter(where x.discharge_day is not null)>=5
  )
  select jsonb_build_object(
    'allowed',true,'year',p_year,'scope_room_id',p_room,'includes_ready',p_include_ready is true,'named_allowed',v_named,
    'records',(select count(*) from records),'ready_records',(select count(*) from records where status='ready'),
    'visit_source_records',(select count(distinct id) from visit_input),'visit_classified',(select count(*) from visits),
    'discharge_source_records',(select count(*) from discharges),'discharge_dated',(select count(*) from discharges where discharge_day is not null),
    'discharge_timed',(select count(*) from discharges where discharge_hour is not null),
    'attributed_records',case when v_named then (select count(*) from attribution) else null end,
    'visit_categories',coalesce((select jsonb_agg(jsonb_build_object('label',category,'count',n) order by category) from (select category,count(*) n from visits group by category) t),'[]'::jsonb),
    'discharge_days',coalesce((select jsonb_agg(jsonb_build_object('day',weekday_no,'count',n) order by weekday_no) from (select extract(isodow from discharge_day)::int as weekday_no,count(*) n from discharges where discharge_day is not null group by 1) t),'[]'::jsonb),
    'discharge_hours',coalesce((select jsonb_agg(jsonb_build_object('hour',hour_no,'count',n) order by hour_no) from (select discharge_hour as hour_no,count(*) n from discharges where discharge_hour is not null group by 1) t),'[]'::jsonb),
    'doctors',coalesce((select jsonb_agg(jsonb_build_object('staff_id',id,'name',display_name,
      'visite_n',case when visite_n>=5 then visite_n end,'discharge_n',case when discharge_n>=5 then discharge_n end,
      'clock_n',case when clock_n>=5 then clock_n end,'visit_regular',case when visite_n>=5 then visit_regular end,
      'visit_late',case when visite_n>=5 then visit_late end) order by display_name) from doctor_summary),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$fn$;
revoke all on function public.aureka_care_pattern_summary(bigint,integer,boolean) from public, anon;
grant execute on function public.aureka_care_pattern_summary(bigint,integer,boolean) to authenticated;
comment on function public.aureka_care_pattern_summary(bigint,integer,boolean) is 'RLS-preserving aggregate of reviewed visit categories and recorded discharge dates/times, with optional ready preview; named staff only from canonical attribution and HR performance permission.';
