-- Read-only, aggregate Rekam Medis analytics for the Patient workspace.
-- Source: existing quality_records rows with measurement_grain = patient_episode.
-- No names, medical-record numbers, subject keys, or clinical JSON are returned.
-- Requires patient_index.normalize_no_rm and patient_readmission_30 migrations.

create or replace function public.aureka_patient_record_analytics(
  p_room bigint,
  p_year integer
)
returns jsonb
language sql
stable
security definer
set search_path = aureka_quality, aureka_system, public
as $$
with allowed as (
  select coalesce(array_agg(r.id), '{}'::bigint[]) as room_ids
  from public.master_rooms r
  where auth.uid() is not null
    and aureka_system.has_quality_room_access(r.id)
    and (p_room is null or r.id = p_room)
),
source as (
  select
    q.id,
    q.room_id,
    r.name as unit_name,
    coalesce(q.record_date, q.created_at::date) as episode_date,
    q.created_at,
    q.core_data as c,
    coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb) as f
  from aureka_quality.quality_records q
  join public.master_rooms r on r.id = q.room_id
  cross join allowed a
  where q.room_id = any(a.room_ids)
    and q.profile_year = p_year
    and p_year between 2000 and 2100
    and q.measurement_grain = 'patient_episode'
    and q.archived_at is null
    and q.status <> 'archived'
),
raw as (
  select
    s.*,
    coalesce(
      nullif(trim(c->>'medical_record_no'), ''),
      nullif(trim(f->>'No. Rekam Medis'), ''),
      nullif(trim(f->>'No. RM'), '')
    ) as mrn_raw,
    coalesce(
      nullif(trim(c->>'diagnosis'), ''),
      nullif(trim(f->>'Diagnosa Tegak'), ''),
      nullif(trim(f->>'Diagnosa IGD'), ''),
      nullif(trim(f->>'Diagnosa'), ''),
      nullif(trim(f->>'Diagnosa Operasi'), ''),
      nullif(trim(f->>'Diagnosa Pasien'), ''),
      nullif(trim(f->>'Diagnosis Medis'), '')
    ) as diagnosis,
    coalesce(
      nullif(trim(c->>'icd10_code'), ''),
      nullif(trim(c->>'icd10'), ''),
      nullif(trim(f->>'Kode ICD-10'), ''),
      nullif(trim(f->>'ICD-10'), ''),
      nullif(trim(f->>'Kode Diagnosa'), '')
    ) as icd_raw,
    coalesce(
      nullif(trim(c->>'admission_at'), ''),
      nullif(trim(f->>'Tanggal Masuk'), ''),
      nullif(trim(f->>'Waktu Masuk'), ''),
      nullif(trim(f->>'Tanggal Dilayani'), '')
    ) as admission_raw,
    coalesce(
      nullif(trim(c->>'discharge_at'), ''),
      nullif(trim(f->>'Tanggal Keluar'), '')
    ) as discharge_raw,
    coalesce(
      nullif(trim(c->>'los_days'), ''),
      nullif(trim(c->'calculated_fields'->>'Length of Stay'), ''),
      nullif(trim(c->'calculated_fields'->>'Lenght of Stay'), ''),
      nullif(trim(f->>'Length of Stay'), ''),
      nullif(trim(f->>'Lenght of Stay'), '')
    ) as los_raw,
    (c ? 'discharge_at' or f ? 'Tanggal Keluar') as is_inpatient
  from source s
),
calculated as (
  select
    x.*,
    aureka_quality.normalize_no_rm(mrn_raw) as mrn_normalized,
    substring(
      upper(coalesce(nullif(trim(icd_raw), ''), diagnosis, ''))
      from '[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?'
    ) as icd10_code,
    case
      when is_inpatient
        and nullif(trim(discharge_raw), '') is not null
        and trim(los_raw) ~ '^[0-9]+(\.[0-9]+)?$'
        and trim(los_raw)::numeric >= 0
        then trim(los_raw)::numeric
      when is_inpatient
        and admission_raw ~ '^\d{4}-\d{2}-\d{2}'
        and discharge_raw ~ '^\d{4}-\d{2}-\d{2}'
        and left(replace(discharge_raw, 'T', ' '), 19) >= left(replace(admission_raw, 'T', ' '), 19)
        then greatest(
          1,
          ceil(extract(epoch from (
            left(replace(discharge_raw, 'T', ' '), 19)::timestamp
            - left(replace(admission_raw, 'T', ' '), 19)::timestamp
          )) / 86400.0)
        )::numeric
      else null::numeric
    end as los_days
  from raw x
),
monthly as (
  select
    m.month_no,
    count(c.id)::integer as episode_count
  from generate_series(1, 12) as m(month_no)
  left join calculated c
    on extract(year from c.episode_date)::integer = p_year
   and extract(month from c.episode_date)::integer = m.month_no
  group by m.month_no
),
top_icd10 as (
  select
    icd10_code as code,
    coalesce(max(diagnosis), 'Diagnosis belum diisi') as diagnosis,
    count(*)::integer as episode_count
  from calculated
  where icd10_code is not null
  group by icd10_code
  order by count(*) desc, icd10_code
  limit 10
),
unit_summary as (
  select
    room_id,
    unit_name,
    count(*)::integer as episode_count,
    count(*) filter (where is_inpatient)::integer as inpatient_count,
    count(*) filter (where is_inpatient and discharge_raw is not null)::integer as discharged_count,
    count(*) filter (where is_inpatient and discharge_raw is null)::integer as active_count,
    round(avg(los_days)::numeric, 2) as average_los,
    count(los_days)::integer as los_count
  from calculated
  group by room_id, unit_name
),
los_bands as (
  select
    b.band_order,
    b.label,
    count(c.id)::integer as episode_count
  from (values
    (1, '0 hari'),
    (2, '1–3 hari'),
    (3, '4–7 hari'),
    (4, '8–14 hari'),
    (5, '15 hari atau lebih')
  ) as b(band_order, label)
  left join calculated c on
    (b.band_order = 1 and c.los_days = 0)
    or (b.band_order = 2 and c.los_days between 1 and 3)
    or (b.band_order = 3 and c.los_days between 4 and 7)
    or (b.band_order = 4 and c.los_days between 8 and 14)
    or (b.band_order = 5 and c.los_days >= 15)
  group by b.band_order, b.label
)
select jsonb_build_object(
  'allowed', (select cardinality(room_ids) > 0 from allowed),
  'year', p_year,
  'scope_room_id', p_room,
  'episodes', (select count(*)::integer from calculated),
  'unique_patients', (select count(distinct mrn_normalized)::integer from calculated where mrn_normalized is not null),
  'inpatient_episodes', (select count(*)::integer from calculated where is_inpatient),
  'discharged_inpatients', (select count(*)::integer from calculated where is_inpatient and discharge_raw is not null),
  'active_inpatients', (select count(*)::integer from calculated where is_inpatient and discharge_raw is null),
  'valid_mrn', (select count(*)::integer from calculated where mrn_normalized is not null),
  'invalid_mrn', (select count(*)::integer from calculated where mrn_normalized is null),
  'diagnosis_available', (select count(*)::integer from calculated where diagnosis is not null),
  'diagnosis_missing', (select count(*)::integer from calculated where diagnosis is null),
  'icd10_coded', (select count(*)::integer from calculated where icd10_code is not null),
  'diagnosis_uncoded', (select count(*)::integer from calculated where diagnosis is not null and icd10_code is null),
  'los_count', (select count(*)::integer from calculated where los_days is not null),
  'average_los', (select round(avg(los_days)::numeric, 2) from calculated where los_days is not null),
  'monthly', (
    select coalesce(
      jsonb_agg(jsonb_build_object('month', month_no, 'count', episode_count) order by month_no),
      '[]'::jsonb
    ) from monthly
  ),
  'top_icd10', (
    select coalesce(
      jsonb_agg(jsonb_build_object('code', code, 'diagnosis', diagnosis, 'count', episode_count) order by episode_count desc, code),
      '[]'::jsonb
    ) from top_icd10
  ),
  'los_bands', (
    select coalesce(
      jsonb_agg(jsonb_build_object('label', label, 'count', episode_count) order by band_order),
      '[]'::jsonb
    ) from los_bands
  ),
  'units', (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'unit', unit_name,
        'episodes', episode_count,
        'inpatient', inpatient_count,
        'discharged', discharged_count,
        'active', active_count,
        'average_los', average_los,
        'los_count', los_count
      ) order by episode_count desc, unit_name),
      '[]'::jsonb
    ) from unit_summary
  )
);
$$;

revoke all on function public.aureka_patient_record_analytics(bigint, integer) from public, anon;
grant execute on function public.aureka_patient_record_analytics(bigint, integer) to authenticated;

comment on function public.aureka_patient_record_analytics(bigint, integer) is
  'Aggregate-only patient medical record analytics by accessible room and profile year; returns episode, LOS, ICD-10, MRN quality, monthly, and unit summaries without patient identifiers.';
