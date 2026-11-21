-- Student orientation workspace: source names stay in Tim Koordinasi Pendidikan quality logbooks.
-- One orientation metadata row is linked to one source quality record; no student directory is duplicated.

create table if not exists aureka_quality.student_orientation_records (
  id uuid primary key default gen_random_uuid(),
  source_quality_record_id uuid not null unique
    references aureka_quality.quality_records(id) on delete restrict,
  profile_year smallint not null check (profile_year between 2000 and 2200),
  role_type text not null default 'Peserta'
    check (role_type in ('Peserta', 'Narasumber', 'Sumpah Rekam Medik')),
  activity_name text not null default 'Orientasi Mahasiswa'
    check (length(trim(activity_name)) between 1 and 240),
  period_label text not null default ''
    check (length(period_label) <= 160),
  signed_date date,
  materials text[] not null default array[]::text[]
    check (cardinality(materials) <= 7),
  notes text not null default ''
    check (length(notes) <= 1000),
  certificate_number text unique,
  certificate_issued_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_orientation_records_year_idx
  on aureka_quality.student_orientation_records(profile_year, created_at desc);

alter table aureka_quality.student_orientation_records enable row level security;
grant usage on schema aureka_quality to authenticated;
grant select on aureka_quality.student_orientation_records to authenticated;
grant insert (source_quality_record_id, profile_year, role_type, activity_name, period_label, signed_date, materials, notes, updated_by)
  on aureka_quality.student_orientation_records to authenticated;
grant update (source_quality_record_id, profile_year, role_type, activity_name, period_label, signed_date, materials, notes, updated_by)
  on aureka_quality.student_orientation_records to authenticated;
revoke delete on aureka_quality.student_orientation_records from authenticated, anon;

drop policy if exists student_orientation_read_governed
  on aureka_quality.student_orientation_records;
create policy student_orientation_read_governed
  on aureka_quality.student_orientation_records
  for select to authenticated
  using (
    aureka_system.current_role_code() in ('ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR')
    or (
      aureka_system.current_role_code() = 'PIC'
      and aureka_system.has_quality_room_access(30)
    )
  );

drop policy if exists student_orientation_insert_governed
  on aureka_quality.student_orientation_records;
create policy student_orientation_insert_governed
  on aureka_quality.student_orientation_records
  for insert to authenticated
  with check (
    (
      aureka_system.current_role_code() in ('ADMIN', 'PMKP')
      or (
        aureka_system.current_role_code() = 'PIC'
        and aureka_system.has_quality_room_access(30)
      )
    )
    and student_orientation_records.created_by is not distinct from auth.uid()
    and student_orientation_records.updated_by is not distinct from auth.uid()
    and exists (
      select 1
      from aureka_quality.quality_records source
      where source.id = student_orientation_records.source_quality_record_id
        and source.room_id = 30
        and source.profile_year = student_orientation_records.profile_year
        and source.measurement_grain = 'activity'
        and source.status <> 'archived'
        and source.archived_at is null
        and nullif(trim(coalesce(
          source.core_data->'form_fields'->>'Nama Mahasiswa',
          source.core_data->'form_data'->>'Nama Mahasiswa'
        )), '') is not null
    )
  );

drop policy if exists student_orientation_update_governed
  on aureka_quality.student_orientation_records;
create policy student_orientation_update_governed
  on aureka_quality.student_orientation_records
  for update to authenticated
  using (
    aureka_system.current_role_code() in ('ADMIN', 'PMKP')
    or (
      aureka_system.current_role_code() = 'PIC'
      and aureka_system.has_quality_room_access(30)
    )
  )
  with check (
    (
      aureka_system.current_role_code() in ('ADMIN', 'PMKP')
      or (
        aureka_system.current_role_code() = 'PIC'
        and aureka_system.has_quality_room_access(30)
      )
    )
    and student_orientation_records.updated_by is not distinct from auth.uid()
    and exists (
      select 1
      from aureka_quality.quality_records source
      where source.id = student_orientation_records.source_quality_record_id
        and source.room_id = 30
        and source.profile_year = student_orientation_records.profile_year
        and source.measurement_grain = 'activity'
        and source.status <> 'archived'
        and source.archived_at is null
        and nullif(trim(coalesce(
          source.core_data->'form_fields'->>'Nama Mahasiswa',
          source.core_data->'form_data'->>'Nama Mahasiswa'
        )), '') is not null
    )
  );

create table if not exists aureka_quality.student_orientation_certificate_counters (
  certificate_year integer primary key check (certificate_year between 2000 and 2200),
  last_number integer not null check (last_number > 0)
);
alter table aureka_quality.student_orientation_certificate_counters enable row level security;
revoke all on aureka_quality.student_orientation_certificate_counters from public, anon, authenticated;

create or replace function aureka_quality.set_student_orientation_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$function$;

drop trigger if exists student_orientation_updated_at
  on aureka_quality.student_orientation_records;
create trigger student_orientation_updated_at
  before update on aureka_quality.student_orientation_records
  for each row execute function aureka_quality.set_student_orientation_updated_at();


create or replace function aureka_quality.guard_student_orientation_source()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.source_quality_record_id is distinct from old.source_quality_record_id
     or new.profile_year is distinct from old.profile_year then
    raise exception 'Referensi sumber dan tahun laporan orientasi bersifat tetap.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists student_orientation_source_immutable
  on aureka_quality.student_orientation_records;
create trigger student_orientation_source_immutable
  before update on aureka_quality.student_orientation_records
  for each row execute function aureka_quality.guard_student_orientation_source();

create or replace function aureka_quality.issue_student_orientation_certificate(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_record aureka_quality.student_orientation_records%rowtype;
  v_source aureka_quality.quality_records%rowtype;
  v_student_name text;
  v_year integer;
  v_sequence integer;
  v_certificate_number text;
  v_issued_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan untuk menerbitkan sertifikat orientasi.'
      using errcode = '28000';
  end if;
  if not (
    v_role in ('ADMIN', 'PMKP')
    or (v_role = 'PIC' and aureka_system.has_quality_room_access(30))
  ) then
    raise exception 'Role tidak memiliki kewenangan menerbitkan sertifikat orientasi.'
      using errcode = '42501';
  end if;

  select * into v_record
    from aureka_quality.student_orientation_records
   where id = p_record_id
   for update;
  if not found then
    raise exception 'Data orientasi tidak ditemukan.'
      using errcode = 'P0002';
  end if;

  if v_record.certificate_number is not null then
    return jsonb_build_object(
      'id', v_record.id,
      'certificate_number', v_record.certificate_number,
      'certificate_issued_at', v_record.certificate_issued_at
    );
  end if;

  select * into v_source
    from aureka_quality.quality_records
   where id = v_record.source_quality_record_id;
  if not found
     or v_source.room_id <> 30
     or v_source.profile_year <> v_record.profile_year
     or v_source.measurement_grain <> 'activity'
     or v_source.status = 'archived'
     or v_source.archived_at is not null then
    raise exception 'Rekam sumber Tim Koordinasi Pendidikan tidak aktif atau tidak sesuai.'
      using errcode = '23503';
  end if;

  v_student_name := nullif(trim(coalesce(
    v_source.core_data->'form_fields'->>'Nama Mahasiswa',
    v_source.core_data->'form_data'->>'Nama Mahasiswa'
  )), '');
  if v_student_name is null then
    raise exception 'Nama mahasiswa pada laporan sumber belum tersedia.'
      using errcode = '22023';
  end if;
  if nullif(trim(v_record.activity_name), '') is null
     or nullif(trim(v_record.period_label), '') is null
     or v_record.signed_date is null
     or cardinality(v_record.materials) < 1 then
    raise exception 'Kegiatan, periode, tanggal tanda tangan, dan minimal satu materi wajib dilengkapi.'
      using errcode = '22023';
  end if;

  v_year := extract(year from v_record.signed_date)::integer;
  insert into aureka_quality.student_orientation_certificate_counters(certificate_year, last_number)
  values (v_year, 1)
  on conflict (certificate_year)
  do update set last_number = aureka_quality.student_orientation_certificate_counters.last_number + 1
  returning last_number into v_sequence;

  v_certificate_number := 'OM/' || v_year::text || '/' || lpad(v_sequence::text, 4, '0');
  v_issued_at := clock_timestamp();

  update aureka_quality.student_orientation_records
     set certificate_number = v_certificate_number,
         certificate_issued_at = v_issued_at,
         updated_by = v_user_id,
         updated_at = v_issued_at
   where id = v_record.id;

  return jsonb_build_object(
    'id', v_record.id,
    'certificate_number', v_certificate_number,
    'certificate_issued_at', v_issued_at
  );
end;
$function$;

revoke all on function aureka_quality.issue_student_orientation_certificate(uuid) from public, anon;
grant execute on function aureka_quality.issue_student_orientation_certificate(uuid) to authenticated;

comment on table aureka_quality.student_orientation_records
is 'Operational orientation metadata linked one-to-one to Tim Koordinasi Pendidikan quality logbook records. Student names remain sourced from quality_records.';
comment on function aureka_quality.issue_student_orientation_certificate(uuid)
is 'Idempotently allocates an annual certificate number after validating the live Tim Koordinasi Pendidikan source record and required orientation metadata.';
