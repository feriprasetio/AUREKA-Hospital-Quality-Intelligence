begin;

-- Keep cross-unit education participant identities within the viewer's granted unit scope.
drop policy if exists education_participants_read on aureka_system.education_participants;
create policy education_participants_read
on aureka_system.education_participants for select to authenticated
using (
  exists (
    select 1 from aureka_system.education_events e
    where e.id=event_id
      and aureka_system.can_access_room_or_global(e.room_id)
      and (aureka_system.can_manage_education() or e.status='published')
  )
);

-- Approval request insertion must reference an artifact within the actor's authorized scope.
drop policy if exists approvals_write on aureka_system.document_approval_requests;
create policy approvals_write
on aureka_system.document_approval_requests for insert to authenticated
with check (
  created_by=(select auth.uid())
  and aureka_system.can_approve_documents()
  and required_role=any(array['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']::text[])
  and exists (
    select 1 from aureka_system.generated_artifacts a
    where a.id=artifact_id and aureka_system.can_access_room_or_global(a.room_id)
  )
);

-- Approval/signature audit metadata stays in the caller's document scope.
drop policy if exists approvals_read on aureka_system.document_approval_requests;
create policy approvals_read
on aureka_system.document_approval_requests for select to authenticated
using (
  assigned_user_id=(select auth.uid())
  or exists (
    select 1 from aureka_system.generated_artifacts a
    where a.id=artifact_id
      and (a.created_by=(select auth.uid()) or
           (aureka_system.can_approve_documents() and aureka_system.can_access_room_or_global(a.room_id)))
  )
);

drop policy if exists document_signatures_read on aureka_system.document_signatures;
create policy document_signatures_read
on aureka_system.document_signatures for select to authenticated
using (
  signer_user_id=(select auth.uid())
  or exists (
    select 1 from aureka_system.generated_artifacts a
    where a.id=artifact_id and aureka_system.can_approve_documents()
      and aureka_system.can_access_room_or_global(a.room_id)
  )
);

drop policy if exists document_signature_events_read on aureka_system.document_signature_events;
create policy document_signature_events_read
on aureka_system.document_signature_events for select to authenticated
using (
  exists (
    select 1
    from aureka_system.document_signatures s
    join aureka_system.generated_artifacts a on a.id=s.artifact_id
    where s.id=signature_id
      and aureka_system.can_approve_documents()
      and aureka_system.can_access_room_or_global(a.room_id)
  )
);

drop policy if exists document_approval_events_read on aureka_system.document_approval_events;
create policy document_approval_events_read
on aureka_system.document_approval_events for select to authenticated
using (
  exists (
    select 1 from aureka_system.generated_artifacts a
    where a.id=artifact_id
      and aureka_system.can_approve_documents()
      and aureka_system.can_access_room_or_global(a.room_id)
  )
);

-- A Realcost case may only link a patient-index entity whose episode includes the same unit.
create or replace function aureka_quality.guard_realcost_patient_room_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.patient_index_id is not null and not exists (
    select 1
    from aureka_quality.patient_index p
    where p.patient_id=new.patient_index_id
      and new.room_id=any(p.room_ids)
  ) then
    raise exception 'Relasi pasien-Realcost tidak cocok dengan unit pada rekam episode yang terverifikasi.'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function aureka_quality.guard_realcost_patient_room_link() from public, anon, authenticated;
drop trigger if exists realcost_patient_room_link_guard on aureka_quality.realcost_audits;
create trigger realcost_patient_room_link_guard
before insert or update of patient_index_id,room_id
on aureka_quality.realcost_audits
for each row execute function aureka_quality.guard_realcost_patient_room_link();

commit;