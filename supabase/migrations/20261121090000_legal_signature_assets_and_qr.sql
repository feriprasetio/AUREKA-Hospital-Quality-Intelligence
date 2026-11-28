begin;

create table if not exists aureka_system.legal_signature_assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  signer_name text not null,
  signer_position text not null,
  required_role text not null check (required_role in ('PMKP','DIREKTUR')),
  source_file_name text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  image_mime_type text not null check (image_mime_type in ('image/webp','image/png')),
  image_data_base64 text not null,
  image_sha256 text not null check (image_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  status text not null default 'pending_authorization'
    check (status in ('pending_authorization','active','revoked')),
  authorized_user_id uuid references auth.users(id) on delete restrict,
  authorized_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='pending_authorization' and authorized_user_id is null and authorized_at is null)
      or (status='active' and authorized_user_id is not null and authorized_at is not null)
      or status='revoked')
);

create table if not exists aureka_system.legal_signature_asset_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references aureka_system.legal_signature_assets(id) on delete restrict,
  event_type text not null check (event_type in ('seeded','authorized','revoked')),
  actor_id uuid references auth.users(id) on delete restrict,
  actor_role text,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table aureka_system.document_signatures
  add column if not exists signature_asset_id uuid
  references aureka_system.legal_signature_assets(id) on delete restrict;

create index if not exists legal_signature_assets_status_role_idx
  on aureka_system.legal_signature_assets(status,required_role);
create index if not exists legal_signature_asset_events_asset_idx
  on aureka_system.legal_signature_asset_events(asset_id,created_at desc);
create index if not exists document_signatures_asset_idx
  on aureka_system.document_signatures(signature_asset_id)
  where signature_asset_id is not null;

alter table aureka_system.legal_signature_assets enable row level security;
alter table aureka_system.legal_signature_asset_events enable row level security;
revoke all on aureka_system.legal_signature_assets from public,anon,authenticated;
revoke all on aureka_system.legal_signature_asset_events from public,anon,authenticated;
grant select on aureka_system.legal_signature_assets,aureka_system.legal_signature_asset_events to authenticated;

drop policy if exists legal_signature_assets_read on aureka_system.legal_signature_assets;
create policy legal_signature_assets_read
on aureka_system.legal_signature_assets for select to authenticated
using (aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','DIREKTUR','KABID','DEWAN_PENGAWAS']::text[]));

drop policy if exists legal_signature_asset_events_read on aureka_system.legal_signature_asset_events;
create policy legal_signature_asset_events_read
on aureka_system.legal_signature_asset_events for select to authenticated
using (aureka_system.current_role_code() = any(array['ADMIN','PMKP','MANAGEMENT','DIREKTUR']::text[]));

-- Private source provisioning only. No signature binary may be seeded from public Git history.
-- Asset codes SIG-PMKP-CHAIR and SIG-HOSPITAL-DIRECTOR are provisioned by authorized custodians.


insert into aureka_system.legal_signature_asset_events(asset_id,event_type,note)
select id,'seeded','Aset tanda tangan diimpor dari gambar yang diserahkan untuk register Legal dan Asset. Menunggu otorisasi pemilik.'
from aureka_system.legal_signature_assets
where asset_code in ('SIG-PMKP-CHAIR','SIG-HOSPITAL-DIRECTOR')
and not exists (
  select 1 from aureka_system.legal_signature_asset_events e
  where e.asset_id=legal_signature_assets.id and e.event_type='seeded'
);

create or replace function public.aureka_list_legal_signature_assets()
returns table (
  asset_id uuid, asset_code text, signer_name text, signer_position text,
  required_role text, status text, image_mime_type text, image_data_base64 text,
  image_sha256 text, authorized_at timestamptz, authorized_user_id uuid
)
language plpgsql security definer stable set search_path = ''
as $$
begin
  if auth.uid() is null or aureka_system.current_role_code() <> all(array['ADMIN','PMKP','MANAGEMENT','DIREKTUR','KABID','DEWAN_PENGAWAS']::text[]) then
    raise exception 'Role tidak berwenang melihat aset tanda tangan.' using errcode='42501';
  end if;
  return query
    select a.id,a.asset_code,a.signer_name,a.signer_position,a.required_role,a.status,
           a.image_mime_type,a.image_data_base64,a.image_sha256,a.authorized_at,a.authorized_user_id
    from aureka_system.legal_signature_assets a
    order by case a.required_role when 'DIREKTUR' then 1 else 2 end,a.created_at;
end;
$$;
revoke all on function public.aureka_list_legal_signature_assets() from public,anon;
grant execute on function public.aureka_list_legal_signature_assets() to authenticated;

create or replace function public.aureka_activate_legal_signature_asset(p_asset_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_asset aureka_system.legal_signature_assets%rowtype;
  v_name text;
  v_active boolean;
  v_must_change boolean;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  select * into v_asset
  from aureka_system.legal_signature_assets
  where asset_code=upper(trim(coalesce(p_asset_code,'')))
  for update;
  if not found then raise exception 'Aset tanda tangan tidak ditemukan.' using errcode='P0002'; end if;

  select p.full_name,p.is_active,p.must_change_password,r.code
    into v_name,v_active,v_must_change,v_role
  from aureka_system.user_profiles p
  left join aureka_system.app_roles r on r.id=p.role_id
  where p.user_id=auth.uid();

  if not coalesce(v_active,false) or coalesce(v_must_change,true) then
    raise exception 'Akun belum aktif atau belum menyelesaikan perubahan password awal.' using errcode='42501';
  end if;
  if v_role is distinct from v_asset.required_role
     or lower(trim(coalesce(v_name,''))) <> lower(trim(v_asset.signer_name)) then
    raise exception 'Aktivasi hanya dapat dilakukan oleh akun dengan nama lengkap dan role yang sama persis dengan pejabat pada aset ini.' using errcode='42501';
  end if;
  if v_asset.status='active' and v_asset.authorized_user_id=auth.uid() then
    return jsonb_build_object('success',true,'status','active','asset_code',v_asset.asset_code,'already_authorized',true);
  end if;
  if v_asset.status <> 'pending_authorization' then
    raise exception 'Aset tidak berada dalam status menunggu otorisasi.' using errcode='55000';
  end if;

  update aureka_system.legal_signature_assets
  set status='active',authorized_user_id=auth.uid(),authorized_at=now(),updated_at=now()
  where id=v_asset.id;

  insert into aureka_system.legal_signature_asset_events(asset_id,event_type,actor_id,actor_role,note)
  values(v_asset.id,'authorized',auth.uid(),v_role,'Pemilik aset mengaktifkan penggunaan tanda tangan melalui akun AUREKA yang terautentikasi.');

  return jsonb_build_object('success',true,'status','active','asset_code',v_asset.asset_code,'authorized_at',now());
end;
$$;
revoke all on function public.aureka_activate_legal_signature_asset(text) from public,anon;
grant execute on function public.aureka_activate_legal_signature_asset(text) to authenticated;

create or replace function public.aureka_revoke_legal_signature_asset(p_asset_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_asset aureka_system.legal_signature_assets%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan.' using errcode='28000'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Alasan pencabutan wajib diisi minimal 8 karakter.' using errcode='22023'; end if;
  v_role:=aureka_system.current_role_code();
  select * into v_asset from aureka_system.legal_signature_assets where id=p_asset_id for update;
  if not found then raise exception 'Aset tanda tangan tidak ditemukan.' using errcode='P0002'; end if;
  if not (v_role='ADMIN' or (v_asset.authorized_user_id=auth.uid() and v_role=v_asset.required_role)) then
    raise exception 'Hanya administrator atau pemilik tanda tangan yang dapat mencabut aset ini.' using errcode='42501';
  end if;
  if v_asset.status<>'active' then raise exception 'Hanya aset aktif yang dapat dicabut.' using errcode='55000'; end if;
  update aureka_system.legal_signature_assets
  set status='revoked',revoked_at=now(),revoke_reason=left(trim(p_reason),1000),updated_at=now()
  where id=v_asset.id;
  insert into aureka_system.legal_signature_asset_events(asset_id,event_type,actor_id,actor_role,note)
  values(v_asset.id,'revoked',auth.uid(),v_role,left(trim(p_reason),1000));
  return jsonb_build_object('success',true,'status','revoked','asset_code',v_asset.asset_code);
end;
$$;
revoke all on function public.aureka_revoke_legal_signature_asset(uuid,text) from public,anon;
grant execute on function public.aureka_revoke_legal_signature_asset(uuid,text) to authenticated;

create or replace function aureka_system.attach_legal_signature_asset()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.signature_asset_id is null then
    select id into new.signature_asset_id
    from aureka_system.legal_signature_assets
    where authorized_user_id=new.signer_user_id
      and required_role=new.signer_role
      and status='active'
    order by authorized_at desc
    limit 1;
  end if;
  return new;
end;
$$;
revoke all on function aureka_system.attach_legal_signature_asset() from public,anon,authenticated;
drop trigger if exists document_signature_attach_legal_asset on aureka_system.document_signatures;
create trigger document_signature_attach_legal_asset
before insert on aureka_system.document_signatures
for each row execute function aureka_system.attach_legal_signature_asset();

create or replace function public.aureka_list_legal_artifacts()
returns table (
  artifact_id uuid, artifact_code text, title text, artifact_type text,
  created_at timestamptz, sha256 text, signatures jsonb
)
language plpgsql security definer stable set search_path = ''
as $$
begin
  if auth.uid() is null or aureka_system.current_role_code() <> all(array['ADMIN','PMKP','MANAGEMENT','DIREKTUR','KABID','DEWAN_PENGAWAS']::text[]) then
    raise exception 'Role tidak berwenang melihat register dokumen legal.' using errcode='42501';
  end if;
  return query
  select a.id,a.artifact_code,a.title,a.artifact_type,a.created_at,a.sha256,
    coalesce(jsonb_agg(jsonb_build_object(
      'signer',s.signer_display_name,'role',s.signer_role,'signed_at',s.signed_at,
      'verification_code',s.verification_code,'signature_asset_id',s.signature_asset_id,
      'signature_type',s.signature_type
    ) order by s.signed_at) filter(where s.id is not null),'[]'::jsonb) as signatures
  from aureka_system.generated_artifacts a
  left join aureka_system.document_signatures s on s.artifact_id=a.id and s.revoked_at is null
  where (a.created_by=auth.uid() or aureka_system.can_approve_documents())
    and aureka_system.can_access_room_or_global(a.room_id)
  group by a.id
  order by a.created_at desc
  limit 250;
end;
$$;
revoke all on function public.aureka_list_legal_artifacts() from public,anon;
grant execute on function public.aureka_list_legal_artifacts() to authenticated;

create or replace function public.aureka_get_artifact_signature_stamps(p_artifact_id uuid)
returns table (
  signature_id uuid, signer_name text, signer_position text, signer_role text,
  signed_at timestamptz, verification_code text, image_mime_type text,
  image_data_base64 text, image_sha256 text
)
language plpgsql security definer stable set search_path = ''
as $$
declare v_room_id bigint;
begin
  if auth.uid() is null or not aureka_system.can_approve_documents() then
    raise exception 'Role tidak berwenang mengambil tanda tangan dokumen.' using errcode='42501';
  end if;
  select room_id into v_room_id from aureka_system.generated_artifacts where id=p_artifact_id;
  if not found or not aureka_system.can_access_room_or_global(v_room_id) then
    raise exception 'Dokumen tidak ditemukan dalam cakupan akses.' using errcode='42501';
  end if;
  return query
  select s.id,s.signer_display_name,a.signer_position,s.signer_role,s.signed_at,
         s.verification_code,a.image_mime_type,a.image_data_base64,a.image_sha256
  from aureka_system.document_signatures s
  join aureka_system.legal_signature_assets a on a.id=s.signature_asset_id
  where s.artifact_id=p_artifact_id and s.revoked_at is null and a.status='active'
  order by s.signed_at;
end;
$$;
revoke all on function public.aureka_get_artifact_signature_stamps(uuid) from public,anon;
grant execute on function public.aureka_get_artifact_signature_stamps(uuid) to authenticated;

commit;