-- Require a valid active Admin identity before rebuilding the patient index.
-- current_role_code() returns NULL for inactive or unprovisioned accounts; a
-- plain "IF role <> 'ADMIN'" does not reject NULL in PL/pgSQL.
CREATE OR REPLACE FUNCTION public.aureka_patient_index_sync()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'aureka_quality', 'aureka_system', 'public'
AS $function$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Autentikasi diperlukan.' using errcode = '28000';
  end if;

  if coalesce(aureka_system.current_role_code(), '') <> 'ADMIN' then
    raise exception 'Hanya Super Admin yang dapat menyinkronkan Database Pasien.'
      using errcode = '42501';
  end if;

  with e as (
    select aureka_quality.normalize_no_rm(coalesce(q.core_data->>'medical_record_no', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM')) as rm,
           nullif(trim(coalesce(q.core_data->>'patient_name', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Nama Pasien')),'') as nama,
           coalesce(nullif(trim(q.core_data->>'diagnosis'),''), nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Tegak'), ''),
                    nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa IGD'), ''), nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa'), ''),
                    nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Operasi'), '')) as diag,
           q.room_id, coalesce(q.record_date, q.created_at::date) as d
    from aureka_quality.quality_records q
    where q.measurement_grain = 'patient_episode' and q.archived_at is null and q.status <> 'archived'
  ), g as (
    select rm,
      (array_agg(nama order by d desc nulls last) filter (where nama is not null))[1] as nama,
      min(d) as first_seen, max(d) as last_seen, count(*)::int as total,
      array_agg(distinct room_id) as room_ids,
      (array_agg(room_id order by d desc nulls last))[1] as last_room,
      (array_agg(diag order by d desc nulls last) filter (where diag is not null))[1] as diag
    from e where rm is not null group by rm
  )
  insert into aureka_quality.patient_index as p (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
  select g.rm, g.nama, g.first_seen, g.last_seen, g.total, g.room_ids, r.name, g.diag
  from g left join public.master_rooms r on r.id = g.last_room
  on conflict (no_rm) do update set
    nama_pasien = coalesce(excluded.nama_pasien, p.nama_pasien), first_seen = excluded.first_seen, last_seen = excluded.last_seen,
    total_episode = excluded.total_episode, room_ids = excluded.room_ids, unit_terakhir = excluded.unit_terakhir,
    diagnosis_terakhir = coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir), updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end $function$;
