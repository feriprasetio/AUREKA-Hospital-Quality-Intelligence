begin;

-- Empty encounter references do not represent a unique visit; enforce uniqueness only for populated references.
alter table aureka_quality.realcost_audits
  drop constraint if exists realcost_audits_room_id_encounter_ref_key;
create unique index if not exists realcost_audits_room_encounter_uidx
  on aureka_quality.realcost_audits(room_id,encounter_ref)
  where encounter_ref is not null and btrim(encounter_ref) <> '';

-- Prevent duplicate import batches for the same immutable source file.
create unique index if not exists realcost_import_batches_source_sha_uidx
  on aureka_quality.realcost_import_batches(source_sha256)
  where source_sha256 is not null and btrim(source_sha256) <> '';

-- Signature revocation is a controlled, auditable operation; direct row updates remain revoked.
create or replace function public.aureka_revoke_document_signature(
  p_signature_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signature aureka_system.document_signatures%rowtype;
  v_room_id bigint;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then
    raise exception 'Alasan pencabutan wajib diisi minimal 8 karakter.' using errcode='22023';
  end if;
  if not aureka_system.can_approve_documents() then
    raise exception 'Role tidak berwenang mencabut persetujuan dokumen.' using errcode='42501';
  end if;

  select a.room_id into v_room_id
  from aureka_system.document_signatures s
  join aureka_system.generated_artifacts a on a.id=s.artifact_id
  where s.id=p_signature_id;

  if not found or not aureka_system.can_access_room_or_global(v_room_id) then
    raise exception 'Catatan persetujuan tidak berada dalam cakupan pengguna.' using errcode='42501';
  end if;

  update aureka_system.document_signatures
  set revoked_at=now(), revoke_reason=left(trim(p_reason),1000)
  where id=p_signature_id and revoked_at is null
  returning * into v_signature;

  if v_signature.id is null then
    raise exception 'Tanda tangan tidak ditemukan atau sudah dicabut.' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'success',true,
    'signature_id',v_signature.id,
    'revoked_at',v_signature.revoked_at,
    'verification_code',v_signature.verification_code,
    'note','Kode verifikasi lama tidak lagi valid.'
  );
end;
$$;
revoke all on function public.aureka_revoke_document_signature(uuid,text) from public, anon;
grant execute on function public.aureka_revoke_document_signature(uuid,text) to authenticated;

commit;