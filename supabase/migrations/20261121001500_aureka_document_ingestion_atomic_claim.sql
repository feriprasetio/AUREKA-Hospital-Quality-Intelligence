begin;

create or replace function aureka_system.claim_document_ingestion_job(p_document_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job aureka_system.knowledge_ingestion_jobs%rowtype;
  v_doc_id uuid;
  v_room_id bigint;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  if not aureka_system.can_process_spo() then
    raise exception 'Role tidak memiliki kewenangan pemrosesan dokumen.' using errcode='42501';
  end if;

  select d.id,d.owner_room_id
    into v_doc_id,v_room_id
  from aureka_system.controlled_document_versions v
  join aureka_system.controlled_documents d on d.id=v.document_id
  where v.id=p_document_version_id;

  if v_doc_id is null or not aureka_system.can_access_room_or_global(v_room_id) then
    raise exception 'Versi dokumen tidak tersedia dalam cakupan unit pengguna.' using errcode='42501';
  end if;

  select j.*
    into v_job
  from aureka_system.knowledge_ingestion_jobs j
  where j.document_version_id=p_document_version_id
    and j.attempts < j.max_attempts
    and j.available_at <= now()
    and (
      j.status in ('queued','failed')
      or (j.status='processing' and j.locked_at < now()-interval '10 minutes')
    )
  for update skip locked;

  if not found then
    return jsonb_build_object('claimed',false,'reason','not_available_or_already_claimed');
  end if;

  update aureka_system.knowledge_ingestion_jobs
    set status='processing',
        attempts=attempts+1,
        locked_at=now(),
        locked_by=auth.uid()::text,
        last_error=null,
        updated_at=now()
  where id=v_job.id
  returning * into v_job;

  update aureka_system.controlled_document_versions
    set analysis_status='processing',
        analysis_error=null
  where id=p_document_version_id;

  return jsonb_build_object(
    'claimed',true,
    'job_id',v_job.id,
    'attempts',v_job.attempts,
    'max_attempts',v_job.max_attempts,
    'locked_at',v_job.locked_at
  );
end;
$$;

revoke all on function aureka_system.claim_document_ingestion_job(uuid) from public, anon;
grant execute on function aureka_system.claim_document_ingestion_job(uuid) to authenticated;

commit;