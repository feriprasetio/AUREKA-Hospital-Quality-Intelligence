begin;

-- Fix totals when a cost/revenue component is moved between case records.
create or replace function aureka_quality.recalculate_realcost_case_totals()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  if tg_op in ('UPDATE','DELETE') then v_old_id := old.audit_id; end if;
  if tg_op in ('INSERT','UPDATE') then v_new_id := new.audit_id; end if;

  if v_old_id is not null then
    update aureka_quality.realcost_audits a
    set total_cost = coalesce((select sum(i.total_cost) from aureka_quality.realcost_cost_items i where i.audit_id = v_old_id),0),
        total_revenue = coalesce((select sum(r.total_revenue) from aureka_quality.realcost_revenue_items r where r.audit_id = v_old_id),0),
        updated_at = now(), updated_by = auth.uid()
    where a.id = v_old_id;
  end if;

  if v_new_id is not null and v_new_id is distinct from v_old_id then
    update aureka_quality.realcost_audits a
    set total_cost = coalesce((select sum(i.total_cost) from aureka_quality.realcost_cost_items i where i.audit_id = v_new_id),0),
        total_revenue = coalesce((select sum(r.total_revenue) from aureka_quality.realcost_revenue_items r where r.audit_id = v_new_id),0),
        updated_at = now(), updated_by = auth.uid()
    where a.id = v_new_id;
  elsif v_new_id is not null and v_old_id is null then
    update aureka_quality.realcost_audits a
    set total_cost = coalesce((select sum(i.total_cost) from aureka_quality.realcost_cost_items i where i.audit_id = v_new_id),0),
        total_revenue = coalesce((select sum(r.total_revenue) from aureka_quality.realcost_revenue_items r where r.audit_id = v_new_id),0),
        updated_at = now(), updated_by = auth.uid()
    where a.id = v_new_id;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function aureka_quality.recalculate_realcost_case_totals() from public, anon, authenticated;

-- The ingestion worker updates job and version states under the same authenticated,
-- manager-scoped RLS context used for document upload.
grant update on aureka_system.controlled_document_versions to authenticated;
drop policy if exists controlled_versions_update on aureka_system.controlled_document_versions;
create policy controlled_versions_update
on aureka_system.controlled_document_versions for update to authenticated
using (
  aureka_system.can_process_spo()
  and exists (
    select 1 from aureka_system.controlled_documents d
    where d.id = document_id and aureka_system.can_access_room_or_global(d.owner_room_id)
  )
)
with check (
  aureka_system.can_process_spo()
  and exists (
    select 1 from aureka_system.controlled_documents d
    where d.id = document_id and aureka_system.can_access_room_or_global(d.owner_room_id)
  )
);

grant update on aureka_system.knowledge_ingestion_jobs to authenticated;
drop policy if exists knowledge_jobs_update_managers on aureka_system.knowledge_ingestion_jobs;
create policy knowledge_jobs_update_managers
on aureka_system.knowledge_ingestion_jobs for update to authenticated
using (aureka_system.can_manage_controlled_documents())
with check (aureka_system.can_manage_controlled_documents());

-- Approval decision audit.
create table if not exists aureka_system.document_approval_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references aureka_system.document_approval_requests(id) on delete restrict,
  artifact_id uuid not null references aureka_system.generated_artifacts(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  decision_note text not null default '',
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  created_at timestamptz not null default now()
);
create index if not exists document_approval_events_request_idx
  on aureka_system.document_approval_events(request_id,created_at desc);
alter table aureka_system.document_approval_events enable row level security;
grant select on aureka_system.document_approval_events to authenticated;
drop policy if exists document_approval_events_read on aureka_system.document_approval_events;
create policy document_approval_events_read
on aureka_system.document_approval_events for select to authenticated
using (aureka_system.can_approve_documents());

-- RPC enforces exact required role, assignment, unit scope and sequential steps.
create or replace function public.aureka_document_approval_decide(
  p_request_id uuid,
  p_decision text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request aureka_system.document_approval_requests%rowtype;
  v_artifact aureka_system.generated_artifacts%rowtype;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  if p_decision not in ('approved','rejected','returned') then
    raise exception 'Keputusan persetujuan tidak valid.' using errcode='22023';
  end if;
  v_role := aureka_system.current_role_code();
  if v_role is null or not aureka_system.can_approve_documents() then
    raise exception 'Role tidak berwenang memberikan keputusan dokumen.' using errcode='42501';
  end if;

  select * into v_request
  from aureka_system.document_approval_requests
  where id=p_request_id and status='pending'
  for update;
  if not found then raise exception 'Permintaan persetujuan tidak ada atau sudah diputuskan.' using errcode='P0002'; end if;

  select * into v_artifact
  from aureka_system.generated_artifacts
  where id=v_request.artifact_id;
  if not found or not aureka_system.can_access_room_or_global(v_artifact.room_id) then
    raise exception 'Artefak tidak berada dalam kewenangan pengguna.' using errcode='42501';
  end if;

  if v_request.assigned_user_id is not null and v_request.assigned_user_id <> auth.uid() then
    raise exception 'Persetujuan ini ditugaskan kepada pengguna lain.' using errcode='42501';
  end if;

  if v_role <> 'ADMIN' and v_request.required_role <> v_role then
    raise exception 'Keputusan harus diberikan oleh role yang dipersyaratkan.' using errcode='42501';
  end if;

  if exists (
    select 1 from aureka_system.document_approval_requests prior
    where prior.artifact_id=v_request.artifact_id
      and prior.approval_step < v_request.approval_step
      and prior.status <> 'approved'
  ) then
    raise exception 'Tahap persetujuan sebelumnya belum lengkap.' using errcode='55000';
  end if;

  update aureka_system.document_approval_requests
  set status=p_decision,
      decision_note=left(coalesce(p_note,''),4000),
      decided_by=auth.uid(),
      decided_at=now()
  where id=v_request.id;

  insert into aureka_system.document_approval_events(
    request_id,artifact_id,previous_status,new_status,decision_note,actor_id,actor_role
  ) values (
    v_request.id,v_request.artifact_id,v_request.status,p_decision,left(coalesce(p_note,''),4000),auth.uid(),v_role
  );

  return jsonb_build_object('success',true,'request_id',v_request.id,'artifact_id',v_request.artifact_id,
    'decision',p_decision,'decision_step',v_request.approval_step,'decided_by',auth.uid(),'decided_at',now());
end;
$$;
revoke all on function public.aureka_document_approval_decide(uuid,text,text) from public, anon;
grant execute on function public.aureka_document_approval_decide(uuid,text,text) to authenticated;
revoke update on aureka_system.document_approval_requests from authenticated;

-- AUREKA approval signature is an authenticated audit record. It must not impersonate a PSrE certificate.
-- Signer identity and role are derived from protected account tables; browser cannot submit a display name or role.
create or replace function public.aureka_sign_document_artifact(
  p_artifact_id uuid,
  p_file_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact aureka_system.generated_artifacts%rowtype;
  v_name text;
  v_role text;
  v_signature aureka_system.document_signatures%rowtype;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  if p_file_sha256 !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'SHA-256 file tidak valid.' using errcode='22023';
  end if;

  v_role := aureka_system.current_role_code();
  if v_role is null or not aureka_system.can_approve_documents() then
    raise exception 'Role tidak berwenang menandatangani artefak.' using errcode='42501';
  end if;

  select * into v_artifact
  from aureka_system.generated_artifacts
  where id=p_artifact_id
  for update;
  if not found or not aureka_system.can_access_room_or_global(v_artifact.room_id) then
    raise exception 'Artefak tidak berada dalam kewenangan pengguna.' using errcode='42501';
  end if;

  if not exists(select 1 from aureka_system.document_approval_requests r
      where r.artifact_id=p_artifact_id) then
    raise exception 'Artefak belum memiliki alur persetujuan.' using errcode='55000';
  end if;
  if exists(select 1 from aureka_system.document_approval_requests r
      where r.artifact_id=p_artifact_id and r.status <> 'approved') then
    raise exception 'Semua tahap persetujuan harus selesai sebelum pencatatan tanda tangan.' using errcode='55000';
  end if;

  select coalesce(nullif(trim(up.full_name),''), au.email, 'Pengguna AUREKA')
  into v_name
  from auth.users au
  left join aureka_system.user_profiles up on up.user_id=au.id
  where au.id=auth.uid() and coalesce(up.is_active,false) and not coalesce(up.must_change_password,true);

  if v_name is null then
    raise exception 'Profil pengguna tidak aktif atau perubahan password awal belum selesai.' using errcode='42501';
  end if;

  insert into aureka_system.document_signatures(
    artifact_id,signer_user_id,signer_display_name,signer_role,signed_file_sha256
  ) values (
    p_artifact_id,auth.uid(),v_name,v_role,lower(p_file_sha256)
  )
  on conflict(artifact_id,signer_user_id) do nothing
  returning * into v_signature;

  if v_signature.id is null then
    select * into v_signature from aureka_system.document_signatures
    where artifact_id=p_artifact_id and signer_user_id=auth.uid();
  end if;

  return jsonb_build_object(
    'success',true,
    'signature_id',v_signature.id,
    'verification_code',v_signature.verification_code,
    'signer',v_signature.signer_display_name,
    'signer_role',v_signature.signer_role,
    'signed_at',v_signature.signed_at,
    'signature_type',v_signature.signature_type,
    'legal_notice','Bukti persetujuan elektronik AUREKA; bukan tanda tangan elektronik tersertifikasi PSrE.'
  );
end;
$$;
revoke all on function public.aureka_sign_document_artifact(uuid,text) from public, anon;
grant execute on function public.aureka_sign_document_artifact(uuid,text) to authenticated;

-- No client may insert/alter signature metadata directly; the server RPC writes it.
revoke insert, update, delete on aureka_system.document_signatures from authenticated;

create or replace function aureka_system.guard_append_only_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    raise exception 'Catatan persetujuan tanda tangan tidak dapat dihapus.';
  end if;
  if tg_op='UPDATE' then
    if old.revoked_at is not null or new.revoked_at is null
       or (to_jsonb(new) - 'revoked_at' - 'revoke_reason') is distinct from
          (to_jsonb(old) - 'revoked_at' - 'revoke_reason')
       or not aureka_system.can_approve_documents() then
      raise exception 'Catatan tanda tangan bersifat append-only; hanya pencabutan yang berwenang yang dapat dicatat.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function aureka_system.guard_append_only_signature() from public, anon, authenticated;
drop trigger if exists document_signatures_append_only on aureka_system.document_signatures;
create trigger document_signatures_append_only before update or delete on aureka_system.document_signatures
for each row execute function aureka_system.guard_append_only_signature();

create or replace function aureka_system.capture_document_signature_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='INSERT' then
    insert into aureka_system.document_signature_events(signature_id,event_type,note,actor_id)
    values(new.id,'created','Persetujuan dokumen dicatat melalui RPC AUREKA.',auth.uid());
    return new;
  end if;
  if tg_op='UPDATE' and old.revoked_at is null and new.revoked_at is not null then
    insert into aureka_system.document_signature_events(signature_id,event_type,note,actor_id)
    values(new.id,'revoked',coalesce(new.revoke_reason,''),auth.uid());
    return new;
  end if;
  return new;
end;
$$;
revoke all on function aureka_system.capture_document_signature_event() from public, anon, authenticated;
drop trigger if exists document_signature_event_capture on aureka_system.document_signatures;
create trigger document_signature_event_capture after insert or update on aureka_system.document_signatures
for each row execute function aureka_system.capture_document_signature_event();

commit;