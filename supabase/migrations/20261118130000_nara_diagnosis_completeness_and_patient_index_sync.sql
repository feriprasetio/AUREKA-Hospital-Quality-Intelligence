-- NARA diagnosis completeness and patient-index field alignment.
-- Extends the patient index trigger with diagnosis field names already consumed by
-- the clinical analytics reader, and makes missing diagnosis provenance visible.

create or replace function aureka_quality.patient_index_touch(p_core jsonb, p_room bigint, p_date date)
returns void
language plpgsql
security definer
set search_path to 'aureka_quality', 'public'
as $function$
declare
  f jsonb := coalesce(p_core->'form_fields', p_core->'form_data', '{}'::jsonb);
  v_rm text := aureka_quality.normalize_no_rm(coalesce(p_core->>'medical_record_no', f->>'No. Rekam Medis', f->>'No. RM'));
  v_nama text := nullif(trim(coalesce(p_core->>'patient_name', f->>'Nama Pasien')), '');
  v_diag text := coalesce(
    nullif(trim(p_core->>'diagnosis'),''),
    nullif(trim(f->>'Diagnosa Tegak'),''),
    nullif(trim(f->>'Diagnosa IGD'),''),
    nullif(trim(f->>'Diagnosa Primer'),''),
    nullif(trim(f->>'Diagnosa Utama'),''),
    nullif(trim(f->>'Diagnosa'),''),
    nullif(trim(f->>'Diagnosa Operasi'),'')
  );
  v_unit text;
begin
  if v_rm is null then return; end if;
  select name into v_unit from public.master_rooms where id = p_room;
  insert into aureka_quality.patient_index as p
    (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
  values (v_rm, v_nama, p_date, p_date, 1, array[p_room], v_unit, v_diag)
  on conflict (no_rm) do update set
    nama_pasien = case when excluded.last_seen >= coalesce(p.last_seen, excluded.last_seen)
      then coalesce(excluded.nama_pasien, p.nama_pasien) else coalesce(p.nama_pasien, excluded.nama_pasien) end,
    first_seen = least(p.first_seen, excluded.first_seen),
    last_seen = greatest(p.last_seen, excluded.last_seen),
    total_episode = p.total_episode + 1,
    room_ids = (select array(select distinct unnest(p.room_ids || excluded.room_ids))),
    unit_terakhir = case when excluded.last_seen >= coalesce(p.last_seen, excluded.last_seen)
      then excluded.unit_terakhir else p.unit_terakhir end,
    diagnosis_terakhir = case when excluded.last_seen >= coalesce(p.last_seen, excluded.last_seen)
      then coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir) else p.diagnosis_terakhir end,
    updated_at = now();
end
$function$;

create or replace function public.aureka_nara_clinical_summary(
  p_year integer default null,
  p_room bigint default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_year integer := coalesce(p_year, extract(year from (pg_catalog.now() at time zone 'Asia/Pontianak'))::integer);
  v_role text;
  v_rooms bigint[];
  v_patient_source_rows bigint := 0;
  v_patient_index_context jsonb := '{}'::jsonb;
  v_episode_count bigint := 0;
  v_episode_patient_count bigint := 0;
  v_episode_missing_mrn bigint := 0;
  v_episode_diagnosis_rows bigint := 0;
  v_episode_group_count integer := 0;
  v_episode_suppressed_count integer := 0;
  v_episode_reportable_count integer := 0;
  v_episode_context jsonb := '{}'::jsonb;
  v_patient_count bigint := 0;
  v_missing_mrn bigint := 0;
  v_group_count integer := 0;
  v_suppressed integer := 0;
  v_basis text := 'no_clinical_data';
  v_top jsonb := '[]'::jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit,10),10));
begin
  if auth.uid() is null then
    raise exception 'Autentikasi diperlukan.' using errcode = '28000';
  end if;

  v_role := aureka_system.current_role_code();
  if v_role is null then
    raise exception 'Profil aktif atau role tidak ditemukan.' using errcode = '42501';
  end if;

  if v_year < 2000 or v_year > 2100 then
    raise exception 'Tahun analisis tidak valid.' using errcode = '22023';
  end if;

  if p_room is not null and not aureka_system.has_quality_room_access(p_room) then
    raise exception 'Akses analitik klinis untuk unit ini tidak diberikan.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.array_agg(r.id order by r.sort_order), '{}'::bigint[])
    into v_rooms
  from public.master_rooms r
  where r.is_active = true
    and aureka_system.has_quality_room_access(r.id)
    and (p_room is null or r.id = p_room);

  if coalesce(pg_catalog.cardinality(v_rooms),0) = 0 then
    raise exception 'Tidak ada unit yang dapat diakses untuk analitik klinis.' using errcode = '42501';
  end if;

  -- Diagnosis completeness is reported separately from diagnosis ranking.
  -- A blank diagnosis is missing data, never interpreted as "no disease".
  with patient_cohort as (
    select p.diagnosis_terakhir, r.name as unit_name
    from aureka_quality.patient_index p
    join public.master_rooms r on r.name = p.unit_terakhir
    where r.id = any(v_rooms)
      and p.last_seen >= pg_catalog.make_date(v_year,1,1)
      and p.last_seen < pg_catalog.make_date(v_year+1,1,1)
  ), unit_summary as (
    select unit_name,
      pg_catalog.count(*)::bigint as patient_count,
      pg_catalog.count(*) filter (where nullif(pg_catalog.btrim(diagnosis_terakhir),'') is not null)::bigint as diagnosed_count,
      pg_catalog.count(*) filter (where nullif(pg_catalog.btrim(diagnosis_terakhir),'') is null)::bigint as missing_count
    from patient_cohort
    group by unit_name
  ), totals as (
    select
      pg_catalog.count(*)::bigint as total_patients,
      pg_catalog.count(*) filter (where nullif(pg_catalog.btrim(diagnosis_terakhir),'') is not null)::bigint as diagnosed_patients,
      pg_catalog.count(*) filter (where nullif(pg_catalog.btrim(diagnosis_terakhir),'') is null)::bigint as missing_diagnosis
    from patient_cohort
  )
  select pg_catalog.jsonb_build_object(
    'total_patients', totals.total_patients,
    'diagnosed_patients', totals.diagnosed_patients,
    'missing_diagnosis', totals.missing_diagnosis,
    'diagnosis_coverage_pct', case when totals.total_patients > 0
      then pg_catalog.round(100.0 * totals.diagnosed_patients / totals.total_patients, 2) else 0 end,
    'unit_of_analysis', 'satu baris indeks pasien per No. RM',
    'by_unit', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'unit', u.unit_name,
        'patient_count', u.patient_count,
        'diagnosed_count', u.diagnosed_count,
        'missing_diagnosis', u.missing_count,
        'coverage_pct', case when u.patient_count > 0
          then pg_catalog.round(100.0 * u.diagnosed_count / u.patient_count, 2) else 0 end
      ) order by u.patient_count desc, u.unit_name)
      from unit_summary u
      where u.patient_count >= 5
    ), '[]'::jsonb)
  )
  into v_patient_index_context
  from totals;

  -- Episode cohort is always calculated separately; it never replaces patient-index ranking.
  with source_rows as (
    select q.id,
      aureka_quality.normalize_no_rm(coalesce(
        nullif(pg_catalog.btrim(q.core_data->>'medical_record_no'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. Rekam Medis'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. RM'),'')
      )) as internal_no_rm,
      coalesce(
        nullif(pg_catalog.btrim(q.core_data->>'diagnosis'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Tegak'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa IGD'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Primer'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Utama'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa'),''),
        nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Operasi'),'')
      ) as raw_diagnosis
    from aureka_quality.quality_records q
    where q.room_id = any(v_rooms)
      and q.measurement_grain = 'patient_episode'
      and q.archived_at is null and q.status <> 'archived'
      and coalesce(q.record_date, q.created_at::date) >= pg_catalog.make_date(v_year,1,1)
      and coalesce(q.record_date, q.created_at::date) < pg_catalog.make_date(v_year+1,1,1)
  ), safe_rows as (
    select s.id, s.internal_no_rm,
      upper(pg_catalog.regexp_replace(pg_catalog.btrim(s.raw_diagnosis), '[[:space:]]+', ' ', 'g')) as diagnosis_label,
      aureka_quality.nara_normalize_diagnosis(s.raw_diagnosis) as diagnosis_key
    from source_rows s
    where s.raw_diagnosis is not null
      and pg_catalog.length(pg_catalog.btrim(s.raw_diagnosis)) between 2 and 120
      and aureka_quality.nara_normalize_diagnosis(s.raw_diagnosis) is not null
      and s.raw_diagnosis !~ '[0-9]{6,}'
      and s.raw_diagnosis !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
      and s.raw_diagnosis !~* '^[0-9[:space:]+()./-]+$'
      and s.raw_diagnosis !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
      and s.raw_diagnosis !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
      and not exists (
        select 1 from aureka_quality.patient_index pi
        where pi.no_rm = s.internal_no_rm
          and lower(btrim(pi.nama_pasien)) = lower(btrim(s.raw_diagnosis))
      )
  ), mapped as (
    select s.id, s.internal_no_rm, s.diagnosis_label, s.diagnosis_key,
      d.diagnosis_label as canonical_label, d.icd10_code, d.icd10_title, d.mapping_status,
      case when d.mapping_status = 'validated' and d.icd10_code is not null
        then 'ICD10:' || d.icd10_code else 'TERM:' || s.diagnosis_key end as group_key
    from safe_rows s
    left join aureka_quality.nara_icd10_dictionary d on d.diagnosis_key = s.diagnosis_key
  ), grouped as (
    select group_key,
      case when pg_catalog.bool_or(mapping_status = 'validated')
        then coalesce(pg_catalog.max(canonical_label), pg_catalog.min(diagnosis_label))
        else pg_catalog.min(diagnosis_label) end as diagnosis,
      case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_code) end as icd10_code,
      case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_title) end as icd10_title,
      case when pg_catalog.bool_or(mapping_status = 'validated') then 'validated'
           when pg_catalog.bool_or(mapping_status = 'proposed') then 'proposed'
           when pg_catalog.bool_or(mapping_status = 'rejected') then 'rejected'
           else 'unmapped' end as coding_status,
      pg_catalog.count(*)::bigint as episodes,
      pg_catalog.count(distinct internal_no_rm)::bigint as patients
    from mapped
    group by group_key
  )
  select
    (select pg_catalog.count(*) from source_rows),
    (select pg_catalog.count(distinct internal_no_rm) from source_rows),
    (select pg_catalog.count(*) from source_rows where internal_no_rm is null),
    (select pg_catalog.count(*) from safe_rows),
    (select pg_catalog.count(*) from grouped),
    (select pg_catalog.count(*) from grouped where patients < 5),
    (select pg_catalog.count(*) from grouped where patients >= 5)
  into v_episode_count, v_episode_patient_count, v_episode_missing_mrn,
       v_episode_diagnosis_rows, v_episode_group_count, v_episode_suppressed_count,
       v_episode_reportable_count;

  v_episode_context := pg_catalog.jsonb_build_object(
    'total_episode_records', v_episode_count,
    'unique_patients_with_mrn', v_episode_patient_count,
    'episodes_without_mrn', v_episode_missing_mrn,
    'diagnosis_records_analyzable', v_episode_diagnosis_rows,
    'diagnosis_group_count', v_episode_group_count,
    'suppressed_group_count', v_episode_suppressed_count,
    'reportable_group_count', v_episode_reportable_count,
    'unit_of_analysis', 'episode dan pasien unik dihitung terpisah'
  );

  -- Patient index is the primary source for ranking latest diagnosis per unique patient.
  -- It contains the broader diagnosed-patient population than the currently populated episode logbooks.
  with patient_rows as (
    select p.no_rm as internal_no_rm,
      upper(pg_catalog.regexp_replace(pg_catalog.btrim(p.diagnosis_terakhir), '[[:space:]]+', ' ', 'g')) as diagnosis_label,
      aureka_quality.nara_normalize_diagnosis(p.diagnosis_terakhir) as diagnosis_key
    from aureka_quality.patient_index p
    join public.master_rooms r on r.name = p.unit_terakhir
    where r.id = any(v_rooms)
      and p.last_seen >= pg_catalog.make_date(v_year,1,1)
      and p.last_seen < pg_catalog.make_date(v_year+1,1,1)
      and nullif(pg_catalog.btrim(p.diagnosis_terakhir),'') is not null
      and pg_catalog.length(pg_catalog.btrim(p.diagnosis_terakhir)) between 2 and 120
      and aureka_quality.nara_normalize_diagnosis(p.diagnosis_terakhir) is not null
      and p.diagnosis_terakhir !~ '[0-9]{6,}'
      and p.diagnosis_terakhir !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
      and p.diagnosis_terakhir !~* '^[0-9[:space:]+()./-]+$'
      and p.diagnosis_terakhir !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
      and p.diagnosis_terakhir !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
      and lower(btrim(p.diagnosis_terakhir)) is distinct from lower(btrim(p.nama_pasien))
  )
  select pg_catalog.count(*) into v_patient_source_rows from patient_rows;

  if v_patient_source_rows > 0 then
    v_basis := 'patient_index_latest_diagnosis';
    with patient_rows as (
      select p.no_rm as internal_no_rm,
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(p.diagnosis_terakhir), '[[:space:]]+', ' ', 'g')) as diagnosis_label,
        aureka_quality.nara_normalize_diagnosis(p.diagnosis_terakhir) as diagnosis_key
      from aureka_quality.patient_index p
      join public.master_rooms r on r.name = p.unit_terakhir
      where r.id = any(v_rooms)
        and p.last_seen >= pg_catalog.make_date(v_year,1,1)
        and p.last_seen < pg_catalog.make_date(v_year+1,1,1)
        and nullif(pg_catalog.btrim(p.diagnosis_terakhir),'') is not null
        and pg_catalog.length(pg_catalog.btrim(p.diagnosis_terakhir)) between 2 and 120
        and aureka_quality.nara_normalize_diagnosis(p.diagnosis_terakhir) is not null
        and p.diagnosis_terakhir !~ '[0-9]{6,}'
        and p.diagnosis_terakhir !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
        and p.diagnosis_terakhir !~* '^[0-9[:space:]+()./-]+$'
        and p.diagnosis_terakhir !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
        and p.diagnosis_terakhir !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
        and lower(btrim(p.diagnosis_terakhir)) is distinct from lower(btrim(p.nama_pasien))
    ), mapped as (
      select s.internal_no_rm, s.diagnosis_label, s.diagnosis_key,
        d.diagnosis_label as canonical_label, d.icd10_code, d.icd10_title, d.mapping_status,
        case when d.mapping_status = 'validated' and d.icd10_code is not null
          then 'ICD10:' || d.icd10_code else 'TERM:' || s.diagnosis_key end as group_key
      from patient_rows s
      left join aureka_quality.nara_icd10_dictionary d on d.diagnosis_key = s.diagnosis_key
    ), grouped as (
      select group_key,
        case when pg_catalog.bool_or(mapping_status = 'validated')
          then coalesce(pg_catalog.max(canonical_label), pg_catalog.min(diagnosis_label))
          else pg_catalog.min(diagnosis_label) end as diagnosis,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_code) end as icd10_code,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_title) end as icd10_title,
        case when pg_catalog.bool_or(mapping_status = 'validated') then 'validated'
             when pg_catalog.bool_or(mapping_status = 'proposed') then 'proposed'
             when pg_catalog.bool_or(mapping_status = 'rejected') then 'rejected'
             else 'unmapped' end as coding_status,
        pg_catalog.count(distinct internal_no_rm)::bigint as patients
      from mapped
      group by group_key
    )
    select
      (select pg_catalog.count(distinct internal_no_rm) from patient_rows),
      (select pg_catalog.count(*) from grouped),
      (select pg_catalog.count(*) from grouped where patients < 5),
      coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'diagnosis', diagnosis,
        'icd10_code', icd10_code,
        'icd10_title', icd10_title,
        'coding_status', coding_status,
        'patient_count', patients,
        'episode_count', null
      ) order by patients desc, diagnosis)
      from (select * from grouped where patients >= 5 order by patients desc, diagnosis limit v_limit) top_rows), '[]'::jsonb)
    into v_patient_count, v_group_count, v_suppressed, v_top;
    v_missing_mrn := 0;

  elsif v_episode_diagnosis_rows > 0 then
    -- If no eligible latest diagnoses exist in the patient index, episode data becomes the primary basis.
    v_basis := 'episode_records';
    with source_rows as (
      select q.id,
        aureka_quality.normalize_no_rm(coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'medical_record_no'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. Rekam Medis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. RM'),'')
        )) as internal_no_rm,
        coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'diagnosis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Tegak'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa IGD'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Primer'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Utama'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Operasi'),'')
        ) as raw_diagnosis
      from aureka_quality.quality_records q
      where q.room_id = any(v_rooms)
        and q.measurement_grain = 'patient_episode'
        and q.archived_at is null and q.status <> 'archived'
        and coalesce(q.record_date, q.created_at::date) >= pg_catalog.make_date(v_year,1,1)
        and coalesce(q.record_date, q.created_at::date) < pg_catalog.make_date(v_year+1,1,1)
    ), safe_rows as (
      select s.id, s.internal_no_rm,
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(s.raw_diagnosis), '[[:space:]]+', ' ', 'g')) as diagnosis_label,
        aureka_quality.nara_normalize_diagnosis(s.raw_diagnosis) as diagnosis_key
      from source_rows s
      where s.raw_diagnosis is not null
        and pg_catalog.length(pg_catalog.btrim(s.raw_diagnosis)) between 2 and 120
        and aureka_quality.nara_normalize_diagnosis(s.raw_diagnosis) is not null
        and s.raw_diagnosis !~ '[0-9]{6,}'
        and s.raw_diagnosis !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
        and s.raw_diagnosis !~* '^[0-9[:space:]+()./-]+$'
        and s.raw_diagnosis !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
        and s.raw_diagnosis !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
        and not exists (
          select 1 from aureka_quality.patient_index pi
          where pi.no_rm = s.internal_no_rm
            and lower(btrim(pi.nama_pasien)) = lower(btrim(s.raw_diagnosis))
        )
    ), mapped as (
      select s.id, s.internal_no_rm, s.diagnosis_label, s.diagnosis_key,
        d.diagnosis_label as canonical_label, d.icd10_code, d.icd10_title, d.mapping_status,
        case when d.mapping_status = 'validated' and d.icd10_code is not null
          then 'ICD10:' || d.icd10_code else 'TERM:' || s.diagnosis_key end as group_key
      from safe_rows s
      left join aureka_quality.nara_icd10_dictionary d on d.diagnosis_key = s.diagnosis_key
    ), grouped as (
      select group_key,
        case when pg_catalog.bool_or(mapping_status = 'validated')
          then coalesce(pg_catalog.max(canonical_label), pg_catalog.min(diagnosis_label))
          else pg_catalog.min(diagnosis_label) end as diagnosis,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_code) end as icd10_code,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_title) end as icd10_title,
        case when pg_catalog.bool_or(mapping_status = 'validated') then 'validated'
             when pg_catalog.bool_or(mapping_status = 'proposed') then 'proposed'
             when pg_catalog.bool_or(mapping_status = 'rejected') then 'rejected'
             else 'unmapped' end as coding_status,
        pg_catalog.count(*)::bigint as episodes,
        pg_catalog.count(distinct internal_no_rm)::bigint as patients,
        pg_catalog.count(*) filter (where internal_no_rm is null)::bigint as episodes_without_mrn
      from mapped group by group_key
    )
    select
      (select pg_catalog.count(distinct internal_no_rm) from source_rows),
      (select pg_catalog.count(*) from grouped),
      (select pg_catalog.count(*) from grouped where patients < 5),
      (select pg_catalog.count(*) from source_rows where internal_no_rm is null),
      coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'diagnosis', diagnosis,
        'icd10_code', icd10_code,
        'icd10_title', icd10_title,
        'coding_status', coding_status,
        'patient_count', patients,
        'episode_count', episodes
      ) order by patients desc, episodes desc, diagnosis)
      from (select * from grouped where patients >= 5 order by patients desc, episodes desc, diagnosis limit v_limit) top_rows), '[]'::jsonb)
    into v_patient_count, v_group_count, v_suppressed, v_missing_mrn, v_top;
  end if;

  if v_basis = 'no_clinical_data' then
    v_patient_count := 0;
    v_episode_count := 0;
  end if;

  insert into aureka_quality.nara_clinical_access_audit(
    user_id, role_code, data_year, room_scope, source_basis,
    patient_count, episode_count, diagnosis_group_count, suppressed_group_count
  ) values (
    auth.uid(), v_role, v_year, p_room, v_basis,
    v_patient_count, v_episode_count, v_group_count, v_suppressed
  );

  return pg_catalog.jsonb_build_object(
    'year', v_year,
    'source_basis', v_basis,
    'scope', case when p_room is null then 'Seluruh unit yang dapat diakses akun' else (select r.name from public.master_rooms r where r.id=p_room) end,
    'patient_count', v_patient_count,
    'patient_index_context', v_patient_index_context,
    'episode_count', v_episode_count,
    'episodes_without_mrn', v_episode_missing_mrn,
    'diagnosis_group_count', v_group_count,
    'suppressed_group_count', v_suppressed,
    'minimum_cell_size', 5,
    'top_diagnoses', v_top,
    'episode_context', v_episode_context,
    'icd10_release', 'WHO ICD-10 2019',
    'limitations', case
      when v_basis = 'patient_index_latest_diagnosis' then
        'Peringkat berdasarkan satu diagnosis terakhir per pasien pada Database Pasien. Kelengkapan diagnosis indeks pasien ditampilkan terpisah pada patient_index_context; baris tanpa diagnosis tidak diperlakukan sebagai tidak memiliki penyakit dan tidak masuk peringkat. Ini bukan seluruh riwayat diagnosis maupun jumlah kunjungan. Rekap episode Logbook dilaporkan terpisah pada episode_context dan tidak digabungkan dengan denominator pasien.'
      when v_basis = 'episode_records' then
        'Tidak ditemukan diagnosis terakhir yang memenuhi kriteria pada indeks pasien; peringkat menggunakan episode pasien Logbook. Jumlah pasien unik dan episode dilaporkan terpisah. Kode ICD-10 hanya ditampilkan jika telah divalidasi reviewer.'
      else
        'Belum ada diagnosis klinis yang dapat dianalisis pada periode dan cakupan unit ini.'
    end
  );
end;
$function$;

revoke all on function public.aureka_nara_clinical_summary(integer,bigint,integer) from public, anon;
grant execute on function public.aureka_nara_clinical_summary(integer,bigint,integer) to authenticated;


create index if not exists nara_icd10_dictionary_created_by_idx
  on aureka_quality.nara_icd10_dictionary(created_by) where created_by is not null;
create index if not exists nara_icd10_dictionary_updated_by_idx
  on aureka_quality.nara_icd10_dictionary(updated_by) where updated_by is not null;
create index if not exists nara_icd10_dictionary_validated_by_idx
  on aureka_quality.nara_icd10_dictionary(validated_by) where validated_by is not null;
