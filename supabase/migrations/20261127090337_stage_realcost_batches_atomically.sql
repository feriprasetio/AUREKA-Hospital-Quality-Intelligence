begin;

-- Identity INSERT policy must be able to resolve the importer's own staging episodes.
create policy realcost_episodes_owner_staging_read
  on aureka_quality.realcost_episodes for select to authenticated
  using (
    public.aureka_has_permission('realcost.import') and exists (
      select 1 from aureka_quality.realcost_imports i
      where i.id = import_id and i.imported_by = (select auth.uid()) and i.status = 'processing'
    )
  );

create or replace function public.aureka_stage_realcost_batch(
  p_import_id uuid,
  p_offset integer,
  p_episodes jsonb,
  p_identities jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  current_rows integer;
  row_limit integer;
  batch_size integer;
begin
  if auth.uid() is null or p_offset is null or p_offset < 0
    or jsonb_typeof(p_episodes) is distinct from 'array'
    or jsonb_typeof(p_identities) is distinct from 'array' then
    raise exception 'Permintaan batch Realcost tidak valid.' using errcode = '22023';
  end if;
  batch_size := jsonb_array_length(p_episodes);
  if batch_size not between 1 and 250 or jsonb_array_length(p_identities) <> batch_size then
    raise exception 'Jumlah episode dan identitas batch tidak sesuai.' using errcode = '22023';
  end if;

  select i.imported_rows, i.source_rows into current_rows, row_limit
  from aureka_quality.realcost_imports i
  where i.id = p_import_id and i.imported_by = auth.uid() and i.status = 'processing'
    and public.aureka_has_permission('realcost.import')
  for update;
  if not found then
    raise exception 'Batch Realcost tidak dapat diakses.' using errcode = '42501';
  end if;

  if current_rows <> p_offset or p_offset::bigint + batch_size > row_limit then
    raise exception 'Posisi batch Realcost sudah berubah. Periksa kembali status impor.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_episodes) as e(id uuid)
    full join jsonb_to_recordset(p_identities) as i(episode_id uuid) on e.id = i.episode_id
    where e.id is null or i.episode_id is null
  ) then
    raise exception 'Kunci identitas batch Realcost tidak sesuai dengan episode.' using errcode = '22023';
  end if;

  insert into aureka_quality.realcost_episodes
  select e.*
  from jsonb_array_elements(p_episodes) as item(payload),
    lateral jsonb_populate_record(
      null::aureka_quality.realcost_episodes,
      item.payload || jsonb_build_object('import_id', p_import_id, 'created_at', now())
    ) as e;

  insert into aureka_quality.realcost_patient_identity
  select i.*
  from jsonb_array_elements(p_identities) as item(payload),
    lateral jsonb_populate_record(
      null::aureka_quality.realcost_patient_identity,
      item.payload || jsonb_build_object('created_at', now())
    ) as i;

  update aureka_quality.realcost_imports
  set imported_rows = current_rows + batch_size
  where id = p_import_id;
  if not found then
    raise exception 'Progres batch Realcost tidak dapat disimpan.' using errcode = '42501';
  end if;
  return current_rows + batch_size;
end;
$function$;

revoke all on function public.aureka_stage_realcost_batch(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.aureka_stage_realcost_batch(uuid, integer, jsonb, jsonb) to authenticated;

commit;
