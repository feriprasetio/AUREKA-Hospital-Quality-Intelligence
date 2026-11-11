-- Versi cepat aureka_quality_room_month_counts.
-- Versi sebelumnya (SECURITY INVOKER) memeriksa RLS untuk setiap baris (±25.000 baris → ±8 detik).
-- Versi ini memeriksa hak akses SEKALI per unit memakai helper RLS yang sama
-- (aureka_system.has_quality_room_access), lalu menghitung baris unit yang diizinkan saja.
create or replace function public.aureka_quality_room_month_counts(p_year integer, p_grain text default null)
returns table (room_id bigint, month integer, measurement_grain text, total bigint)
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
         extract(month from coalesce(q.record_date, q.period_start))::integer as month,
         q.measurement_grain::text,
         count(*)::bigint
  from aureka_quality.quality_records q
  join allowed a on a.id = q.room_id
  where q.profile_year = p_year
    and q.archived_at is null
    and q.status <> 'archived'
    and (p_grain is null or q.measurement_grain = p_grain)
  group by 1, 2, 3;
$$;

revoke all on function public.aureka_quality_room_month_counts(integer, text) from public, anon;
grant execute on function public.aureka_quality_room_month_counts(integer, text) to authenticated;
