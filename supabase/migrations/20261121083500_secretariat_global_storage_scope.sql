begin;

drop policy if exists aureka_secretariat_global_upload on storage.objects;
create policy aureka_secretariat_global_upload
on storage.objects for insert to authenticated
with check (
  bucket_id='aureka-documents'
  and (storage.foldername(name))[1]='global'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] = any(array['undangan','materi','absensi','notulensi','gambar']::text[])
  and aureka_system.can_manage_pmkp_workspace()
  and exists (
    select 1
    from aureka_system.pmkp_meetings m
    where m.id=((storage.foldername(name))[2])::uuid
      and m.room_id is null
  )
);

commit;