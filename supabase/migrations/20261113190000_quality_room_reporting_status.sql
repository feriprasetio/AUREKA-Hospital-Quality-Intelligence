-- Monitoring agregat pelaporan indikator mutu per ruangan dan bulan.
-- Read-only; tidak mengubah atau menghapus data operasional.
create or replace function public.aureka_quality_room_reporting_status(p_year integer)
returns table (
  room_id bigint,
  month integer,
  total bigint,
  latest_report_at timestamptz,
  latest_period date
)
language sql
stable
security definer
set search_path = aureka_quality, aureka_system, public
as $$
  with allowed as (
    select r.id
    from public.master_rooms r
    where auth.uid() is not null
      and aureka_system.has_quality_room_access(r.id)
  )
  select q.room_id::bigint,
         extract(month from coalesce(q.record_date, q.period_start))::integer,
         count(*)::bigint,
         max(coalesce(q.updated_at, q.created_at)),
         max(coalesce(q.record_date, q.period_start))
  from aureka_quality.quality_records q
  join allowed a on a.id = q.room_id
  where q.profile_year = p_year
    and q.archived_at is null
    and q.status <> 'archived'
    and coalesce(q.record_date, q.period_start) >= make_date(p_year, 1, 1)
    and coalesce(q.record_date, q.period_start) < make_date(p_year + 1, 1, 1)
  group by q.room_id, extract(month from coalesce(q.record_date, q.period_start))
  order by q.room_id, extract(month from coalesce(q.record_date, q.period_start));
$$;

revoke all on function public.aureka_quality_room_reporting_status(integer) from public, anon;
grant execute on function public.aureka_quality_room_reporting_status(integer) to authenticated;
