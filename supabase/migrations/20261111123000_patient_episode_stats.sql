-- Ringkasan episode pasien per unit untuk Infografis (dihitung di database, bukan menarik ribuan isi formulir).
-- Logika sama dengan HomeLandingWorkspace: diagnosis, kode ICD-10, lama rawat (LOS), dan pasien masih dirawat.
-- Hak akses diperiksa sekali memakai helper RLS yang sama (aureka_system.has_quality_room_access).
create or replace function public.aureka_patient_episode_stats(p_room bigint, p_year integer)
returns jsonb
language sql
stable
security definer
set search_path = aureka_quality, aureka_system, public
as $$
with ok as (
  select (auth.uid() is not null and aureka_system.has_quality_room_access(p_room)) as allowed
),
e as (
  select q.record_date, q.created_at, q.core_data as c,
         coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb) as f
  from aureka_quality.quality_records q, ok
  where ok.allowed and q.room_id = p_room and q.profile_year = p_year
    and q.archived_at is null and q.status <> 'archived' and q.measurement_grain = 'patient_episode'
),
d as (
  select e.*,
    coalesce(nullif(trim(c->>'diagnosis'),''), nullif(trim(f->>'Diagnosa Tegak'),''), nullif(trim(f->>'Diagnosa IGD'),''),
             nullif(trim(f->>'Diagnosa'),''), nullif(trim(f->>'Diagnosa Operasi'),'')) as diag,
    coalesce(c->>'los_days', c->'calculated_fields'->>'Length of Stay', c->'calculated_fields'->>'Lenght of Stay',
             f->>'Length of Stay', f->>'Lenght of Stay') as los_raw,
    coalesce(nullif(trim(c->>'admission_at'),''), nullif(trim(f->>'Tanggal Masuk'),'')) as start_raw,
    coalesce(nullif(trim(c->>'discharge_at'),''), nullif(trim(f->>'Tanggal Keluar'),'')) as end_raw,
    (c ? 'discharge_at' or f ? 'Tanggal Keluar') as has_discharge_field
  from e
),
x as (
  select d.*,
    substring(upper(coalesce(nullif(trim(c->>'icd10_code'),''), nullif(trim(c->>'icd10'),''), nullif(trim(f->>'Kode ICD-10'),''),
                             nullif(trim(f->>'ICD-10'),''), nullif(trim(f->>'Kode Diagnosa'),''), d.diag, ''))
              from '[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?') as icd,
    case
      when trim(los_raw) ~ '^[0-9]+(\.[0-9]+)?$' then trim(los_raw)::numeric
      -- LOS hanya untuk episode yang sudah pulang; pasien masih dirawat tidak ikut rata-rata.
      when start_raw ~ '^\d{4}-\d{2}-\d{2}' and end_raw ~ '^\d{4}-\d{2}-\d{2}' then greatest(1, ceil(extract(epoch from (
             left(replace(end_raw,'T',' '),19)::timestamp - left(replace(start_raw,'T',' '),19)::timestamp)) / 86400.0))
      else null
    end as los
  from d
),
m as (
  select extract(month from coalesce(record_date, created_at::date))::int as mon, count(*) as n
  from x where extract(year from coalesce(record_date, created_at::date)) = p_year group by 1
),
t as (
  select coalesce(icd, lower(diag)) as k, max(icd) as code, max(diag) as diagnosis, count(*) as n
  from x where coalesce(icd, diag) is not null group by 1 order by 4 desc limit 6
)
select jsonb_build_object(
  'allowed', (select allowed from ok),
  'episodes', (select count(*) from x),
  'active', (select count(*) from x where has_discharge_field and end_raw is null),
  'avg_los', (select avg(los) from x where los is not null and los >= 0),
  'los_count', (select count(*) from x where los is not null and los >= 0),
  'months', (select coalesce(jsonb_agg(jsonb_build_object('month', mon, 'count', n) order by mon), '[]'::jsonb) from m),
  'top', (select coalesce(jsonb_agg(jsonb_build_object('code', coalesce(code,'Belum berkode'), 'diagnosis', coalesce(diagnosis,'Diagnosis belum dinormalisasi'), 'count', n) order by n desc), '[]'::jsonb) from t)
);
$$;

revoke all on function public.aureka_patient_episode_stats(bigint, integer) from public, anon;
grant execute on function public.aureka_patient_episode_stats(bigint, integer) to authenticated;
