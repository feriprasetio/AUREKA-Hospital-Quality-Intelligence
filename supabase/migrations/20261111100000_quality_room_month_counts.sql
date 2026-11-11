-- Hitung jumlah catatan mutu per unit, per bulan, per jenis (grain) langsung di database.
-- Dipakai Register Pasien (jumlah per unit), Infografis, dan Tanya AUREKA, menggantikan
-- pengambilan puluhan ribu baris ke browser/fungsi (lambat dan terpotong di ±4.000 baris).
-- SECURITY INVOKER: RLS quality_records tetap berlaku — pengguna hanya menghitung baris yang boleh dilihatnya.

create index if not exists quality_records_year_grain_room_idx
  on aureka_quality.quality_records (profile_year, measurement_grain, room_id)
  where archived_at is null;

create or replace function public.aureka_quality_room_month_counts(p_year integer, p_grain text default null)
returns table (room_id bigint, month integer, measurement_grain text, total bigint)
language sql
stable
security invoker
set search_path = aureka_quality, public
as $$
  select q.room_id::bigint,
         extract(month from coalesce(q.record_date, q.period_start))::integer as month,
         q.measurement_grain::text,
         count(*)::bigint
  from aureka_quality.quality_records q
  where q.profile_year = p_year
    and q.archived_at is null
    and q.status <> 'archived'
    and (p_grain is null or q.measurement_grain = p_grain)
  group by 1, 2, 3;
$$;

revoke all on function public.aureka_quality_room_month_counts(integer, text) from public, anon;
grant execute on function public.aureka_quality_room_month_counts(integer, text) to authenticated;
