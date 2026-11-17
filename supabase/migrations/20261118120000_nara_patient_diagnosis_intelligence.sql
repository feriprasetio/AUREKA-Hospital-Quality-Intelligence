-- NARA diagnosis intelligence: use the broader patient index for patient-level ranking,
-- retain episode data as a separate denominator, normalize punctuation/case, and keep ICD-10 review governed.

create or replace function aureka_quality.nara_normalize_diagnosis(p_label text)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select nullif(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(pg_catalog.lower(p_label), '[^[:alnum:]]+', ' ', 'g')
    ),
    ''
  );
$function$;

revoke all on function aureka_quality.nara_normalize_diagnosis(text) from public, anon;
grant execute on function aureka_quality.nara_normalize_diagnosis(text) to authenticated;

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
        'Peringkat berdasarkan satu diagnosis terakhir per pasien pada Database Pasien. Ini bukan seluruh riwayat diagnosis maupun jumlah kunjungan. Rekap episode Logbook dilaporkan terpisah pada episode_context dan tidak digabungkan dengan denominator pasien.'
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

create or replace function public.aureka_nara_icd10_review_queue(
  p_year integer default null,
  p_room bigint default null,
  p_limit integer default 100
)
returns table (
  diagnosis text,
  patient_count bigint,
  mapping_status text,
  icd10_code text,
  icd10_title text,
  validation_reference text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := aureka_system.current_role_code();
  v_year integer := coalesce(p_year, extract(year from (pg_catalog.now() at time zone 'Asia/Pontianak'))::integer);
  v_rooms bigint[];
  v_has_patient_diagnoses boolean := false;
  v_rows integer := 0;
  v_basis text := 'no_clinical_data';
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode = '28000'; end if;
  if v_role not in ('ADMIN','PMKP') then raise exception 'Antrian koding hanya tersedia untuk Super Admin dan Komite PMKP.' using errcode = '42501'; end if;
  if v_year < 2000 or v_year > 2100 then raise exception 'Tahun analisis tidak valid.' using errcode = '22023'; end if;
  if p_room is not null and not aureka_system.has_quality_room_access(p_room) then
    raise exception 'Akses unit tidak diberikan.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.array_agg(r.id), '{}'::bigint[]) into v_rooms
  from public.master_rooms r
  where r.is_active = true and aureka_system.has_quality_room_access(r.id)
    and (p_room is null or r.id = p_room);

  if coalesce(pg_catalog.cardinality(v_rooms),0) = 0 then
    raise exception 'Tidak ada unit yang dapat diakses untuk antrian koding.' using errcode = '42501';
  end if;

  select exists (
    select 1
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
  ) into v_has_patient_diagnoses;

  if v_has_patient_diagnoses then
    v_basis := 'patient_index_latest_diagnosis';
    return query
    with src as (
      select p.no_rm as internal_no_rm,
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(p.diagnosis_terakhir), '[[:space:]]+', ' ', 'g')) as label,
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
    ), grouped as (
      select diagnosis_key, pg_catalog.min(label) as label,
        pg_catalog.count(distinct internal_no_rm)::bigint as n
      from src
      where diagnosis_key is not null
      group by diagnosis_key
      having pg_catalog.count(distinct internal_no_rm) >= 5
    )
    select g.label, g.n, coalesce(d.mapping_status,'unmapped'), d.icd10_code, d.icd10_title, d.validation_reference
    from grouped g
    left join aureka_quality.nara_icd10_dictionary d on d.diagnosis_key = g.diagnosis_key
    where coalesce(d.mapping_status,'unmapped') <> 'validated'
    order by g.n desc, g.label
    limit greatest(1,least(coalesce(p_limit,100),200));
  else
    v_basis := 'episode_records';
    return query
    with src as (
      select
        aureka_quality.normalize_no_rm(coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'medical_record_no'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. Rekam Medis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'No. RM'),'')
        )) as internal_no_rm,
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'diagnosis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Tegak'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa IGD'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Primer'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Utama'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Operasi'),'')
        )), '[[:space:]]+', ' ', 'g')) as label,
        aureka_quality.nara_normalize_diagnosis(coalesce(
          nullif(pg_catalog.btrim(q.core_data->>'diagnosis'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Tegak'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa IGD'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Primer'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Utama'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa'),''),
          nullif(pg_catalog.btrim(coalesce(q.core_data->'form_fields',q.core_data->'form_data','{}'::jsonb)->>'Diagnosa Operasi'),'')
        )) as diagnosis_key,
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
      where q.room_id = any(v_rooms) and q.measurement_grain='patient_episode'
        and q.archived_at is null and q.status <> 'archived'
        and coalesce(q.record_date,q.created_at::date) >= pg_catalog.make_date(v_year,1,1)
        and coalesce(q.record_date,q.created_at::date) < pg_catalog.make_date(v_year+1,1,1)
    ), safe_src as (
      select * from src
      where raw_diagnosis is not null
        and pg_catalog.length(label) between 2 and 120
        and diagnosis_key is not null
        and raw_diagnosis !~ '[0-9]{6,}'
        and raw_diagnosis !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
        and raw_diagnosis !~* '^[0-9[:space:]+()./-]+$'
        and raw_diagnosis !~* '(^|[^[:alpha:]])(TN|NY|NN|N|BP|BAPAK|IBU)[.[:space:]]'
        and raw_diagnosis !~* '(NAMA PASIEN|ATAS NAMA|PASIEN BERNAMA)'
        and not exists (
          select 1 from aureka_quality.patient_index pi
          where pi.no_rm = src.internal_no_rm
            and lower(btrim(pi.nama_pasien)) = lower(btrim(src.raw_diagnosis))
        )
    ), grouped as (
      select diagnosis_key, pg_catalog.min(label) as label,
        pg_catalog.count(distinct internal_no_rm)::bigint as n
      from safe_src
      group by diagnosis_key
      having pg_catalog.count(distinct internal_no_rm) >= 5
    )
    select g.label, g.n, coalesce(d.mapping_status,'unmapped'), d.icd10_code, d.icd10_title, d.validation_reference
    from grouped g
    left join aureka_quality.nara_icd10_dictionary d on d.diagnosis_key = g.diagnosis_key
    where coalesce(d.mapping_status,'unmapped') <> 'validated'
    order by g.n desc, g.label
    limit greatest(1,least(coalesce(p_limit,100),200));
  end if;

  get diagnostics v_rows = row_count;
  insert into aureka_quality.nara_clinical_access_audit(
    user_id, role_code, data_year, room_scope, source_basis,
    patient_count, episode_count, diagnosis_group_count, suppressed_group_count
  ) values (
    auth.uid(), v_role, v_year, p_room, v_basis,
    0, 0, v_rows, 0
  );
  return;
end;
$function$;

revoke all on function public.aureka_nara_icd10_review_queue(integer,bigint,integer) from public, anon;
grant execute on function public.aureka_nara_icd10_review_queue(integer,bigint,integer) to authenticated;

create or replace function public.aureka_nara_icd10_upsert_mapping(
  p_diagnosis text,
  p_icd10_code text,
  p_icd10_title text,
  p_status text default 'proposed',
  p_validation_reference text default null,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := aureka_system.current_role_code();
  v_key text := aureka_quality.nara_normalize_diagnosis(coalesce(p_diagnosis,''));
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode = '28000'; end if;
  if v_role not in ('ADMIN','PMKP') then raise exception 'Hanya Super Admin atau Komite PMKP yang dapat mengelola pemetaan ICD-10.' using errcode = '42501'; end if;
  if v_key is null or pg_catalog.length(v_key) < 2 or pg_catalog.length(v_key) > 120 then raise exception 'Istilah diagnosis tidak valid.' using errcode = '22023'; end if;
  if p_status not in ('proposed','validated','rejected') then raise exception 'Status pemetaan tidak valid.' using errcode = '22023'; end if;
  if p_status = 'validated' and (
    coalesce(p_icd10_code,'') !~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'
    or nullif(pg_catalog.btrim(coalesce(p_icd10_title,'')),'') is null
    or nullif(pg_catalog.btrim(coalesce(p_validation_reference,'')),'') is null
  ) then raise exception 'Pemetaan tervalidasi wajib memiliki kode, judul, dan referensi validasi.' using errcode = '22023'; end if;

  insert into aureka_quality.nara_icd10_dictionary(
    diagnosis_key, diagnosis_label, icd10_code, icd10_title, code_set, mapping_status,
    validation_reference, review_note, created_by, updated_by, validated_by, validated_at
  ) values (
    v_key, pg_catalog.upper(pg_catalog.btrim(p_diagnosis)), nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_icd10_code,''))), ''),
    nullif(pg_catalog.btrim(coalesce(p_icd10_title,'')), ''), 'WHO ICD-10 2019', p_status,
    nullif(pg_catalog.btrim(coalesce(p_validation_reference,'')), ''), nullif(pg_catalog.btrim(coalesce(p_review_note,'')), ''),
    auth.uid(), auth.uid(), case when p_status='validated' then auth.uid() end, case when p_status='validated' then pg_catalog.now() end
  )
  on conflict (diagnosis_key) do update set
    diagnosis_label=excluded.diagnosis_label,
    icd10_code=excluded.icd10_code,
    icd10_title=excluded.icd10_title,
    mapping_status=excluded.mapping_status,
    validation_reference=excluded.validation_reference,
    review_note=excluded.review_note,
    updated_by=auth.uid(),
    updated_at=pg_catalog.now(),
    validated_by=case when excluded.mapping_status='validated' then auth.uid() else null end,
    validated_at=case when excluded.mapping_status='validated' then pg_catalog.now() else null end;

  return pg_catalog.jsonb_build_object('diagnosis_key',v_key,'status',p_status,'updated',true);
end;
$function$;

revoke all on function public.aureka_nara_icd10_upsert_mapping(text,text,text,text,text,text) from public, anon;
grant execute on function public.aureka_nara_icd10_upsert_mapping(text,text,text,text,text,text) to authenticated;
