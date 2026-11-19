-- Prevent Patient Index episode counts from incrementing when an existing
-- patient_episode record is edited. Preserve the existing MPI and bridging data.
--
-- INSERT creates/increments the episode count exactly once. UPDATE refreshes
-- only the AUREKA-derived latest metadata and never increments total_episode.

create or replace function aureka_quality.patient_index_update_metadata(
  p_core jsonb,
  p_room bigint,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  f jsonb := coalesce(p_core->'form_fields', p_core->'form_data', '{}'::jsonb);
  v_rm text := aureka_quality.normalize_no_rm(coalesce(
    p_core->>'medical_record_no',
    f->>'No. Rekam Medis',
    f->>'No. RM'
  ));
  v_name text := nullif(pg_catalog.btrim(coalesce(
    p_core->>'patient_name',
    f->>'Nama Pasien'
  )), '');
  v_diag text := coalesce(
    nullif(pg_catalog.btrim(p_core->>'diagnosis'), ''),
    nullif(pg_catalog.btrim(f->>'Diagnosa Tegak'), ''),
    nullif(pg_catalog.btrim(f->>'Diagnosa IGD'), ''),
    nullif(pg_catalog.btrim(f->>'Diagnosa'), ''),
    nullif(pg_catalog.btrim(f->>'Diagnosa Operasi'), '')
  );
  v_unit text;
begin
  if v_rm is null then
    return;
  end if;

  select r.name
    into v_unit
    from public.master_rooms r
   where r.id = p_room;

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
    room_ids = (
      select pg_catalog.array_agg(distinct room_id order by room_id)
      from pg_catalog.unnest(coalesce(p.room_ids, '{}'::bigint[]) || coalesce(excluded.room_ids, '{}'::bigint[])) as room_id
    ),
    unit_terakhir = case
      when p.last_seen is null or excluded.last_seen >= p.last_seen then excluded.unit_terakhir
      else p.unit_terakhir
    end,
    diagnosis_terakhir = case
      when p.last_seen is null or excluded.last_seen >= p.last_seen
        then coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir)
      else p.diagnosis_terakhir
    end,
    -- Editing a record is not a new episode.
    total_episode = p.total_episode,
    updated_at = pg_catalog.now();
end;
$function$;

revoke all on function aureka_quality.patient_index_update_metadata(jsonb, bigint, date)
  from public, anon, authenticated, service_role;

create or replace function aureka_quality.patient_index_on_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.measurement_grain = 'patient_episode'
       and new.archived_at is null
       and new.status <> 'archived' then
      perform aureka_quality.patient_index_touch(
        new.core_data,
        new.room_id,
        coalesce(new.record_date, new.created_at::date)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    if new.measurement_grain = 'patient_episode'
       and new.archived_at is null
       and new.status <> 'archived'
       and (
         new.core_data is distinct from old.core_data
         or new.room_id is distinct from old.room_id
         or new.record_date is distinct from old.record_date
         or new.measurement_grain is distinct from old.measurement_grain
         or new.archived_at is distinct from old.archived_at
         or new.status is distinct from old.status
       ) then
      perform aureka_quality.patient_index_update_metadata(
        new.core_data,
        new.room_id,
        coalesce(new.record_date, new.created_at::date)
      );
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function aureka_quality.patient_index_on_record()
  from public, anon, authenticated, service_role;
revoke all on function aureka_quality.patient_index_touch(jsonb, bigint, date)
  from public, anon, authenticated, service_role;

drop trigger if exists patient_index_sync on aureka_quality.quality_records;
create trigger patient_index_sync
after insert or update of core_data, room_id, record_date, measurement_grain, archived_at, status
on aureka_quality.quality_records
for each row
execute function aureka_quality.patient_index_on_record();

comment on function aureka_quality.patient_index_update_metadata(jsonb, bigint, date) is
'Internal trigger helper: refreshes latest patient metadata without incrementing total_episode on UPDATE. Not directly executable by API roles.';
