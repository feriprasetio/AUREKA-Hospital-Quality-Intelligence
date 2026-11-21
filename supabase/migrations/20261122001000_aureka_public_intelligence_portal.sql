-- AUREKA public portal: additive release, no raw clinical or incident tables exposed.
-- Every public snapshot requires independent approval; the anonymous API reads approved snapshots only.
create table if not exists aureka_system.public_portal_snapshots (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('inm','safety','risk')),
  period_label text not null check (length(period_label) between 4 and 64),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  status text not null default 'draft' check (status in ('draft','published','superseded','withdrawn')),
  created_by uuid not null,
  approved_by uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  withdrawn_at timestamptz,
  constraint aureka_public_portal_payload_limit check (octet_length(payload::text) <= 65536)
);
alter table aureka_system.public_portal_snapshots enable row level security;
revoke all on aureka_system.public_portal_snapshots from public, anon, authenticated;
create index if not exists aureka_portal_latest_idx on aureka_system.public_portal_snapshots(domain,published_at desc) where status='published';
create unique index if not exists aureka_portal_one_published_per_domain_idx on aureka_system.public_portal_snapshots(domain) where status='published';

-- Certificate verification codes: strengthen future issuance; legacy CERT-20hex codes remain valid.
alter table aureka_system.education_certificates
  alter column verification_code set default ('CERT-' || upper(encode(gen_random_bytes(16),'hex')));

create or replace function public.aureka_public_intelligence()
returns jsonb language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'inm', (select jsonb_build_object('period',s.period_label,'published_at',s.published_at,'payload',s.payload) from aureka_system.public_portal_snapshots s where s.domain='inm' and s.status='published' order by s.published_at desc limit 1),
    'safety', (select jsonb_build_object('period',s.period_label,'published_at',s.published_at,'payload',s.payload) from aureka_system.public_portal_snapshots s where s.domain='safety' and s.status='published' order by s.published_at desc limit 1),
    'risk', (select jsonb_build_object('period',s.period_label,'published_at',s.published_at,'payload',s.payload) from aureka_system.public_portal_snapshots s where s.domain='risk' and s.status='published' order by s.published_at desc limit 1)
  );
$fn$;
revoke all on function public.aureka_public_intelligence() from public;
grant execute on function public.aureka_public_intelligence() to anon, authenticated;

-- A certificate is visible to outsiders only after its immutable browser render manifest exists.
-- Never return source manifests, assessment data, staff identifiers, or private Storage paths.
create or replace function public.aureka_verify_education_certificate(p_verification_code text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_verification_code,'')));
  v_cert aureka_system.education_certificates%rowtype;
  v_name text;
  v_title text;
  v_type text;
  v_start timestamptz;
begin
  if length(v_code) < 25 or length(v_code) > 70 or v_code !~ '^CERT-[A-Z0-9]+$' then
    return jsonb_build_object('status','not_found','valid',false);
  end if;
  select * into v_cert
    from aureka_system.education_certificates c
   where c.verification_code=v_code
   limit 1;
  if not found then
    return jsonb_build_object('status','not_found','valid',false);
  end if;
  if v_cert.revoked_at is not null then
    return jsonb_build_object('status','revoked','valid',false,'certificate_number',v_cert.certificate_number);
  end if;
  if v_cert.render_snapshot is null or v_cert.render_snapshot_sha256 is null then
    return jsonb_build_object('status','not_ready','valid',false);
  end if;
  select p.full_name, e.title, e.event_type, e.start_at
    into v_name, v_title, v_type, v_start
    from aureka_system.education_participants p
    join aureka_system.education_events e on e.id=p.event_id
   where p.id=v_cert.participant_id and p.event_id=v_cert.event_id;
  if not found then
    return jsonb_build_object('status','not_ready','valid',false);
  end if;
  return jsonb_build_object(
    'status','valid','valid',true,'certificate_number',v_cert.certificate_number,
    'recipient_name',v_name,'event_title',v_title,'event_type',v_type,
    'event_date',v_start,'issue_date',v_cert.issue_date,
    'issued_at',v_cert.issued_at,'manifest_sha256',v_cert.render_snapshot_sha256,
    'issuer','UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak',
    'signature_type','AUREKA register verification (not a certified electronic signature)'
  );
end;
$fn$;
revoke all on function public.aureka_verify_education_certificate(text) from public;
grant execute on function public.aureka_verify_education_certificate(text) to anon, authenticated;

-- Only explicitly authorized active institutional roles may create drafts.
create or replace function public.aureka_stage_public_portal_snapshot(p_domain text, p_period_label text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_id uuid;
begin
  select r.code into v_role from aureka_system.user_profiles u
    join aureka_system.app_roles r on r.id=u.role_id
    where u.user_id=v_actor and u.is_active=true and r.is_active=true and coalesce(u.must_change_password,false)=false;
  if v_actor is null or coalesce(v_role,'') not in ('ADMIN','PMKP','DIREKTUR','MANAGEMENT') then
    raise exception 'Akses penerbitan data publik ditolak.' using errcode='42501';
  end if;
  if p_domain not in ('inm','safety','risk') or length(btrim(coalesce(p_period_label,''))) not between 4 and 64
    or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>65536 then
    raise exception 'Data publik tidak sesuai skema.' using errcode='22023';
  end if;
  -- Domain-specific shallow allowlists: never publish unreviewed raw patient, incident or risk records.
  if exists (select 1 from jsonb_object_keys(p_payload) k where
     (p_domain='inm' and k not in ('indicators')) or
     (p_domain='safety' and k not in ('classifications','monthly','actions')) or
     (p_domain='risk' and k not in ('levels','controls','monthly'))) then
    raise exception 'Payload memuat field yang tidak diizinkan.' using errcode='22023';
  end if;
  if p_domain='inm' then
    if jsonb_typeof(p_payload->'indicators') <> 'array'
      or jsonb_array_length(p_payload->'indicators')>30
      or exists (select 1 from jsonb_array_elements(p_payload->'indicators') x
        where jsonb_typeof(x)<>'object' or exists (
          select 1 from jsonb_object_keys(x) k where k not in
            ('code','title','actual','target','unit','operator','period','numerator','denominator','status','definition','source','trend')
        )) then
      raise exception 'Format indikator tidak aman.' using errcode='22023';
    end if;
  else
    if exists (select 1 from jsonb_each(p_payload) pair
      where jsonb_typeof(pair.value)<>'array'
      or jsonb_array_length(pair.value)>60
      or exists (select 1 from jsonb_array_elements(pair.value) x
        where jsonb_typeof(x)<>'object'
        or exists (select 1 from jsonb_object_keys(x) k where k not in ('label','count','period','total','closed','category'))
      )) then
      raise exception 'Format agregat publik tidak aman.' using errcode='22023';
    end if;
    if p_domain='safety' and exists (
      select 1 from jsonb_each(p_payload) pair, jsonb_array_elements(pair.value) x
      where coalesce(x->>'count','') ~ '^[0-9]+$'
      and (x->>'count')::int between 1 and 4
    ) then
      raise exception 'Agregat insiden di bawah batas privasi tidak boleh dipublikasi.' using errcode='22023';
    end if;
  end if;
  insert into aureka_system.public_portal_snapshots(domain,period_label,payload,created_by)
  values (p_domain,btrim(p_period_label),p_payload,v_actor)
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.aureka_stage_public_portal_snapshot(text,text,jsonb) from public;
grant execute on function public.aureka_stage_public_portal_snapshot(text,text,jsonb) to authenticated;

-- Two-person approval, transactional supersession, and immutable historical snapshots.
create or replace function public.aureka_approve_public_portal_snapshot(p_snapshot_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_domain text;
  v_creator uuid;
begin
  select r.code into v_role from aureka_system.user_profiles u
    join aureka_system.app_roles r on r.id=u.role_id
    where u.user_id=v_actor and u.is_active=true and r.is_active=true and coalesce(u.must_change_password,false)=false;
  if v_actor is null or coalesce(v_role,'') not in ('ADMIN','PMKP','DIREKTUR') then
    raise exception 'Hanya penanggung jawab tata kelola dapat menyetujui publikasi.' using errcode='42501';
  end if;
  select domain,created_by into v_domain,v_creator from aureka_system.public_portal_snapshots
    where id=p_snapshot_id and status='draft' for update;
  if not found then raise exception 'Draf publikasi tidak ditemukan.' using errcode='P0002'; end if;
  if v_actor=v_creator then raise exception 'Penyusun dan penyetuju harus berbeda.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('aureka-public-portal-'||v_domain));
  update aureka_system.public_portal_snapshots set status='superseded'
    where domain=v_domain and status='published';
  update aureka_system.public_portal_snapshots
    set status='published',approved_by=v_actor,published_at=now()
    where id=p_snapshot_id;
  return true;
end;
$fn$;
revoke all on function public.aureka_approve_public_portal_snapshot(uuid) from public;
grant execute on function public.aureka_approve_public_portal_snapshot(uuid) to authenticated;

create or replace function public.aureka_withdraw_public_portal_snapshot(p_snapshot_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  select r.code into v_role from aureka_system.user_profiles u
    join aureka_system.app_roles r on r.id=u.role_id
    where u.user_id=v_actor and u.is_active=true and r.is_active=true;
  if v_actor is null or coalesce(v_role,'') not in ('ADMIN','PMKP','DIREKTUR') then
    raise exception 'Akses pencabutan publikasi ditolak.' using errcode='42501';
  end if;
  update aureka_system.public_portal_snapshots set status='withdrawn',withdrawn_at=now()
    where id=p_snapshot_id and status='published';
  return found;
end;
$fn$;
revoke all on function public.aureka_withdraw_public_portal_snapshot(uuid) from public;
grant execute on function public.aureka_withdraw_public_portal_snapshot(uuid) to authenticated;

-- Review console reads metadata and candidate payload for authorized roles only, never anonymous.
create or replace function public.aureka_manage_public_portal_snapshots()
returns jsonb language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  select r.code into v_role from aureka_system.user_profiles u
    join aureka_system.app_roles r on r.id=u.role_id
    where u.user_id=v_actor and u.is_active=true and r.is_active=true;
  if v_actor is null or coalesce(v_role,'') not in ('ADMIN','PMKP','DIREKTUR','MANAGEMENT') then
    raise exception 'Akses konsol publikasi ditolak.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'domain',domain,'period',period_label,'status',status,'payload',payload,
    'created_at',created_at,'created_by',created_by,'approved_by',approved_by,'published_at',published_at
  ) order by created_at desc) from (
    select * from aureka_system.public_portal_snapshots order by created_at desc limit 100
  ) s), '[]'::jsonb);
end;
$fn$;
revoke all on function public.aureka_manage_public_portal_snapshots() from public;
grant execute on function public.aureka_manage_public_portal_snapshots() to authenticated;
