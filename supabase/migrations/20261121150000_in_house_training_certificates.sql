-- In House Training operations reuse the existing education domain and certificate counters.
-- No duplicate participant or certificate tables are created.

create or replace function aureka_system.reserve_in_house_training_certificate(
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
  v_certificate aureka_system.education_certificates%rowtype;
  v_year integer;
  v_number integer;
  v_certificate_number text;
begin
  if v_user_id is null or not aureka_system.can_manage_education() then
    raise exception 'Role tidak memiliki kewenangan menerbitkan sertifikat In House Training.'
      using errcode = '42501';
  end if;

  select * into v_event
    from aureka_system.education_events
   where id = p_event_id
     and event_type = 'in_house_training'
     and status in ('published', 'ongoing', 'completed');
  if not found or not aureka_system.can_access_room_or_global(v_event.room_id) then
    raise exception 'Kegiatan In House Training tidak ditemukan atau di luar ruang lingkup akses.'
      using errcode = 'P0002';
  end if;

  select * into v_participant
    from aureka_system.education_participants
   where id = p_participant_id
     and event_id = p_event_id
     and participant_type = 'staff'
     and staff_id is not null
     and status = 'completed'
   for update;
  if not found then
    raise exception 'Peserta harus berasal dari direktori tenaga kerja dan telah dikonfirmasi hadir.'
      using errcode = 'P0002';
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

  v_year := extract(year from v_event.start_at)::integer;
  insert into aureka_system.education_certificate_counters(certificate_year, last_number)
  values (v_year, 1)
  on conflict (certificate_year)
  do update set last_number = aureka_system.education_certificate_counters.last_number + 1
  returning last_number into v_number;

  v_certificate_number := 'IHT/' || v_year::text || '/' || lpad(v_number::text, 4, '0');
  insert into aureka_system.education_certificates(
    event_id, participant_id, certificate_number, issue_date, competency_result, issued_by
  )
  values (
    p_event_id, p_participant_id, v_certificate_number, current_date,
    'In House Training', v_user_id
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

create or replace function aureka_system.complete_in_house_training_certificate(
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
  v_event aureka_system.education_events%rowtype;
begin
  if v_user_id is null or not aureka_system.can_manage_education() then
    raise exception 'Role tidak memiliki kewenangan menyelesaikan sertifikat In House Training.'
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

  select * into v_event
    from aureka_system.education_events
   where id = v_certificate.event_id
     and event_type = 'in_house_training';
  if not found or not aureka_system.can_access_room_or_global(v_event.room_id) then
    raise exception 'Sertifikat tidak terhubung ke kegiatan IHT dalam ruang lingkup akses.'
      using errcode = '42501';
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

revoke all on function aureka_system.reserve_in_house_training_certificate(uuid, uuid) from public, anon;
revoke all on function aureka_system.complete_in_house_training_certificate(uuid, text, text) from public, anon;
grant execute on function aureka_system.reserve_in_house_training_certificate(uuid, uuid) to authenticated;
grant execute on function aureka_system.complete_in_house_training_certificate(uuid, text, text) to authenticated;

comment on function aureka_system.reserve_in_house_training_certificate(uuid, uuid)
is 'Reserves annual IHT certificate numbers for staff participants with confirmed attendance.';
comment on function aureka_system.complete_in_house_training_certificate(uuid, text, text)
is 'Stores an owner-scoped private PDF path and SHA-256 for a reserved IHT certificate.';

notify pgrst, 'reload schema';
