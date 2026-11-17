-- Patient domain refinement:
-- 1. Patient pages become read-only medical-record directory and cohort analytics.
-- 2. Rebuild patient_index episode counts from source records and make its trigger idempotent.
-- 3. Extend the existing patient episode aggregate without changing its response contract.

create or replace function aureka_quality.patient_index_refresh(p_no_rm text)
returns void
language plpgsql
security definer
set search_path = aureka_quality, public
as $$
declare
  v_rm text := aureka_quality.normalize_no_rm(p_no_rm);
  v_count integer := 0;
  v_first date;
  v_last date;
  v_rooms bigint[];
  v_last_room bigint;
  v_name text;
  v_diagnosis text;
  v_unit text;
begin
  if v_rm is null then return; end if;

  with episodes as (
    select q.room_id,
           coalesce(q.record_date, q.created_at::date) as episode_date,
           nullif(trim(coalesce(q.core_data->>'patient_name',
             coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Nama Pasien')), '') as patient_name,
           coalesce(
             nullif(trim(q.core_data->>'diagnosis'), ''),
             nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa Tegak'), ''),
             nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa IGD'), ''),
             nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa'), ''),
             nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa Operasi'), '')
           ) as diagnosis
    from aureka_quality.quality_records q
    where q.measurement_grain = 'patient_episode'
      and q.archived_at is null and q.status <> 'archived'
      and aureka_quality.normalize_no_rm(coalesce(
        q.core_data->>'medical_record_no',
        coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'No. Rekam Medis',
        coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'No. RM'
      )) = v_rm
  )
  select count(*)::integer, min(episode_date), max(episode_date),
         coalesce(array_agg(distinct room_id order by room_id), '{}'::bigint[]),
         (array_agg(room_id order by episode_date desc nulls last, room_id))[1],
         (array_agg(patient_name order by episode_date desc nulls last) filter (where patient_name is not null))[1],
         (array_agg(diagnosis order by episode_date desc nulls last) filter (where diagnosis is not null))[1]
    into v_count, v_first, v_last, v_rooms, v_last_room, v_name, v_diagnosis
    from episodes;

  if v_count = 0 then
    update aureka_quality.patient_index
       set first_seen = null, last_seen = null, total_episode = 0,
           room_ids = '{}'::bigint[], unit_terakhir = null, diagnosis_terakhir = null,
           updated_at = now()
     where no_rm = v_rm;
    return;
  end if;

  select name into v_unit from public.master_rooms where id = v_last_room;
  insert into aureka_quality.patient_index as p
    (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
  values
    (v_rm, v_name, v_first, v_last, v_count, v_rooms, v_unit, v_diagnosis)
  on conflict (no_rm) do update set
    nama_pasien = coalesce(excluded.nama_pasien, p.nama_pasien),
    first_seen = excluded.first_seen,
    last_seen = excluded.last_seen,
    total_episode = excluded.total_episode,
    room_ids = excluded.room_ids,
    unit_terakhir = excluded.unit_terakhir,
    diagnosis_terakhir = coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir),
    updated_at = now();
end;
$$;

revoke all on function aureka_quality.patient_index_refresh(text) from public, anon, authenticated;

create or replace function aureka_quality.patient_index_on_record()
returns trigger
language plpgsql
security definer
set search_path = aureka_quality, public
as $$
declare
  v_old_rm text;
  v_new_rm text;
begin
  if tg_op = 'UPDATE'
     and old.measurement_grain = 'patient_episode'
     and old.archived_at is null and old.status <> 'archived' then
    v_old_rm := aureka_quality.normalize_no_rm(coalesce(
      old.core_data->>'medical_record_no',
      coalesce(old.core_data->'form_fields', old.core_data->'form_data', '{}'::jsonb)->>'No. Rekam Medis',
      coalesce(old.core_data->'form_fields', old.core_data->'form_data', '{}'::jsonb)->>'No. RM'
    ));
  end if;

  if new.measurement_grain = 'patient_episode'
     and new.archived_at is null and new.status <> 'archived' then
    v_new_rm := aureka_quality.normalize_no_rm(coalesce(
      new.core_data->>'medical_record_no',
      coalesce(new.core_data->'form_fields', new.core_data->'form_data', '{}'::jsonb)->>'No. Rekam Medis',
      coalesce(new.core_data->'form_fields', new.core_data->'form_data', '{}'::jsonb)->>'No. RM'
    ));
  end if;

  -- Editing an episode refreshes its derived patient row; it never increments
  -- total_episode as though a second episode had been created.
  if v_old_rm is not null and v_old_rm is distinct from v_new_rm then
    perform aureka_quality.patient_index_refresh(v_old_rm);
  end if;
  if v_new_rm is not null then
    perform aureka_quality.patient_index_refresh(v_new_rm);
  end if;

  return new;
end;
$$;

revoke all on function aureka_quality.patient_index_on_record() from public, anon, authenticated;

drop trigger if exists patient_index_sync on aureka_quality.quality_records;
create trigger patient_index_sync
after insert or update of core_data, measurement_grain, archived_at, status
on aureka_quality.quality_records
for each row execute function aureka_quality.patient_index_on_record();

-- Correct historical over-counts caused by the former UPDATE trigger.
-- Only AUREKA-derived columns are rebuilt; SIMRS identity and bridging fields remain untouched.
create temporary table patient_index_rebuild on commit drop as
with episodes as (
  select aureka_quality.normalize_no_rm(coalesce(
           q.core_data->>'medical_record_no',
           coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'No. Rekam Medis',
           coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'No. RM'
         )) as no_rm,
         nullif(trim(coalesce(q.core_data->>'patient_name',
           coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Nama Pasien')), '') as nama,
         coalesce(
           nullif(trim(q.core_data->>'diagnosis'), ''),
           nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa Tegak'), ''),
           nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa IGD'), ''),
           nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa'), ''),
           nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb)->>'Diagnosa Operasi'), '')
         ) as diagnosis,
         q.room_id, coalesce(q.record_date, q.created_at::date) as episode_date
  from aureka_quality.quality_records q
  where q.measurement_grain = 'patient_episode'
    and q.archived_at is null and q.status <> 'archived'
), grouped as (
  select no_rm,
         (array_agg(nama order by episode_date desc nulls last) filter (where nama is not null))[1] as nama_pasien,
         min(episode_date) as first_seen,
         max(episode_date) as last_seen,
         count(*)::integer as total_episode,
         array_agg(distinct room_id order by room_id) as room_ids,
         (array_agg(room_id order by episode_date desc nulls last, room_id))[1] as last_room,
         (array_agg(diagnosis order by episode_date desc nulls last) filter (where diagnosis is not null))[1] as diagnosis_terakhir
  from episodes
  where no_rm is not null
  group by no_rm
)
select g.*, r.name as unit_terakhir
from grouped g
left join public.master_rooms r on r.id = g.last_room;

insert into aureka_quality.patient_index as p
  (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
select no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir
from patient_index_rebuild
on conflict (no_rm) do update set
  nama_pasien = coalesce(excluded.nama_pasien, p.nama_pasien),
  first_seen = excluded.first_seen,
  last_seen = excluded.last_seen,
  total_episode = excluded.total_episode,
  room_ids = excluded.room_ids,
  unit_terakhir = excluded.unit_terakhir,
  diagnosis_terakhir = coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir),
  updated_at = now();

update aureka_quality.patient_index p
   set first_seen = null, last_seen = null, total_episode = 0,
       room_ids = '{}'::bigint[], unit_terakhir = null, diagnosis_terakhir = null,
       updated_at = now()
 where not exists (select 1 from patient_index_rebuild r where r.no_rm = p.no_rm)
   and p.total_episode <> 0;

-- Extend the existing aggregate used by Visual Intelligence. Existing keys remain stable.
-- ICD-10 is "identified" only when an explicit/recognisable code is present in the source.
-- LOS excludes open inpatient episodes and is calculated only for completed stays.
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
    coalesce(nullif(trim(c->>'diagnosis'),''), nullif(trim(f->>'Diagnosa Tegak'),''), nullif(trim(f->>'Diagnosa IGD'),''), nullif(trim(f->>'Diagnosa'),''), nullif(trim(f->>'Diagnosa Operasi'),'')) as diag,
    coalesce(c->>'los_days', c->'calculated_fields'->>'Length of Stay', c->'calculated_fields'->>'Lenght of Stay', f->>'Length of Stay', f->>'Lenght of Stay') as los_raw,
    coalesce(nullif(trim(c->>'admission_at'),''), nullif(trim(f->>'Tanggal Masuk'),'')) as start_raw,
    coalesce(nullif(trim(c->>'discharge_at'),''), nullif(trim(f->>'Tanggal Keluar'),'')) as end_raw,
    (c ? 'discharge_at' or f ? 'Tanggal Keluar') as has_discharge_field,
    aureka_quality.normalize_no_rm(coalesce(c->>'medical_record_no', f->>'No. Rekam Medis', f->>'No. RM')) as normalized_rm
  from e
),
x as (
  select d.*,
    substring(upper(coalesce(nullif(trim(c->>'icd10_code'),''), nullif(trim(c->>'icd10'),''), nullif(trim(f->>'Kode ICD-10'),''), nullif(trim(f->>'ICD-10'),''), nullif(trim(f->>'Kode Diagnosa'),''), d.diag, ''))
      from '[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?') as icd,
    case
      when end_raw is not null and trim(los_raw) ~ '^[0-9]+(\.[0-9]+)?$' then trim(los_raw)::numeric
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
  from x where coalesce(icd, diag) is not null group by 1 order by 4 desc limit 10
),
lb as (
  select case
    when los <= 1 then '0–1 hari'
    when los <= 3 then '2–3 hari'
    when los <= 7 then '4–7 hari'
    when los <= 14 then '8–14 hari'
    else '≥15 hari'
  end as band,
  case when los <= 1 then 1 when los <= 3 then 2 when los <= 7 then 3 when los <= 14 then 4 else 5 end as sort_order,
  count(*) as n
  from x where los is not null and los >= 0
  group by 1, 2
)
select jsonb_build_object(
  'allowed', (select allowed from ok),
  'episodes', (select count(*) from x),
  'active', (select count(*) from x where has_discharge_field and end_raw is null),
  'avg_los', (select avg(los) from x where los is not null and los >= 0),
  'los_count', (select count(*) from x where los is not null and los >= 0),
  'patients_unique', (select count(distinct normalized_rm) from x where normalized_rm is not null),
  'icd10_coded', (select count(*) from x where icd is not null),
  'icd10_uncoded', (select count(*) from x where icd is null and diag is not null),
  'diagnosis_missing', (select count(*) from x where diag is null),
  'rm_invalid', (select count(*) from x where normalized_rm is null),
  'readmission_30', (select count(*) from aureka_quality.patient_readmission_30(array[p_room]::bigint[])),
  'months', (select coalesce(jsonb_agg(jsonb_build_object('month', mon, 'count', n) order by mon), '[]'::jsonb) from m),
  'top', (select coalesce(jsonb_agg(jsonb_build_object('code', coalesce(code,'Belum berkode'), 'diagnosis', coalesce(diagnosis,'Diagnosis belum dinormalisasi'), 'count', n) order by n desc), '[]'::jsonb) from t),
  'los_bands', (select coalesce(jsonb_agg(jsonb_build_object('band', band, 'count', n) order by sort_order), '[]'::jsonb) from lb)
);
$$;

revoke all on function public.aureka_patient_episode_stats(bigint, integer) from public, anon;
grant execute on function public.aureka_patient_episode_stats(bigint, integer) to authenticated;
