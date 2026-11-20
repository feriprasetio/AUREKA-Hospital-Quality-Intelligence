begin;

create or replace function aureka_system.can_process_spo()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null
     and aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR']::text[]);
$$;

-- Published hospital-wide SPOs can be read by authenticated users; room-specific SPOs remain unit-scoped.
drop policy if exists controlled_documents_read on aureka_system.controlled_documents;
create policy controlled_documents_read
on aureka_system.controlled_documents for select to authenticated
using (
  (status = 'published' and (owner_room_id is null or aureka_system.has_quality_room_access(owner_room_id)))
  or aureka_system.can_process_spo()
);

drop policy if exists controlled_documents_write on aureka_system.controlled_documents;
create policy controlled_documents_write
on aureka_system.controlled_documents for insert to authenticated
with check (
  aureka_system.can_process_spo()
  and created_by = (select auth.uid())
  and aureka_system.can_access_room_or_global(owner_room_id)
);

drop policy if exists controlled_documents_update on aureka_system.controlled_documents;
create policy controlled_documents_update
on aureka_system.controlled_documents for update to authenticated
using (aureka_system.can_process_spo() and aureka_system.can_access_room_or_global(owner_room_id))
with check (aureka_system.can_process_spo() and aureka_system.can_access_room_or_global(owner_room_id));

drop policy if exists controlled_versions_read on aureka_system.controlled_document_versions;
create policy controlled_versions_read
on aureka_system.controlled_document_versions for select to authenticated
using (
  exists (
    select 1 from aureka_system.controlled_documents d
    where d.id = document_id
      and (
        (d.status = 'published' and (d.owner_room_id is null or aureka_system.has_quality_room_access(d.owner_room_id)))
        or aureka_system.can_process_spo()
      )
  )
);

drop policy if exists controlled_versions_write on aureka_system.controlled_document_versions;
create policy controlled_versions_write
on aureka_system.controlled_document_versions for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and aureka_system.can_process_spo()
  and exists (
    select 1 from aureka_system.controlled_documents d
    where d.id = document_id and aureka_system.can_access_room_or_global(d.owner_room_id)
  )
);

drop policy if exists knowledge_chunks_read_published on aureka_system.knowledge_chunks;
create policy knowledge_chunks_read_published
on aureka_system.knowledge_chunks for select to authenticated
using (
  exists (
    select 1 from aureka_system.controlled_documents d
    where d.id = document_id and d.status = 'published'
      and (d.owner_room_id is null or aureka_system.has_quality_room_access(d.owner_room_id))
  )
);

-- The active SPO analyzer uses the exact path spo/{controlled_document_uuid}/{filename}.
-- This path is isolated from the generic room/global path and limited to the same trusted management roles as the Edge Function.
drop policy if exists aureka_spo_analyzer_select on storage.objects;
create policy aureka_spo_analyzer_select
on storage.objects for select to authenticated
using (
  bucket_id = 'aureka-documents'
  and (storage.foldername(name))[1] = 'spo'
  and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
  and aureka_system.can_process_spo()
);

drop policy if exists aureka_spo_upload on storage.objects;
create policy aureka_spo_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'aureka-documents'
  and (storage.foldername(name))[1] = 'spo'
  and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
  and aureka_system.can_process_spo()
);

drop policy if exists aureka_spo_replace on storage.objects;
create policy aureka_spo_replace
on storage.objects for update to authenticated
using (
  bucket_id = 'aureka-documents'
  and (storage.foldername(name))[1] = 'spo'
  and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
  and aureka_system.can_process_spo()
)
with check (
  bucket_id = 'aureka-documents'
  and (storage.foldername(name))[1] = 'spo'
  and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
  and aureka_system.can_process_spo()
);

commit;