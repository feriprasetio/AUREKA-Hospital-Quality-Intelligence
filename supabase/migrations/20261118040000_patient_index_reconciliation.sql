-- Rebuild the patient index from active patient episodes instead of incrementing
-- total_episode on every edit. Keeps SIMRS/SATUSEHAT identity and bridging fields.
-- Also refreshes both sides when an episode changes its medical-record number,
-- moves unit, changes grain, or is archived/deleted.

create or replace function aureka_quality.patient_index_refresh(p_no_rm text)
returns void
language plpgsql
security definer
set search_path = aureka_quality, public
as $$
declare
  v_rm text := aureka_quality.normalize_no_rm(p_no_rm);
  v_name text;
  v_first date;
  v_last date;
  v_total integer := 0;
  v_rooms bigint[];
  v_last_room bigint;
  v_diagnosis text;
  v_unit text;
begin
  if v_rm is null then
    return;
  end if;

  with episodes as (
    select
      q.room_id,
      coalesce(q.record_date, q.created_at::date) as episode_date,
      q.created_at,
      aureka_quality.normalize_no_rm(coalesce(
        q.core_data->>'medical_record_no',
        coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis',
        coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM'
      )) as rm,
      nullif(trim(coalesce(
        q.core_data->>'patient_name',
        coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Nama Pasien'
      )), '') as patient_name,
      coalesce(
        nullif(trim(q.core_data->>'diagnosis'), ''),
        nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Tegak'), ''),
        nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa IGD'), ''),
        nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa'), ''),
        nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Operasi'), '')
      ) as diagnosis
    from aureka_quality.quality_records q
    where q.measurement_grain = 'patient_episode'
      and q.archived_at is null
      and q.status <> 'archived'
  )
  select
    (array_agg(patient_name order by episode_date desc nulls last, created_at desc)
      filter (where patient_name is not null))[1],
    min(episode_date),
    max(episode_date),
    count(*)::integer,
    array_agg(distinct room_id),
    (array_agg(room_id order by episode_date desc nulls last, created_at desc))[1],
    (array_agg(diagnosis order by episode_date desc nulls last, created_at desc)
      filter (where diagnosis is not null))[1]
  into v_name, v_first, v_last, v_total, v_rooms, v_last_room, v_diagnosis
  from episodes
  where rm = v_rm;

  if coalesce(v_total, 0) = 0 then
    update aureka_quality.patient_index
       set first_seen = null,
           last_seen = null,
           total_episode = 0,
           room_ids = '{}'::bigint[],
           unit_terakhir = null,
           diagnosis_terakhir = null,
           updated_at = now()
     where no_rm = v_rm;
    return;
  end if;

  select name into v_unit
  from public.master_rooms
  where id = v_last_room;

  insert into aureka_quality.patient_index as current_index (
    no_rm, nama_pasien, first_seen, last_seen, total_episode,
    room_ids, unit_terakhir, diagnosis_terakhir
  )
  values (
    v_rm, v_name, v_first, v_last, v_total,
    coalesce(v_rooms, '{}'::bigint[]), v_unit, v_diagnosis
  )
  on conflict (no_rm) do update set
    nama_pasien = coalesce(excluded.nama_pasien, current_index.nama_pasien),
    first_seen = excluded.first_seen,
    last_seen = excluded.last_seen,
    total_episode = excluded.total_episode,
    room_ids = excluded.room_ids,
    unit_terakhir = excluded.unit_terakhir,
    diagnosis_terakhir = excluded.diagnosis_terakhir,
    updated_at = now();
end;
$$;

create or replace function aureka_quality.patient_index_on_record()
returns trigger
language plpgsql
security definer
set search_path = aureka_quality, public
as $$
declare
  v_old_rm text;
  v_new_rm text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.measurement_grain = 'patient_episode' then
      v_old_rm := aureka_quality.normalize_no_rm(coalesce(
        old.core_data->>'medical_record_no',
        coalesce(old.core_data->'form_fields', old.core_data->'form_data')->>'No. Rekam Medis',
        coalesce(old.core_data->'form_fields', old.core_data->'form_data')->>'No. RM'
      ));
      if v_old_rm is not null then
        perform aureka_quality.patient_index_refresh(v_old_rm);
      end if;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.measurement_grain = 'patient_episode'
       and new.archived_at is null
       and new.status <> 'archived' then
      v_new_rm := aureka_quality.normalize_no_rm(coalesce(
        new.core_data->>'medical_record_no',
        coalesce(new.core_data->'form_fields', new.core_data->'form_data')->>'No. Rekam Medis',
        coalesce(new.core_data->'form_fields', new.core_data->'form_data')->>'No. RM'
      ));
      if v_new_rm is not null and v_new_rm is distinct from v_old_rm then
        perform aureka_quality.patient_index_refresh(v_new_rm);
      elsif v_new_rm is not null and tg_op = 'INSERT' then
        perform aureka_quality.patient_index_refresh(v_new_rm);
      end if;
    end if;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists patient_index_sync on aureka_quality.quality_records;
create trigger patient_index_sync
after insert or update or delete
on aureka_quality.quality_records
for each row execute function aureka_quality.patient_index_on_record();

revoke all on function aureka_quality.patient_index_refresh(text) from public, anon, authenticated;
revoke all on function aureka_quality.patient_index_on_record() from public, anon, authenticated;

-- One-time reconciliation: correct any counts previously inflated by episode edits.
do $$
declare
  item record;
begin
  for item in
    select no_rm
    from aureka_quality.patient_index
    union
    select aureka_quality.normalize_no_rm(coalesce(
      q.core_data->>'medical_record_no',
      coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis',
      coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM'
    )) as no_rm
    from aureka_quality.quality_records q
    where q.measurement_grain = 'patient_episode'
      and q.archived_at is null
      and q.status <> 'archived'
  loop
    perform aureka_quality.patient_index_refresh(item.no_rm);
  end loop;
end;
$$;
