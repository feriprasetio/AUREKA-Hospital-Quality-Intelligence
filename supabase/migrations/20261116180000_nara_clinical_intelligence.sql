-- NARA Clinical Intelligence: aggregate-only clinical analytics with internal MRN linkage.
-- MRN is used only inside secured SQL for deduplication. It is never returned to clients or LLM providers.
-- ICD-10 assignments remain pending until a qualified reviewer validates the code against the stated release.

begin;

create table if not exists aureka_quality.nara_icd10_dictionary (
  diagnosis_key text primary key,
  diagnosis_label text not null,
  icd10_code text,
  icd10_title text,
  code_set text not null default 'WHO ICD-10 2019',
  mapping_status text not null default 'proposed'
    check (mapping_status in ('proposed','validated','rejected')),
  validation_reference text,
  review_note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (icd10_code is null or icd10_code ~ '^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$'),
  check (mapping_status <> 'validated' or
    (icd10_code is not null and nullif(trim(icd10_title),'') is not null
     and nullif(trim(validation_reference),'') is not null and validated_by is not null and validated_at is not null))
);

comment on table aureka_quality.nara_icd10_dictionary is
  'Controlled diagnosis terminology and human-reviewed ICD-10 mapping. Never stores patient identifiers or episode-level records.';
alter table aureka_quality.nara_icd10_dictionary enable row level security;
revoke all on aureka_quality.nara_icd10_dictionary from public, anon, authenticated;

create table if not exists aureka_quality.nara_clinical_access_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  role_code text not null,
  data_year integer not null,
  room_scope bigint,
  source_basis text not null check (source_basis in ('episode_records','patient_index_latest_diagnosis','no_clinical_data')),
  patient_count bigint not null default 0,
  episode_count bigint not null default 0,
  diagnosis_group_count integer not null default 0,
  suppressed_group_count integer not null default 0,
  accessed_at timestamptz not null default now()
);
comment on table aureka_quality.nara_clinical_access_audit is
  'PHI-free audit of aggregate clinical analytics requests. It intentionally excludes MRN, patient name, diagnosis labels, and episode identifiers.';
alter table aureka_quality.nara_clinical_access_audit enable row level security;
revoke all on aureka_quality.nara_clinical_access_audit from public, anon, authenticated;

create index if not exists nara_clinical_access_audit_user_time_idx
  on aureka_quality.nara_clinical_access_audit(user_id, accessed_at desc);
create index if not exists nara_icd10_dictionary_status_idx
  on aureka_quality.nara_icd10_dictionary(mapping_status, diagnosis_key);

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
  v_episode_count bigint := 0;
  v_patient_count bigint := 0;
  v_missing_mrn bigint := 0;
  v_group_count integer := 0;
  v_suppressed integer := 0;
  v_basis text := 'no_clinical_data';
  v_top jsonb := '[]'::jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit,10),10));
  v_quality_has_rows boolean := false;
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

  select exists (
    select 1 from aureka_quality.quality_records q
    where q.room_id = any(v_rooms)
      and q.measurement_grain = 'patient_episode'
      and q.archived_at is null and q.status <> 'archived'
      and coalesce(q.record_date, q.created_at::date) >= pg_catalog.make_date(v_year,1,1)
      and coalesce(q.record_date, q.created_at::date) < pg_catalog.make_date(v_year+1,1,1)
  ) into v_quality_has_rows;

  if v_quality_has_rows then
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
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(s.raw_diagnosis), '[[:space:]]+', ' ', 'g')) as diagnosis_label
      from source_rows s
      where s.raw_diagnosis is not null
        and pg_catalog.length(pg_catalog.btrim(s.raw_diagnosis)) between 2 and 120
        and s.raw_diagnosis !~ '[0-9]{6,}'
        and s.raw_diagnosis !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
        and s.raw_diagnosis !~* '^[0-9[:space:]+()./-]+$'
    ), mapped as (
      select s.id, s.internal_no_rm, s.diagnosis_label,
        d.diagnosis_label as canonical_label, d.icd10_code, d.icd10_title, d.mapping_status,
        case when d.mapping_status = 'validated' and d.icd10_code is not null
          then 'ICD10:' || d.icd10_code else 'RAW:' || pg_catalog.lower(s.diagnosis_label) end as group_key
      from safe_rows s
      left join aureka_quality.nara_icd10_dictionary d
        on d.diagnosis_key = pg_catalog.lower(s.diagnosis_label)
    ), grouped as (
      select group_key,
        case when pg_catalog.bool_or(mapping_status = 'validated')
          then pg_catalog.max(canonical_label) else pg_catalog.max(diagnosis_label) end as diagnosis,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_code) end as icd10_code,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_title) end as icd10_title,
        case when pg_catalog.bool_or(mapping_status = 'validated') then 'validated'
             when pg_catalog.bool_or(mapping_status = 'proposed') then 'proposed'
             when pg_catalog.bool_or(mapping_status = 'rejected') then 'rejected'
             else 'unmapped' end as coding_status,
        pg_catalog.count(*)::bigint as episodes,
        pg_catalog.count(distinct internal_no_rm)::bigint as patients,
        pg_catalog.count(*) filter (where internal_no_rm is null)::bigint as episodes_without_mrn
      from mapped
      group by group_key
    )
    select
      (select pg_catalog.count(*) from source_rows),
      (select pg_catalog.count(distinct internal_no_rm) from source_rows),
      (select pg_catalog.count(*) from source_rows where internal_no_rm is null),
      (select pg_catalog.count(*) from grouped),
      (select pg_catalog.count(*) from grouped where patients < 5),
      coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'diagnosis', diagnosis,
        'icd10_code', icd10_code,
        'icd10_title', icd10_title,
        'coding_status', coding_status,
        'patient_count', patients,
        'episode_count', episodes,
        'episodes_without_mrn', episodes_without_mrn
      ) order by patients desc, episodes desc, diagnosis)
      from (select * from grouped where patients >= 5 order by patients desc, episodes desc limit v_limit) top_rows), '[]'::jsonb)
    into v_episode_count, v_patient_count, v_missing_mrn, v_group_count, v_suppressed, v_top;

  else
    -- Current production fallback: patient_index stores one latest diagnosis per unique MRN,
    -- not encounter-level history. The MRN is used only for distinct counts and never returned.
    v_basis := 'patient_index_latest_diagnosis';
    with patient_rows as (
      select p.no_rm as internal_no_rm,
        upper(pg_catalog.regexp_replace(pg_catalog.btrim(p.diagnosis_terakhir), '[[:space:]]+', ' ', 'g')) as diagnosis_label
      from aureka_quality.patient_index p
      join public.master_rooms r on r.name = p.unit_terakhir
      where r.id = any(v_rooms)
        and p.last_seen >= pg_catalog.make_date(v_year,1,1)
        and p.last_seen < pg_catalog.make_date(v_year+1,1,1)
        and nullif(pg_catalog.btrim(p.diagnosis_terakhir),'') is not null
        and pg_catalog.length(pg_catalog.btrim(p.diagnosis_terakhir)) between 2 and 120
        and p.diagnosis_terakhir !~ '[0-9]{6,}'
        and p.diagnosis_terakhir !~* '(NIK|NO[. ]*RM|NOMOR REKAM MEDIS|MRN|TELP|TELEPON|EMAIL)[[:space:]:#=-]'
        and p.diagnosis_terakhir !~* '^[0-9[:space:]+()./-]+$'
    ), mapped as (
      select s.internal_no_rm, s.diagnosis_label,
        d.diagnosis_label as canonical_label, d.icd10_code, d.icd10_title, d.mapping_status,
        case when d.mapping_status = 'validated' and d.icd10_code is not null
          then 'ICD10:' || d.icd10_code else 'RAW:' || pg_catalog.lower(s.diagnosis_label) end as group_key
      from patient_rows s
      left join aureka_quality.nara_icd10_dictionary d
        on d.diagnosis_key = pg_catalog.lower(s.diagnosis_label)
    ), grouped as (
      select group_key,
        case when pg_catalog.bool_or(mapping_status = 'validated')
          then pg_catalog.max(canonical_label) else pg_catalog.max(diagnosis_label) end as diagnosis,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_code) end as icd10_code,
        case when pg_catalog.bool_or(mapping_status = 'validated') then pg_catalog.max(icd10_title) end as icd10_title,
        case when pg_catalog.bool_or(mapping_status = 'validated') then 'validated'
             when pg_catalog.bool_or(mapping_status = 'proposed') then 'proposed'
             when pg_catalog.bool_or(mapping_status = 'rejected') then 'rejected'
             else 'unmapped' end as coding_status,
        pg_catalog.count(*)::bigint as patients
      from mapped group by group_key
    )
    select
      (select pg_catalog.count(*) from patient_rows),
      (select pg_catalog.count(distinct internal_no_rm) from patient_rows),
      0::bigint,
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
      from (select * from grouped where patients >= 5 order by patients desc limit v_limit) top_rows), '[]'::jsonb)
    into v_patient_count, v_episode_count, v_missing_mrn, v_group_count, v_suppressed, v_top;
    -- In this fallback the source rows represent unique patients, not encounter episodes.
    v_patient_count := v_episode_count;
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
    'episodes_without_mrn', v_missing_mrn,
    'diagnosis_group_count', v_group_count,
    'suppressed_group_count', v_suppressed,
    'minimum_cell_size', 5,
    'top_diagnoses', v_top,
    'icd10_release', 'WHO ICD-10 2019',
    'limitations', case
      when v_basis = 'patient_index_latest_diagnosis' then
        'Fallback berdasarkan satu diagnosis terakhir per pasien pada Database Pasien. Bukan riwayat diagnosis per episode, tidak merepresentasikan seluruh DPJP, dan tidak dapat digunakan sebagai klaim 10 penyakit terbanyak seluruh kunjungan. Jumlah adalah pasien unik.'
      when v_basis = 'episode_records' then
        'Berdasarkan episode pasien yang tersimpan pada Form Logbook. Kode ICD-10 hanya ditampilkan jika telah divalidasi reviewer; diagnosis tanpa MRN tidak digunakan untuk hitungan pasien unik.'
      else
        'Belum ada data episode klinis atau diagnosis terakhir yang dapat diakses pada periode ini.'
    end
  );
end;
$function$;

revoke all on function public.aureka_nara_clinical_summary(integer,bigint,integer) from public, anon;
grant execute on function public.aureka_nara_clinical_summary(integer,bigint,integer) to authenticated;

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
  v_key text := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_diagnosis,'')), '[[:space:]]+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode = '28000'; end if;
  if v_role not in ('ADMIN','PMKP') then raise exception 'Hanya Super Admin atau Komite PMKP yang dapat mengelola pemetaan ICD-10.' using errcode = '42501'; end if;
  if pg_catalog.length(v_key) < 2 or pg_catalog.length(v_key) > 120 then raise exception 'Istilah diagnosis tidak valid.' using errcode = '22023'; end if;
  if p_status not in ('proposed','validated','rejected') then raise exception 'Status pemetaan tidak valid.' using errcode = '22023'; end if;
  if p_status = 'validated' and (
    coalesce(p_icd10_code,'') !~ '^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$'
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

commit;
