-- Patient medical-record analysis and safe episode-index synchronization.
-- Keep the Patient Index as a durable MPI: do not mass-delete, zero, or rewrite
-- historical/bridged patient rows merely because their old source episodes are
-- not present in the current operational logbook table.
--
-- Correct the known trigger defect: editing an existing episode must not add
-- another visit to patient_index.total_episode.
--
-- Only the AUREKA-derived metadata is refreshed on UPDATE. A missing MPI row
-- discovered during an UPDATE is initialized at one episode; existing legacy
-- counts and external SIMRS/bridging fields are preserved.

create or replace function aureka_quality.patient_index_update_metadata(
  p_core jsonb, p_room bigint, p_date date
)
returns void
language plpgsql
security definer
set search_path = aureka_quality, public
as $$
declare
  f jsonb := coalesce(p_core->'form_fields', p_core->'form_data', '{}'::jsonb);
  v_rm text := aureka_quality.normalize_no_rm(coalesce(p_core->>'medical_record_no', f->>'No. Rekam Medis', f->>'No. RM'));
  v_name text := nullif(trim(coalesce(p_core->>'patient_name', f->>'Nama Pasien')), '');
  v_diag text := coalesce(
    nullif(trim(p_core->>'diagnosis'), ''),
    nullif(trim(f->>'Diagnosa Tegak'), ''),
    nullif(trim(f->>'Diagnosa IGD'), ''),
    nullif(trim(f->>'Diagnosa'), ''),
    nullif(trim(f->>'Diagnosa Operasi'), '')
  );
  v_unit text;
begin
  if v_rm is null then return; end if;
  select name into v_unit from public.master_rooms where id = p_room;

  insert into aureka_quality.patient_index as p
    (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
  values
    (v_rm, v_name, p_date, p_date, 1, array[p_room], v_unit, v_diag)
  on conflict (no_rm) do update set
    nama_pasien = case
      when excluded.last_seen >= coalesce(p.last_seen, excluded.last_seen)
        then coalesce(excluded.nama_pasien, p.nama_pasien)
      else coalesce(p.nama_pasien, excluded.nama_pasien)
    end,
    first_seen = case
      when p.first_seen is null then excluded.first_seen
      else least(p.first_seen, excluded.first_seen)
    end,
    last_seen = greatest(coalesce(p.last_seen, excluded.last_seen), excluded.last_seen),
    room_ids = (select array(select distinct unnest(p.room_ids || excluded.room_ids))),
    unit_terakhir = case
      when p.last_seen is null or excluded.last_seen >= p.last_seen then excluded.unit_terakhir
      else p.unit_terakhir
    end,
    diagnosis_terakhir = case
      when p.last_seen is null or excluded.last_seen >= p.last_seen then coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir)
      else p.diagnosis_terakhir
    end,
    -- Intentionally do not increment total_episode while updating metadata.
    total_episode = p.total_episode,
    updated_at = now();
end;
$$;

revoke all on function aureka_quality.patient_index_update_metadata(jsonb, bigint, date) from public, anon, authenticated;
revoke all on function aureka_quality.patient_index_touch(jsonb, bigint, date) from public, anon, authenticated;

create or replace function aureka_quality.patient_index_on_record()
returns trigger
language plpgsql
security definer
set search_path = aureka_quality, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.measurement_grain = 'patient_episode'
       and new.archived_at is null and new.status <> 'archived' then
      perform aureka_quality.patient_index_touch(
        new.core_data, new.room_id, coalesce(new.record_date, new.created_at::date)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    if new.measurement_grain = 'patient_episode'
       and new.archived_at is null and new.status <> 'archived'
       and (
         new.core_data is distinct from old.core_data
         or new.room_id is distinct from old.room_id
         or new.record_date is distinct from old.record_date
       ) then
      perform aureka_quality.patient_index_update_metadata(
        new.core_data, new.room_id, coalesce(new.record_date, new.created_at::date)
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function aureka_quality.patient_index_on_record() from public, anon, authenticated;

drop trigger if exists patient_index_sync on aureka_quality.quality_records;
create trigger patient_index_sync
after insert or update of core_data, room_id, record_date, measurement_grain, archived_at, status
on aureka_quality.quality_records
for each row execute function aureka_quality.patient_index_on_record();

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
