-- Extend the existing AUREKA education domain for Orientasi Mahasiswa.
-- Student identity is sourced from Tim Koordinasi Pendidikan quality records (room 30).
-- This reuses education_events, education_participants and education_certificates.

alter table aureka_system.education_participants
  add column if not exists participant_role text not null default 'Peserta',
  add column if not exists activity_name text not null default 'Orientasi Mahasiswa',
  add column if not exists period_label text not null default '',
  add column if not exists signed_date date,
  add column if not exists materials text[] not null default array[]::text[],
  add column if not exists orientation_notes text not null default '';

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'aureka_system.education_participants'::regclass
      and conname = 'education_participants_event_source_quality_record_key'
  ) then
    alter table aureka_system.education_participants
      add constraint education_participants_event_source_quality_record_key
      unique (event_id, source_quality_record_id);
  end if;
end;
$block$;

create index if not exists education_participants_source_quality_record_idx
  on aureka_system.education_participants(source_quality_record_id)
  where source_quality_record_id is not null;

-- Keep source identity and academic attributes anchored to the source logbook row.
create or replace function aureka_system.sync_student_orientation_participant_source()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'aureka_system', 'aureka_quality'
as $function$
declare
  v_source aureka_quality.quality_records%rowtype;
  v_event aureka_system.education_events%rowtype;
  v_form jsonb;
  v_name text;
begin
  select * into v_event
    from aureka_system.education_events
   where id = new.event_id;
  if not found or v_event.event_type <> 'orientasi_mahasiswa' or v_event.room_id <> 30 then
    return new;
  end if;

  if new.participant_type <> 'student' then
    if new.source_quality_record_id is not null then
      raise exception 'Narasumber dan peserta non-mahasiswa tidak boleh menggunakan sumber logbook mahasiswa.'
        using errcode = '22023';
    end if;
    if new.participant_role not in ('Peserta', 'Narasumber', 'Sumpah Rekam Medik') then
      raise exception 'Peran orientasi tidak valid.' using errcode = '22023';
    end if;
    if cardinality(new.materials) > 7 or length(new.orientation_notes) > 1000 then
      raise exception 'Jumlah materi atau panjang catatan orientasi melebihi batas.' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.source_quality_record_id is null then
    raise exception 'Peserta mahasiswa wajib ditautkan ke laporan Tim Koordinasi Pendidikan.'
      using errcode = '23503';
  end if;
  if new.participant_role not in ('Peserta', 'Narasumber', 'Sumpah Rekam Medik') then
    raise exception 'Peran orientasi tidak valid.' using errcode = '22023';
  end if;
  if cardinality(new.materials) > 7 or length(new.orientation_notes) > 1000 then
    raise exception 'Jumlah materi atau panjang catatan orientasi melebihi batas.' using errcode = '22023';
  end if;

  select * into v_source
    from aureka_quality.quality_records
   where id = new.source_quality_record_id;
  if not found
     or v_source.room_id <> 30
     or v_source.measurement_grain <> 'activity'
     or v_source.profile_year <> extract(year from v_event.start_at)::integer
     or v_source.status = 'archived'
     or v_source.archived_at is not null then
    raise exception 'Sumber mahasiswa harus berasal dari logbook aktif Tim Koordinasi Pendidikan pada tahun kegiatan.'
      using errcode = '23503';
  end if;

  v_form := coalesce(v_source.core_data->'form_fields', v_source.core_data->'form_data', '{}'::jsonb);
  v_name := nullif(trim(v_form->>'Nama Mahasiswa'), '');
  if v_name is null then
    raise exception 'Nama mahasiswa pada laporan indikator mutu belum tersedia.'
      using errcode = '22023';
  end if;

  new.full_name := v_name;
  new.institution := coalesce(nullif(trim(v_form->>'Kampus'), ''), '');
  new.profession_or_program := coalesce(
    nullif(trim(v_form->>'Profesi/Prodi'), ''),
    nullif(trim(v_form->>'Profesi'), ''),
    nullif(trim(v_form->>'Prodi'), ''),
    ''
  );
  new.room_id := 30;
  new.participant_code := coalesce(nullif(trim(new.participant_code), ''), new.source_quality_record_id::text);
  new.participant_role := coalesce(nullif(trim(new.participant_role), ''), 'Peserta');
  new.activity_name := coalesce(nullif(trim(new.activity_name), ''), v_event.title, 'Orientasi Mahasiswa');
  new.period_label := coalesce(
    nullif(trim(new.period_label), ''),
    concat_ws(' s.d. ',
      nullif(v_form->>'Tanggal Mulai Praktek', ''),
      nullif(v_form->>'Tanggal Selesai Praktek', '')
    )
  );

  return new;
end;
$function$;

drop trigger if exists education_student_orientation_source_sync
  on aureka_system.education_participants;
create trigger education_student_orientation_source_sync
  before insert or update of source_quality_record_id, event_id, participant_type, full_name, institution, profession_or_program
  on aureka_system.education_participants
  for each row execute function aureka_system.sync_student_orientation_participant_source();

-- Certificate counters are private; a SECURITY DEFINER RPC is the only write path.
create table if not exists aureka_system.education_certificate_counters (
  certificate_year integer primary key check (certificate_year between 2000 and 2200),
  last_number integer not null check (last_number > 0)
);
alter table aureka_system.education_certificate_counters enable row level security;
revoke all on aureka_system.education_certificate_counters from public, anon, authenticated;

create or replace function aureka_system.reserve_student_orientation_certificate(
  p_event_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'aureka_system', 'auth'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_event aureka_system.education_events%rowtype;
  v_participant aureka_system.education_participants%rowtype;
  v_source aureka_quality.quality_records%rowtype;
  v_certificate aureka_system.education_certificates%rowtype;
  v_form jsonb;
  v_year integer;
  v_number integer;
  v_certificate_number text;
begin
  if v_user_id is null or not aureka_system.can_manage_education()
     or not aureka_system.can_access_room_or_global(30) then
    raise exception 'Role tidak memiliki kewenangan menerbitkan sertifikat Orientasi Mahasiswa.'
      using errcode = '42501';
  end if;

  select * into v_event
    from aureka_system.education_events
   where id = p_event_id
     and event_type = 'orientasi_mahasiswa'
     and room_id = 30
     and status in ('published', 'ongoing', 'completed');
  if not found then
    raise exception 'Kegiatan Orientasi Mahasiswa tidak ditemukan atau belum dipublikasikan.'
      using errcode = 'P0002';
  end if;

  select * into v_participant
    from aureka_system.education_participants
   where id = p_participant_id
     and event_id = p_event_id
     and participant_type = 'student'
     and source_quality_record_id is not null
   for update;
  if not found then
    raise exception 'Peserta belum tertaut ke laporan Tim Koordinasi Pendidikan.'
      using errcode = 'P0002';
  end if;
  select * into v_source
    from aureka_quality.quality_records
   where id = v_participant.source_quality_record_id
     and room_id = 30
     and measurement_grain = 'activity'
     and profile_year = extract(year from v_event.start_at)::integer
     and status <> 'archived'
     and archived_at is null;
  if not found then
    raise exception 'Rekam sumber Tim Koordinasi Pendidikan sudah tidak aktif atau tidak sesuai tahun kegiatan.'
      using errcode = '23503';
  end if;
  v_form := coalesce(v_source.core_data->'form_fields', v_source.core_data->'form_data', '{}'::jsonb);
  if nullif(trim(v_form->>'Nama Mahasiswa'), '') is null then
    raise exception 'Nama mahasiswa pada laporan sumber belum tersedia.'
      using errcode = '22023';
  end if;

  if v_participant.signed_date is null or cardinality(v_participant.materials) < 1
     or nullif(trim(v_participant.activity_name), '') is null
     or nullif(trim(v_participant.period_label), '') is null then
    raise exception 'Tanggal tanda tangan, kegiatan, periode, dan minimal satu materi wajib dilengkapi.'
      using errcode = '22023';
  end if;

  select * into v_certificate
    from aureka_system.education_certificates
   where event_id = p_event_id
     and participant_id = p_participant_id
     and revoked_at is null
   for update;
  if found then
    return jsonb_build_object(
      'id', v_certificate.id,
      'certificate_number', v_certificate.certificate_number,
      'verification_code', v_certificate.verification_code,
      'issue_date', v_certificate.issue_date,
      'object_path', v_certificate.object_path,
      'file_sha256', v_certificate.file_sha256
    );
  end if;

  v_year := extract(year from v_participant.signed_date)::integer;
  insert into aureka_system.education_certificate_counters(certificate_year, last_number)
  values (v_year, 1)
  on conflict (certificate_year)
  do update set last_number = aureka_system.education_certificate_counters.last_number + 1
  returning last_number into v_number;

  v_certificate_number := 'OM/' || v_year::text || '/' || lpad(v_number::text, 4, '0');
  insert into aureka_system.education_certificates(
    event_id, participant_id, certificate_number, issue_date, competency_result, issued_by
  )
  values (
    p_event_id, p_participant_id, v_certificate_number, v_participant.signed_date,
    'Orientasi Mahasiswa', v_user_id
  )
  returning * into v_certificate;

  return jsonb_build_object(
    'id', v_certificate.id,
    'certificate_number', v_certificate.certificate_number,
    'verification_code', v_certificate.verification_code,
    'issue_date', v_certificate.issue_date,
    'object_path', v_certificate.object_path,
    'file_sha256', v_certificate.file_sha256
  );
end;
$function$;

create or replace function aureka_system.complete_student_orientation_certificate(
  p_certificate_id uuid,
  p_object_path text,
  p_file_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'aureka_system', 'auth'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_certificate aureka_system.education_certificates%rowtype;
begin
  if v_user_id is null or not aureka_system.can_manage_education()
     or not aureka_system.can_access_room_or_global(30) then
    raise exception 'Role tidak memiliki kewenangan menyelesaikan sertifikat Orientasi Mahasiswa.'
      using errcode = '42501';
  end if;
  if nullif(trim(p_object_path), '') is null
     or split_part(p_object_path, '/', 1) <> v_user_id::text
     or p_object_path !~* '\.pdf$'
     or coalesce(p_file_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Lokasi atau SHA-256 PDF tidak valid.'
      using errcode = '22023';
  end if;

  select * into v_certificate
    from aureka_system.education_certificates
   where id = p_certificate_id
     and issued_by = v_user_id
     and revoked_at is null
   for update;
  if not found then
    raise exception 'Reservasi sertifikat tidak ditemukan atau bukan milik penerbit.'
      using errcode = 'P0002';
  end if;

  update aureka_system.education_certificates
     set bucket_id = 'aureka-exports',
         object_path = p_object_path,
         file_sha256 = p_file_sha256
   where id = v_certificate.id;

  return jsonb_build_object(
    'id', v_certificate.id,
    'certificate_number', v_certificate.certificate_number,
    'verification_code', v_certificate.verification_code,
    'object_path', p_object_path,
    'file_sha256', p_file_sha256
  );
end;
$function$;

revoke all on function aureka_system.reserve_student_orientation_certificate(uuid, uuid) from public, anon;
revoke all on function aureka_system.complete_student_orientation_certificate(uuid, text, text) from public, anon;
grant execute on function aureka_system.reserve_student_orientation_certificate(uuid, uuid) to authenticated;
grant execute on function aureka_system.complete_student_orientation_certificate(uuid, text, text) to authenticated;

comment on column aureka_system.education_participants.source_quality_record_id
is 'Links student orientation participants directly to the Tim Koordinasi Pendidikan quality logbook source.';
comment on table aureka_system.education_certificate_counters
is 'Private annual sequence allocator for student orientation certificate numbers.';
comment on function aureka_system.reserve_student_orientation_certificate(uuid, uuid)
is 'Reserves an annual student orientation certificate number in the existing education certificate domain.';
comment on function aureka_system.complete_student_orientation_certificate(uuid, text, text)
is 'Stores an owner-scoped private PDF path and SHA-256 for a reserved student orientation certificate.';

notify pgrst, 'reload schema';
