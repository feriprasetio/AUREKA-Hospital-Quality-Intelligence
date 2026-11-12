-- AUREKA Blueprint v2.0 §7, §8, §10, §13: Program (Rekomendasi Ketua PMKP + RTL bertingkat),
-- E-Regulasi dengan persetujuan elektronik Direktur, dan Audit Log append-only.
--
-- Sifat migrasi: ADITIF dan non-destruktif. Tidak mengubah/menghapus tabel yang sudah ada.
-- Semua akses dari aplikasi melalui fungsi public.aureka_gov_* (SECURITY DEFINER) yang memeriksa role di server;
-- tabel di skema aureka_governance tidak dibuka langsung ke API (tidak perlu menambah "Exposed schemas").
--
-- Rollback (bila perlu): drop schema aureka_governance cascade; lalu drop function public.aureka_gov_* .

begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists aureka_governance;
revoke all on schema aureka_governance from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Identitas pemanggil
-- ---------------------------------------------------------------------------
create or replace function aureka_governance.me()
returns table (user_id uuid, full_name text, role_code text, room_id bigint)
language sql stable security definer set search_path = aureka_system, public as $$
  select up.user_id, up.full_name, ar.code, up.primary_room_id
  from aureka_system.user_profiles up
  left join aureka_system.app_roles ar on ar.id = up.role_id and ar.is_active
  where up.user_id = auth.uid() and up.is_active
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Audit log append-only (§13)
-- ---------------------------------------------------------------------------
create table if not exists aureka_governance.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  object_type text not null,
  object_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on aureka_governance.audit_log (created_at desc);
create index if not exists audit_log_object_idx on aureka_governance.audit_log (object_type, object_id);

create or replace function aureka_governance.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Audit log bersifat append-only: baris tidak boleh diubah atau dihapus.';
end $$;
drop trigger if exists audit_log_no_update on aureka_governance.audit_log;
create trigger audit_log_no_update before update or delete on aureka_governance.audit_log
  for each row execute function aureka_governance.audit_log_immutable();

create or replace function aureka_governance.write_audit(p_action text, p_object_type text, p_object_id text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  insert into aureka_governance.audit_log(actor_user_id, actor_name, actor_role, action, object_type, object_id, detail)
  values (auth.uid(), v.full_name, v.role_code, p_action, p_object_type, p_object_id, coalesce(p_detail, '{}'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Program: rekomendasi, tindakan (RTL) bertingkat, evaluasi (§7)
-- ---------------------------------------------------------------------------
create table if not exists aureka_governance.recommendations (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  source text not null default 'ketua_pmkp' check (source in ('ketua_pmkp','audit','risiko','insiden','program','lainnya')),
  title text not null check (length(trim(title)) >= 5),
  description text not null default '',
  priority text not null default 'sedang' check (priority in ('tinggi','sedang','rendah')),
  program_year integer not null default extract(year from now())::int,
  given_by_name text,
  given_at date not null default current_date,
  status text not null default 'aktif' check (status in ('aktif','selesai','dibatalkan')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aureka_governance.actions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references aureka_governance.recommendations(id) on delete restrict,
  parent_action_id uuid references aureka_governance.actions(id) on delete restrict,
  title text not null check (length(trim(title)) >= 5),
  description text not null default '',
  responsible_level text not null check (responsible_level in ('DEWAN_PENGAWAS','DIREKTUR','KABID','UNIT')),
  assigned_to_name text,
  assigned_room_id bigint references public.master_rooms(id) on delete restrict,
  due_date date,
  expected_output text not null default '',
  status text not null default 'terbuka' check (status in ('terbuka','berjalan','selesai','terverifikasi','dibatalkan')),
  progress_note text not null default '',
  evidence_url text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists actions_level_idx on aureka_governance.actions (responsible_level, status);
create index if not exists actions_rec_idx on aureka_governance.actions (recommendation_id);

create table if not exists aureka_governance.action_evaluations (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references aureka_governance.actions(id) on delete restrict,
  result text not null check (result in ('efektif','sebagian','tidak_efektif')),
  decision text not null check (decision in ('ditutup','dilanjutkan')),
  note text not null check (length(trim(note)) >= 10),
  evidence_url text,
  evaluator_user_id uuid default auth.uid(),
  evaluator_name text,
  evaluated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- E-Regulasi (§8)
-- ---------------------------------------------------------------------------
create table if not exists aureka_governance.regulation_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('keputusan_direktur','spo','pedoman','panduan','kebijakan','lainnya')),
  doc_number text,
  title text not null check (length(trim(title)) >= 5),
  owner_room_id bigint references public.master_rooms(id) on delete restrict,
  legal_basis text not null default '',
  status text not null default 'draft' check (status in ('draft','menunggu_direktur','dikembalikan','ditolak','disetujui','terbit','dicabut')),
  current_version_id uuid,
  published_version_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aureka_governance.regulation_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references aureka_governance.regulation_documents(id) on delete restrict,
  version_no integer not null,
  summary text not null default '',
  content text not null default '',
  file_url text,
  content_hash text not null,
  change_note text not null default '',
  status text not null default 'draft' check (status in ('draft','menunggu_direktur','dikembalikan','ditolak','disetujui','terbit','digantikan')),
  effective_date date,
  review_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);

create table if not exists aureka_governance.regulation_approvals (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references aureka_governance.regulation_versions(id) on delete restrict,
  approver_user_id uuid not null,
  approver_name text,
  approver_role text not null,
  decision text not null check (decision in ('setujui','tolak','kembalikan')),
  comments text not null default '',
  approved_content_hash text not null,
  signature_method text not null default 'persetujuan_internal_aureka',
  decided_at timestamptz not null default now()
);

create table if not exists aureka_governance.regulation_distributions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references aureka_governance.regulation_versions(id) on delete restrict,
  recipient_room_id bigint references public.master_rooms(id) on delete restrict,
  recipient_label text,
  distributed_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid
);

-- Versi yang sudah disetujui/terbit tidak boleh diubah isinya (§8.1 butir 4)
create or replace function aureka_governance.version_guard()
returns trigger language plpgsql as $$
begin
  if old.status in ('disetujui','terbit','digantikan') and (new.content is distinct from old.content or new.summary is distinct from old.summary or new.file_url is distinct from old.file_url or new.content_hash is distinct from old.content_hash) then
    raise exception 'Versi yang sudah disetujui tidak dapat diubah. Buat versi baru (revisi).';
  end if;
  return new;
end $$;
drop trigger if exists regulation_versions_guard on aureka_governance.regulation_versions;
create trigger regulation_versions_guard before update on aureka_governance.regulation_versions
  for each row execute function aureka_governance.version_guard();
create or replace function aureka_governance.no_delete()
returns trigger language plpgsql as $$ begin raise exception 'Data regulasi dan persetujuan tidak boleh dihapus (arsip permanen).'; end $$;
drop trigger if exists regulation_versions_no_delete on aureka_governance.regulation_versions;
create trigger regulation_versions_no_delete before delete on aureka_governance.regulation_versions for each row execute function aureka_governance.no_delete();
drop trigger if exists regulation_approvals_no_delete on aureka_governance.regulation_approvals;
create trigger regulation_approvals_no_delete before delete or update on aureka_governance.regulation_approvals for each row execute function aureka_governance.no_delete();

alter table aureka_governance.audit_log enable row level security;
alter table aureka_governance.recommendations enable row level security;
alter table aureka_governance.actions enable row level security;
alter table aureka_governance.action_evaluations enable row level security;
alter table aureka_governance.regulation_documents enable row level security;
alter table aureka_governance.regulation_versions enable row level security;
alter table aureka_governance.regulation_approvals enable row level security;
alter table aureka_governance.regulation_distributions enable row level security;
-- Tanpa policy: tabel hanya bisa dibaca/ditulis lewat fungsi di bawah.

-- ---------------------------------------------------------------------------
-- Fungsi API — Program
-- ---------------------------------------------------------------------------
create or replace function public.aureka_gov_program_list(p_year integer default null)
returns jsonb language plpgsql stable security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; v_levels text[];
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  -- §7/§10: Dewan Pengawas dan Kepala Bidang hanya melihat RTL pada level penugasannya; peran mutu/manajemen melihat semua.
  v_levels := case
    when v.role_code in ('ADMIN','PMKP','MANAGEMENT','DIREKTUR') then array['DEWAN_PENGAWAS','DIREKTUR','KABID','UNIT']
    when v.role_code = 'DEWAN_PENGAWAS' then array['DEWAN_PENGAWAS']
    when v.role_code = 'KABID' then array['KABID']
    when v.role_code in ('PIC','VALIDATOR') then array['UNIT']
    else array[]::text[] end;
  return jsonb_build_object(
    'role', v.role_code,
    'can_manage', v.role_code in ('ADMIN','PMKP'),
    'can_evaluate', v.role_code in ('ADMIN','PMKP','DIREKTUR'),
    'recommendations', coalesce((select jsonb_agg(to_jsonb(r) order by r.given_at desc, r.created_at desc) from aureka_governance.recommendations r
        where (p_year is null or r.program_year = p_year)
          and (v.role_code in ('ADMIN','PMKP','MANAGEMENT','DIREKTUR') or exists (select 1 from aureka_governance.actions a where a.recommendation_id = r.id and a.responsible_level = any(v_levels)
               and (v.role_code not in ('PIC','VALIDATOR') or a.assigned_room_id = v.room_id)))), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('room_name', mr.name,
          'last_evaluation', (select to_jsonb(e) from aureka_governance.action_evaluations e where e.action_id = a.id order by e.evaluated_at desc limit 1)) order by a.due_date nulls last, a.created_at)
        from aureka_governance.actions a left join public.master_rooms mr on mr.id = a.assigned_room_id
        left join aureka_governance.recommendations r on r.id = a.recommendation_id
        where a.responsible_level = any(v_levels)
          and (v.role_code not in ('PIC','VALIDATOR') or a.assigned_room_id = v.room_id)
          and (p_year is null or r.program_year is null or r.program_year = p_year)), '[]'::jsonb)
  );
end $$;

create or replace function public.aureka_gov_save_recommendation(p jsonb)
returns uuid language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; v_id uuid := nullif(p->>'id','')::uuid; v_code text;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then raise exception 'Hanya Komite PMKP / Super Admin yang dapat mengelola rekomendasi.'; end if;
  if v_id is null then
    v_code := 'REK-' || coalesce(nullif(p->>'program_year',''), extract(year from now())::text) || '-' || lpad((select count(*) + 1 from aureka_governance.recommendations)::text, 3, '0');
    insert into aureka_governance.recommendations(code, source, title, description, priority, program_year, given_by_name, given_at)
    values (v_code, coalesce(nullif(p->>'source',''),'ketua_pmkp'), p->>'title', coalesce(p->>'description',''), coalesce(nullif(p->>'priority',''),'sedang'),
            coalesce(nullif(p->>'program_year','')::int, extract(year from now())::int), nullif(p->>'given_by_name',''), coalesce(nullif(p->>'given_at','')::date, current_date))
    returning id into v_id;
    perform aureka_governance.write_audit('create', 'recommendation', v_id::text, p);
  else
    update aureka_governance.recommendations set source = coalesce(nullif(p->>'source',''), source), title = coalesce(nullif(p->>'title',''), title),
      description = coalesce(p->>'description', description), priority = coalesce(nullif(p->>'priority',''), priority),
      given_by_name = coalesce(p->>'given_by_name', given_by_name), status = coalesce(nullif(p->>'status',''), status), updated_at = now()
    where id = v_id;
    perform aureka_governance.write_audit('update', 'recommendation', v_id::text, p);
  end if;
  return v_id;
end $$;

create or replace function public.aureka_gov_save_action(p jsonb)
returns uuid language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; v_id uuid := nullif(p->>'id','')::uuid; a record;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  if v_id is null then
    if v.role_code not in ('ADMIN','PMKP') then raise exception 'Hanya Komite PMKP / Super Admin yang dapat membuat RTL.'; end if;
    insert into aureka_governance.actions(recommendation_id, parent_action_id, title, description, responsible_level, assigned_to_name, assigned_room_id, due_date, expected_output)
    values (nullif(p->>'recommendation_id','')::uuid, nullif(p->>'parent_action_id','')::uuid, p->>'title', coalesce(p->>'description',''), p->>'responsible_level',
            nullif(p->>'assigned_to_name',''), nullif(p->>'assigned_room_id','')::bigint, nullif(p->>'due_date','')::date, coalesce(p->>'expected_output',''))
    returning id into v_id;
    perform aureka_governance.write_audit('create', 'action', v_id::text, p);
    return v_id;
  end if;
  select * into a from aureka_governance.actions where id = v_id;
  if not found then raise exception 'RTL tidak ditemukan.'; end if;
  if v.role_code in ('ADMIN','PMKP') then
    update aureka_governance.actions set title = coalesce(nullif(p->>'title',''), title), description = coalesce(p->>'description', description),
      responsible_level = coalesce(nullif(p->>'responsible_level',''), responsible_level), assigned_to_name = coalesce(p->>'assigned_to_name', assigned_to_name),
      assigned_room_id = coalesce(nullif(p->>'assigned_room_id','')::bigint, assigned_room_id), due_date = coalesce(nullif(p->>'due_date','')::date, due_date),
      expected_output = coalesce(p->>'expected_output', expected_output), status = coalesce(nullif(p->>'status',''), status),
      progress_note = coalesce(p->>'progress_note', progress_note), evidence_url = coalesce(nullif(p->>'evidence_url',''), evidence_url), updated_at = now()
    where id = v_id;
  elsif (a.responsible_level = v.role_code) or (a.responsible_level = 'UNIT' and v.role_code in ('PIC','VALIDATOR') and a.assigned_room_id = v.room_id) then
    -- Penanggung jawab hanya memperbarui progres & bukti; status 'terverifikasi' hanya lewat evaluasi.
    if coalesce(p->>'status','') not in ('', 'berjalan', 'selesai') then raise exception 'Penanggung jawab hanya dapat mengubah status ke berjalan/selesai.'; end if;
    update aureka_governance.actions set status = coalesce(nullif(p->>'status',''), status), progress_note = coalesce(p->>'progress_note', progress_note),
      evidence_url = coalesce(nullif(p->>'evidence_url',''), evidence_url), updated_at = now()
    where id = v_id;
  else
    raise exception 'RTL ini bukan dalam lingkup penugasan Anda.';
  end if;
  perform aureka_governance.write_audit('update', 'action', v_id::text, p);
  return v_id;
end $$;

create or replace function public.aureka_gov_evaluate_action(p_action_id uuid, p_result text, p_decision text, p_note text, p_evidence_url text default null)
returns uuid language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; v_id uuid;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP','DIREKTUR') then raise exception 'Evaluasi efektivitas hanya oleh Komite PMKP, Direktur, atau Super Admin.'; end if;
  insert into aureka_governance.action_evaluations(action_id, result, decision, note, evidence_url, evaluator_name)
  values (p_action_id, p_result, p_decision, p_note, nullif(p_evidence_url,''), v.full_name) returning id into v_id;
  update aureka_governance.actions set status = case when p_decision = 'ditutup' then 'terverifikasi' else 'berjalan' end, updated_at = now() where id = p_action_id;
  perform aureka_governance.write_audit('evaluate', 'action', p_action_id::text, jsonb_build_object('result', p_result, 'decision', p_decision, 'note', p_note));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Fungsi API — E-Regulasi
-- ---------------------------------------------------------------------------
create or replace function aureka_governance.hash_version(p_summary text, p_content text, p_file_url text, p_version integer)
returns text language sql immutable as $$
  select encode(extensions.digest(coalesce(p_summary,'') || E'\n' || coalesce(p_content,'') || E'\n' || coalesce(p_file_url,'') || E'\n' || p_version::text, 'sha256'), 'hex');
$$;

create or replace function public.aureka_gov_regulation_list()
returns jsonb language plpgsql stable security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  return jsonb_build_object(
    'role', v.role_code,
    'can_draft', v.role_code in ('ADMIN','PMKP','MANAGEMENT','KABID'),
    'can_approve', v.role_code = 'DIREKTUR',
    'can_publish', v.role_code in ('ADMIN','PMKP'),
    'documents', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('room_name', mr.name,
        'versions', (select coalesce(jsonb_agg(to_jsonb(rv) || jsonb_build_object('approvals',
            (select coalesce(jsonb_agg(to_jsonb(ap) order by ap.decided_at), '[]'::jsonb) from aureka_governance.regulation_approvals ap where ap.version_id = rv.id)) order by rv.version_no desc), '[]'::jsonb)
          from aureka_governance.regulation_versions rv where rv.document_id = d.id
            and (v.role_code in ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR') or rv.status in ('terbit','digantikan')))) order by d.updated_at desc)
      from aureka_governance.regulation_documents d left join public.master_rooms mr on mr.id = d.owner_room_id
      -- Pengguna non-penyusun hanya melihat dokumen yang sudah terbit
      where v.role_code in ('ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR') or d.status = 'terbit'), '[]'::jsonb)
  );
end $$;

create or replace function public.aureka_gov_regulation_save_draft(p jsonb)
returns uuid language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; v_doc uuid := nullif(p->>'document_id','')::uuid; v_ver uuid; v_no integer; d record; cur record;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP','MANAGEMENT','KABID') then raise exception 'Anda tidak berwenang menyusun regulasi.'; end if;
  if v_doc is null then
    insert into aureka_governance.regulation_documents(doc_type, title, owner_room_id, legal_basis)
    values (coalesce(nullif(p->>'doc_type',''),'spo'), p->>'title', nullif(p->>'owner_room_id','')::bigint, coalesce(p->>'legal_basis',''))
    returning id into v_doc;
  else
    select * into d from aureka_governance.regulation_documents where id = v_doc;
    if not found then raise exception 'Dokumen tidak ditemukan.'; end if;
    update aureka_governance.regulation_documents set title = coalesce(nullif(p->>'title',''), title), doc_type = coalesce(nullif(p->>'doc_type',''), doc_type),
      owner_room_id = coalesce(nullif(p->>'owner_room_id','')::bigint, owner_room_id), legal_basis = coalesce(p->>'legal_basis', legal_basis), updated_at = now()
    where id = v_doc;
  end if;
  -- Versi draft yang masih terbuka diperbarui; bila versi terakhir sudah diajukan/disetujui, dibuat versi baru (revisi).
  select * into cur from aureka_governance.regulation_versions where document_id = v_doc order by version_no desc limit 1;
  if found and cur.status in ('draft','dikembalikan') then
    update aureka_governance.regulation_versions set summary = coalesce(p->>'summary',''), content = coalesce(p->>'content',''), file_url = nullif(p->>'file_url',''),
      change_note = coalesce(p->>'change_note',''), status = 'draft',
      content_hash = aureka_governance.hash_version(p->>'summary', p->>'content', nullif(p->>'file_url',''), cur.version_no)
    where id = cur.id returning id into v_ver;
  else
    v_no := coalesce(cur.version_no, 0) + 1;
    insert into aureka_governance.regulation_versions(document_id, version_no, summary, content, file_url, change_note, content_hash)
    values (v_doc, v_no, coalesce(p->>'summary',''), coalesce(p->>'content',''), nullif(p->>'file_url',''), coalesce(p->>'change_note',''),
            aureka_governance.hash_version(p->>'summary', p->>'content', nullif(p->>'file_url',''), v_no))
    returning id into v_ver;
  end if;
  update aureka_governance.regulation_documents set current_version_id = v_ver, status = case when status in ('terbit') then status else 'draft' end, updated_at = now() where id = v_doc;
  perform aureka_governance.write_audit('save_draft', 'regulation', v_doc::text, jsonb_build_object('version_id', v_ver, 'title', p->>'title'));
  return v_doc;
end $$;

create or replace function public.aureka_gov_regulation_submit(p_document_id uuid)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; cur record;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP','MANAGEMENT','KABID') then raise exception 'Anda tidak berwenang mengajukan regulasi.'; end if;
  select rv.* into cur from aureka_governance.regulation_versions rv join aureka_governance.regulation_documents d on d.current_version_id = rv.id where d.id = p_document_id;
  if not found or cur.status not in ('draft','dikembalikan') then raise exception 'Hanya versi draft yang dapat diajukan ke Direktur.'; end if;
  if length(trim(cur.content)) < 20 and cur.file_url is null then raise exception 'Isi dokumen atau tautan berkas wajib diisi sebelum diajukan.'; end if;
  update aureka_governance.regulation_versions set status = 'menunggu_direktur' where id = cur.id;
  update aureka_governance.regulation_documents set status = 'menunggu_direktur', updated_at = now() where id = p_document_id;
  perform aureka_governance.write_audit('submit', 'regulation', p_document_id::text, jsonb_build_object('version_id', cur.id, 'version_no', cur.version_no));
end $$;

create or replace function public.aureka_gov_regulation_decide(p_version_id uuid, p_decision text, p_comments text)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; cur record; v_status text;
begin
  select * into v from aureka_governance.me();
  -- §8/§13: hanya Direktur yang memberi persetujuan final; Super Admin teknis tidak otomatis berwenang.
  if coalesce(v.role_code,'') <> 'DIREKTUR' then raise exception 'Persetujuan regulasi hanya oleh Direktur.'; end if;
  if p_decision not in ('setujui','tolak','kembalikan') then raise exception 'Keputusan tidak dikenal.'; end if;
  if p_decision <> 'setujui' and length(trim(coalesce(p_comments,''))) < 10 then raise exception 'Tuliskan alasan (minimal 10 karakter) untuk penolakan atau pengembalian.'; end if;
  select * into cur from aureka_governance.regulation_versions where id = p_version_id for update;
  if not found or cur.status <> 'menunggu_direktur' then raise exception 'Versi ini tidak sedang menunggu persetujuan Direktur.'; end if;
  if cur.created_by = auth.uid() then raise exception 'Pemisahan tugas: penyusun tidak dapat menyetujui versinya sendiri.'; end if;
  v_status := case p_decision when 'setujui' then 'disetujui' when 'tolak' then 'ditolak' else 'dikembalikan' end;
  insert into aureka_governance.regulation_approvals(version_id, approver_user_id, approver_name, approver_role, decision, comments, approved_content_hash)
  values (cur.id, auth.uid(), v.full_name, v.role_code, p_decision, coalesce(p_comments,''), cur.content_hash);
  update aureka_governance.regulation_versions set status = v_status where id = cur.id;
  update aureka_governance.regulation_documents set status = v_status, updated_at = now() where id = cur.document_id;
  perform aureka_governance.write_audit('decision_' || p_decision, 'regulation', cur.document_id::text, jsonb_build_object('version_id', cur.id, 'content_hash', cur.content_hash, 'comments', p_comments));
end $$;

create or replace function public.aureka_gov_regulation_publish(p_version_id uuid, p_doc_number text, p_effective_date date, p_review_date date default null)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; cur record;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','PMKP') then raise exception 'Penerbitan dilakukan oleh Komite PMKP / Super Admin.'; end if;
  select * into cur from aureka_governance.regulation_versions where id = p_version_id for update;
  if not found or cur.status <> 'disetujui' then raise exception 'Hanya versi yang telah disetujui Direktur yang dapat diterbitkan.'; end if;
  if not exists (select 1 from aureka_governance.regulation_approvals ap where ap.version_id = cur.id and ap.decision = 'setujui' and ap.approved_content_hash = cur.content_hash) then
    raise exception 'Integritas gagal: isi versi berbeda dengan yang disetujui Direktur.';
  end if;
  if length(trim(coalesce(p_doc_number,''))) < 3 then raise exception 'Nomor dokumen wajib diisi.'; end if;
  update aureka_governance.regulation_versions set status = 'digantikan' where document_id = cur.document_id and status = 'terbit' and id <> cur.id;
  update aureka_governance.regulation_versions set status = 'terbit', effective_date = coalesce(p_effective_date, current_date), review_date = p_review_date where id = cur.id;
  update aureka_governance.regulation_documents set status = 'terbit', doc_number = p_doc_number, published_version_id = cur.id, updated_at = now() where id = cur.document_id;
  perform aureka_governance.write_audit('publish', 'regulation', cur.document_id::text, jsonb_build_object('version_id', cur.id, 'doc_number', p_doc_number, 'effective_date', p_effective_date));
end $$;

-- ---------------------------------------------------------------------------
-- Fungsi API — Audit Log
-- ---------------------------------------------------------------------------
create or replace function public.aureka_gov_audit_log(p_limit integer default 200, p_object_type text default null)
returns jsonb language plpgsql stable security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') not in ('ADMIN','DIREKTUR','PMKP') then raise exception 'Audit log hanya untuk Super Admin, Direktur, dan Komite PMKP.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select * from aureka_governance.audit_log where p_object_type is null or object_type = p_object_type
    order by created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x), '[]'::jsonb);
end $$;

revoke all on function public.aureka_gov_program_list(integer) from public, anon;
revoke all on function public.aureka_gov_save_recommendation(jsonb) from public, anon;
revoke all on function public.aureka_gov_save_action(jsonb) from public, anon;
revoke all on function public.aureka_gov_evaluate_action(uuid, text, text, text, text) from public, anon;
revoke all on function public.aureka_gov_regulation_list() from public, anon;
revoke all on function public.aureka_gov_regulation_save_draft(jsonb) from public, anon;
revoke all on function public.aureka_gov_regulation_submit(uuid) from public, anon;
revoke all on function public.aureka_gov_regulation_decide(uuid, text, text) from public, anon;
revoke all on function public.aureka_gov_regulation_publish(uuid, text, date, date) from public, anon;
revoke all on function public.aureka_gov_audit_log(integer, text) from public, anon;
grant execute on function public.aureka_gov_program_list(integer) to authenticated;
grant execute on function public.aureka_gov_save_recommendation(jsonb) to authenticated;
grant execute on function public.aureka_gov_save_action(jsonb) to authenticated;
grant execute on function public.aureka_gov_evaluate_action(uuid, text, text, text, text) to authenticated;
grant execute on function public.aureka_gov_regulation_list() to authenticated;
grant execute on function public.aureka_gov_regulation_save_draft(jsonb) to authenticated;
grant execute on function public.aureka_gov_regulation_submit(uuid) to authenticated;
grant execute on function public.aureka_gov_regulation_decide(uuid, text, text) to authenticated;
grant execute on function public.aureka_gov_regulation_publish(uuid, text, date, date) to authenticated;
grant execute on function public.aureka_gov_audit_log(integer, text) to authenticated;

commit;
