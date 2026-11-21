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

insert into aureka_system.legal_signature_assets(
  asset_code,signer_name,signer_position,required_role,source_file_name,source_sha256,
  image_mime_type,image_data_base64,image_sha256,status
) values
(
  'SIG-PMKP-CHAIR',
  'drg. Trieska Annisa, Sp.KGA',
  'Ketua Komite Peningkatan Mutu dan Keselamatan Pasien',
  'PMKP',
  'drg. Trieska.png',
  'edb3d02b1f5ba6b81e46f5b151e0f642fdc0c693bd96b55cb5de2e6431e19265',
  'image/webp',
  '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',
  'd98f47f9b2e8f67f3d3d1529edc6c0fec5ebf87b701e760203286d27711af9e0',
  'pending_authorization'
),
(
  'SIG-HOSPITAL-DIRECTOR',
  'dr. Eva Nurfarihah, Sp.THT-KL',
  'Direktur Rumah Sakit',
  'DIREKTUR',
  'TTD - dr. Eva.png',
  'aabae0f8cdacf153df8e3cea8f6522ebd32a3e240625eb2af09eb7a365d94ec9',
  'image/webp',
  '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',
  'pending_authorization'
)
on conflict (asset_code) do nothing;

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