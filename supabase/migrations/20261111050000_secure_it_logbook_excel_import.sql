-- Secure, idempotent workbook import for Informatika dan Teknologi (room 2).
-- Each Excel incident is one activity record, never a patient episode.
create unique index if not exists uq_quality_records_it_excel_source_no
  on aureka_quality.quality_records (room_id, profile_year, measurement_grain, subject_key)
  where room_id = 2
    and profile_year = 2026
    and measurement_grain = 'activity'
    and subject_key like 'excel-pmkp-informatika-teknologi-2026:no:%'
    and status <> 'archived'
    and archived_at is null;

create or replace function aureka_quality.import_it_logbook_batch(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'aureka_quality', 'aureka_system', 'auth', 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text := aureka_system.current_role_code();
  v_profile_id uuid;
  v_profile_options jsonb;
  v_row jsonb;
  v_payload jsonb;
  v_responses jsonb;
  v_response jsonb;
  v_core jsonb;
  v_form jsonb;
  v_source jsonb;
  v_raw jsonb;
  v_option jsonb;
  v_source_no text;
  v_source_row integer;
  v_record_date date;
  v_sha text;
  v_key text;
  v_label text;
  v_code text;
  v_source_only boolean;
  v_expected_review boolean;
  v_received integer;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_record_id uuid;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan untuk mengimpor logbook Informatika dan Teknologi.' using errcode = '28000';
  end if;
  if v_role is null or v_role not in ('ADMIN', 'PMKP') then
    raise exception 'Impor workbook hanya diizinkan bagi role ADMIN atau PMKP.' using errcode = '42501';
  end if;
  if not aureka_system.has_quality_room_access(2) then
    raise exception 'Akses ke unit Informatika dan Teknologi tidak tersedia.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Batch impor harus berupa daftar baris yang valid.' using errcode = '22023';
  end if;

  v_received := jsonb_array_length(p_rows);
  if v_received < 1 or v_received > 100 then
    raise exception 'Jumlah baris per batch harus antara 1 dan 100.' using errcode = '22023';
  end if;

  select ip.id, ip.options_json
    into v_profile_id, v_profile_options
    from aureka_quality.indicator_profiles ip
   where ip.room_id = 2
     and ip.profile_year = 2026
     and ip.code = '2.1'
     and ip.is_active = true
     and ip.status = 'published'
     and ip.measurement_grain = 'activity'
   order by ip.created_at desc
   limit 1;
  if v_profile_id is null or jsonb_typeof(v_profile_options) <> 'array'
     or jsonb_array_length(v_profile_options) = 0 then
    raise exception 'Master indikator 2.1 harus aktif, terbit, dan memiliki pilihan respons sebelum impor.' using errcode = '23503';
  end if;

  if (select count(distinct x.item->'payload'->>'subject_key')
        from jsonb_array_elements(p_rows) as x(item)) <> v_received then
    raise exception 'Batch memuat nomor sumber kosong atau duplikat.' using errcode = '22023';
  end if;

  -- Validate the complete batch before the first write.
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_payload := v_row->'payload';
    v_responses := v_row->'responses';
    if coalesce(jsonb_typeof(v_payload), '') <> 'object'
       or coalesce(jsonb_typeof(v_responses), '') <> 'array'
       or jsonb_array_length(v_responses) <> 1
       or coalesce(jsonb_typeof(v_row->'attributions'), '') <> 'array'
       or jsonb_array_length(v_row->'attributions') <> 0 then
      raise exception 'Bentuk payload, respons indikator, atau atribusi tidak valid.' using errcode = '22023';
    end if;

    if coalesce(v_payload->>'room_id', '') <> '2'
       or coalesce(v_payload->>'profile_year', '') <> '2026'
       or coalesce(v_payload->>'measurement_grain', '') <> 'activity'
       or coalesce(v_payload->>'status', '') <> 'ready'
       or coalesce(v_payload->>'review_required', '') not in ('true', 'false') then
      raise exception 'Batch hanya menerima catatan activity Informatika dan Teknologi profil 2026 dengan status ready.' using errcode = '22023';
    end if;

    v_core := v_payload->'core_data';
    v_form := v_core->'form_fields';
    v_source := v_core->'source_import';
    v_source_no := coalesce(v_source->>'source_excel_no', '');
    v_source_row := coalesce(nullif(v_source->>'source_excel_row', ''), '0')::integer;
    v_sha := coalesce(v_source->>'source_file_sha256', '');
    v_key := coalesce(v_payload->>'subject_key', '');

    if coalesce(jsonb_typeof(v_core), '') <> 'object'
       or coalesce(jsonb_typeof(v_form), '') <> 'object'
       or coalesce(jsonb_typeof(v_source), '') <> 'object'
       or coalesce(v_core->>'unit_name', '') <> 'Informatika dan Teknologi'
       or coalesce(v_core->>'room_id', '') <> '2'
       or coalesce(v_core->>'measurement_grain', '') <> 'activity'
       or coalesce(v_source->>'source_sheet', '') <> 'Logbook'
       or nullif(btrim(v_source->>'source_workbook'), '') is null
       or v_sha !~ '^[0-9a-f]{64}$'
       or v_source_no !~ '^[1-9][0-9]{0,8}$'
       or v_source_row < 3 or v_source_row > 5003
       or v_key <> 'excel-pmkp-informatika-teknologi-2026:no:' || v_source_no
       or coalesce(v_form->>'No.', '') <> v_source_no then
      raise exception 'Identitas sumber workbook atau nomor laporan tidak valid.' using errcode = '22023';
    end if;

    if nullif(btrim(v_form->>'Gangguan IT'), '') is null
       or nullif(btrim(v_form->>'Asal Ruangan'), '') is null
       or nullif(btrim(v_form->>'Tanggal Keluhan'), '') is null
       or nullif(btrim(v_form->>'Petugas IT'), '') is null
       or nullif(btrim(v_form->>'Tingkat Kesulitan'), '') is null
       or nullif(btrim(v_form->>'Tindak Lanjut'), '') is null then
      raise exception 'Kolom wajib logbook kosong pada baris Excel %.', v_source_row using errcode = '22023';
    end if;

    if coalesce(v_form->>'Tanggal Keluhan', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
       or coalesce(v_payload->>'record_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or substring(v_form->>'Tanggal Keluhan' from 1 for 10) <> v_payload->>'record_date'
       or coalesce(v_core->>'admission_at', '') <> v_form->>'Tanggal Keluhan' then
      raise exception 'Tanggal Keluhan atau record_date tidak konsisten pada baris Excel %.', v_source_row using errcode = '22023';
    end if;
    begin
      v_record_date := (v_payload->>'record_date')::date;
      perform (v_form->>'Tanggal Keluhan')::timestamp without time zone;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Tanggal Keluhan tidak valid pada baris Excel %.', v_source_row using errcode = '22007';
    end;
    if v_record_date < date '2026-01-01' or v_record_date >= date '2027-01-01' then
      raise exception 'Tanggal laporan berada di luar profil 2026 pada baris Excel %.', v_source_row using errcode = '22023';
    end if;

    v_response := v_responses->0;
    if coalesce(v_response->>'indicator_id', '') <> v_profile_id::text
       or coalesce(v_response->>'response_label', '') = ''
       or coalesce(jsonb_typeof(v_response->'raw_value'), '') <> 'object' then
      raise exception 'Respons tidak mengacu pada master indikator 2.1 yang aktif pada baris Excel %.', v_source_row using errcode = '23503';
    end if;

    v_raw := v_response->'raw_value';
    v_label := coalesce(v_response->>'response_label', '');
    v_code := v_response->>'response_code';
    v_source_only := coalesce((v_raw->>'source_option')::boolean, false);

    if coalesce(v_raw->>'answer', '') <> v_label
       or coalesce(v_raw->>'source_value', '') <> coalesce(v_form->>'Tindak Lanjut', '')
       or coalesce(v_raw->>'source_label', '') <> coalesce(v_form->>'Tindak Lanjut', '')
       or coalesce(v_raw->>'review_required', '') not in ('true', 'false')
       or (coalesce(v_source_only, false) and v_code is not null)
       or ((not coalesce(v_source_only, false)) and v_code is not null and v_code !~ '^[1-3]$')
       or coalesce(v_core->'indicator_values'->'2.1', '{}'::jsonb) <> v_raw then
      raise exception 'Nilai respons sumber tidak konsisten pada baris Excel %.', v_source_row using errcode = '22023';
    end if;

    v_option := null;
    if not v_source_only then
      select opt into v_option
        from jsonb_array_elements(v_profile_options) opt
       where opt->>'label' = v_label
         and opt->>'code' is not distinct from v_code
       limit 1;
      if v_option is null then
        raise exception 'Pilihan Tindak Lanjut tidak ditemukan pada master indikator 2.1 pada baris Excel %.', v_source_row using errcode = '23503';
      end if;
    end if;

    v_expected_review := v_source_only or coalesce((v_option->>'review_required')::boolean, false);
    if coalesce((v_raw->>'review_required')::boolean, false) <> v_expected_review
       or coalesce((v_payload->>'review_required')::boolean, false) <> v_expected_review
       or coalesce(v_response->>'review_status', 'not_required') <> case when v_expected_review then 'pending' else 'not_required' end then
      raise exception 'Status review respons tidak konsisten pada baris Excel %.', v_source_row using errcode = '22023';
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_payload := v_row->'payload';
    v_key := v_payload->>'subject_key';

    if exists (
      select 1
        from aureka_quality.quality_records qr
       where qr.room_id = 2
         and qr.profile_year = 2026
         and qr.measurement_grain = 'activity'
         and qr.subject_key = v_key
         and qr.status <> 'archived'
         and qr.archived_at is null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin
      v_record_id := aureka_quality.save_quality_logbook(
        null,
        v_payload,
        v_row->'responses',
        '[]'::jsonb
      );
      v_imported := v_imported + 1;
    exception when unique_violation then
      if exists (
        select 1
          from aureka_quality.quality_records qr
         where qr.room_id = 2
           and qr.profile_year = 2026
           and qr.measurement_grain = 'activity'
           and qr.subject_key = v_key
           and qr.status <> 'archived'
           and qr.archived_at is null
      ) then
        v_skipped := v_skipped + 1;
      else
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'received_count', v_received,
    'imported_count', v_imported,
    'skipped_existing_count', v_skipped
  );
end;
$function$;

revoke all on function aureka_quality.import_it_logbook_batch(jsonb) from public, anon;
grant execute on function aureka_quality.import_it_logbook_batch(jsonb) to authenticated;
comment on function aureka_quality.import_it_logbook_batch(jsonb) is
  'Idempotent import of Informatika dan Teknologi 2026 Logbook rows as activity records; never creates patient episodes.';
