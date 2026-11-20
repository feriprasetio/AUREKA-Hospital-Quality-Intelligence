begin;

drop policy if exists knowledge_jobs_read_managers on aureka_system.knowledge_ingestion_jobs;
create policy knowledge_jobs_read_managers
on aureka_system.knowledge_ingestion_jobs for select to authenticated
using (aureka_system.can_process_spo());

drop policy if exists knowledge_jobs_update_managers on aureka_system.knowledge_ingestion_jobs;
create policy knowledge_jobs_update_managers
on aureka_system.knowledge_ingestion_jobs for update to authenticated
using (aureka_system.can_process_spo())
with check (aureka_system.can_process_spo());

drop policy if exists knowledge_chunks_write_managers on aureka_system.knowledge_chunks;
create policy knowledge_chunks_write_managers
on aureka_system.knowledge_chunks for insert to authenticated
with check (
  aureka_system.can_process_spo()
  and exists (
    select 1 from aureka_system.controlled_documents d
    where d.id=document_id
      and aureka_system.can_access_room_or_global(d.owner_room_id)
  )
);

drop policy if exists knowledge_chunks_delete_managers on aureka_system.knowledge_chunks;
create policy knowledge_chunks_delete_managers
on aureka_system.knowledge_chunks for delete to authenticated
using (
  aureka_system.can_process_spo()
  and exists (
    select 1 from aureka_system.controlled_documents d
    where d.id=document_id
      and aureka_system.can_access_room_or_global(d.owner_room_id)
  )
);

grant delete on aureka_system.knowledge_chunks to authenticated;

commit;