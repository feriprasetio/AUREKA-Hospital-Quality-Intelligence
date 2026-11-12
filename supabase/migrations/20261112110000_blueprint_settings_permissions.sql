-- AUREKA Blueprint v2.0 §10.4, §13, §16: matriks permission granular, konfigurasi sistem, dan log akses data sensitif.
-- Aditif; membutuhkan migrasi 20261112100000_blueprint_program_regulation_audit.sql (skema aureka_governance + audit log).
-- Rollback: drop table aureka_governance.role_permissions, aureka_governance.system_settings; drop function public.aureka_gov_perm_*,
--           public.aureka_has_permission, public.aureka_gov_settings_*, public.aureka_gov_log_access.

begin;

-- ---------------------------------------------------------------------------
-- Matriks permission (§10.4). Default mengikuti §10.1: Direktur lintas modul; Dewas & Kabid default-deny data sensitif.
-- ---------------------------------------------------------------------------
create table if not exists aureka_governance.permissions (
  code text primary key,
  label text not null,
  sensitive boolean not null default false
);
create table if not exists aureka_governance.role_permissions (
  role_code text not null,
  permission text not null references aureka_governance.permissions(code) on delete cascade,
  granted boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (role_code, permission)
);
alter table aureka_governance.permissions enable row level security;
alter table aureka_governance.role_permissions enable row level security;

insert into aureka_governance.permissions(code, label, sensitive) values
  ('patient.read.identifiable', 'Melihat identitas pasien dan profil longitudinal', true),
  ('patient.read.clinical_detail', 'Melihat rincian klinis/episode', true),
  ('patient.read.quality_profile', 'Melihat ringkasan mutu pasien', false),
  ('incident.read', 'Melihat register insiden', false),
  ('incident.read.investigation_detail', 'Melihat rincian investigasi/RCA', true),
  ('survey.read.aggregate', 'Melihat hasil survei agregat', false),
  ('survey.read.named_response', 'Melihat respons & identitas responden survei', true),
  ('hr.read.directory', 'Melihat direktori SDM', false),
  ('hr.read.performance', 'Melihat OPPE/FPPE', true),
  ('regulation.create', 'Menyusun regulasi', false),
  ('regulation.review', 'Menelaah regulasi', false),
  ('regulation.approve', 'Menyetujui regulasi', false),
  ('regulation.publish', 'Menerbitkan regulasi', false),
  ('risk.read', 'Melihat risiko', false),
  ('risk.write', 'Mengelola risiko', false),
  ('risk.assign', 'Menugaskan pengendalian risiko', false),
  ('risk.evaluate', 'Mengevaluasi efektivitas kontrol', false),
  ('audit_log.read', 'Melihat audit log', true),
  ('data.export.sensitive', 'Mengekspor data pasien/insiden/survei bernama/OPPE', true)
on conflict (code) do update set label = excluded.label, sensitive = excluded.sensitive;

-- Default matriks (hanya diisi bila belum ada; perubahan admin tidak ditimpa)
insert into aureka_governance.role_permissions(role_code, permission, granted)
select r.role_code, p.code,
  case
    when r.role_code = 'DIREKTUR' then p.code <> 'regulation.publish'
    when r.role_code = 'ADMIN' then p.code in ('hr.read.directory','regulation.create','regulation.review','regulation.publish','risk.read','risk.write','risk.assign','audit_log.read','incident.read','survey.read.aggregate','patient.read.quality_profile')
    when r.role_code = 'PMKP' then p.code in ('patient.read.identifiable','patient.read.clinical_detail','patient.read.quality_profile','incident.read','incident.read.investigation_detail','survey.read.aggregate','hr.read.directory','regulation.create','regulation.review','regulation.publish','risk.read','risk.write','risk.assign','risk.evaluate','audit_log.read')
    when r.role_code = 'MANAGEMENT' then p.code in ('patient.read.quality_profile','incident.read','survey.read.aggregate','hr.read.directory','regulation.create','regulation.review','risk.read','risk.write','risk.assign')
    when r.role_code = 'KABID' then p.code in ('patient.read.quality_profile','incident.read','survey.read.aggregate','hr.read.directory','regulation.create','regulation.review','risk.read','risk.write','risk.assign')
    when r.role_code = 'DEWAN_PENGAWAS' then p.code in ('survey.read.aggregate','risk.read')
    when r.role_code = 'PIC' then p.code in ('patient.read.identifiable','patient.read.clinical_detail','patient.read.quality_profile','incident.read','hr.read.directory','risk.read','risk.write')
    when r.role_code = 'VALIDATOR' then p.code in ('patient.read.identifiable','patient.read.clinical_detail','patient.read.quality_profile','risk.read')
    else false end
from (values ('ADMIN'),('PMKP'),('MANAGEMENT'),('KABID'),('DIREKTUR'),('DEWAN_PENGAWAS'),('PIC'),('VALIDATOR')) r(role_code)
cross join aureka_governance.permissions p
on conflict (role_code, permission) do nothing;

create or replace function public.aureka_has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = aureka_governance, aureka_system, public as $$
  select coalesce((select rp.granted from aureka_governance.role_permissions rp, aureka_governance.me() m
                   where rp.role_code = m.role_code and rp.permission = p_permission), false);
$$;

create or replace function public.aureka_gov_perm_matrix()
returns jsonb language plpgsql stable security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  return jsonb_build_object(
    'role', v.role_code,
    'can_edit', v.role_code = 'ADMIN',
    'mine', coalesce((select jsonb_agg(rp.permission) from aureka_governance.role_permissions rp where rp.role_code = v.role_code and rp.granted), '[]'::jsonb),
    'permissions', (select jsonb_agg(to_jsonb(p) order by p.code) from aureka_governance.permissions p),
    'matrix', case when v.role_code in ('ADMIN','DIREKTUR','PMKP') then
      (select jsonb_agg(jsonb_build_object('role_code', rp.role_code, 'permission', rp.permission, 'granted', rp.granted)) from aureka_governance.role_permissions rp) else '[]'::jsonb end
  );
end $$;

create or replace function public.aureka_gov_perm_set(p_role text, p_permission text, p_granted boolean)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') <> 'ADMIN' then raise exception 'Hanya Super Admin yang dapat mengubah matriks hak akses.'; end if;
  -- §13 pemisahan tugas: Super Admin teknis tidak boleh diberi hak menyetujui regulasi.
  if p_role = 'ADMIN' and p_permission = 'regulation.approve' and p_granted then raise exception 'Pemisahan tugas: Super Admin teknis tidak dapat diberi hak menyetujui regulasi.'; end if;
  insert into aureka_governance.role_permissions(role_code, permission, granted, updated_by, updated_at)
  values (p_role, p_permission, p_granted, auth.uid(), now())
  on conflict (role_code, permission) do update set granted = excluded.granted, updated_by = excluded.updated_by, updated_at = now();
  perform aureka_governance.write_audit('permission_' || case when p_granted then 'grant' else 'revoke' end, 'permission', p_role || ':' || p_permission, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Log akses data sensitif (§10.2, §13): dipanggil aplikasi saat pengguna membuka identitas/rincian sensitif.
-- ---------------------------------------------------------------------------
create or replace function public.aureka_gov_log_access(p_object_type text, p_object_id text default null, p_purpose text default null, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
begin
  if auth.uid() is null then raise exception 'Akses ditolak.'; end if;
  if p_object_type not in ('patient_identity','patient_profile','incident_investigation','survey_named_response','hr_performance','data_export') then
    raise exception 'Jenis akses tidak dikenal.';
  end if;
  perform aureka_governance.write_audit('view_sensitive', p_object_type, left(p_object_id, 200),
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('purpose', left(coalesce(p_purpose, ''), 300)));
end $$;

-- ---------------------------------------------------------------------------
-- Konfigurasi sistem (§16): kebijakan yang harus dikunci sebelum operasional.
-- ---------------------------------------------------------------------------
create table if not exists aureka_governance.system_settings (
  key text primary key,
  value jsonb not null,
  label text not null,
  description text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table aureka_governance.system_settings enable row level security;

insert into aureka_governance.system_settings(key, value, label, description) values
  ('hospital_name', to_jsonb('UPT RSUD Sultan Syarif Mohamad Alkadrie'::text), 'Nama rumah sakit', 'Ditampilkan pada laporan dan dokumen.'),
  ('active_program_year', to_jsonb(extract(year from now())::int), 'Tahun program aktif', 'Tahun bawaan untuk Program, Indikator, dan Hasil Capaian.'),
  ('logbook_deadline_day', to_jsonb(10), 'Batas input logbook (tanggal bulan berikutnya)', 'Dipakai untuk pengingat unit yang belum mengisi logbook.'),
  ('shared_account_allowed', to_jsonb(true), 'Akun bersama diizinkan', '§16: bila diizinkan, survei bernama wajib memilih responden dari master SDM + konfirmasi; akun pengirim tetap tercatat.'),
  ('regulation_signature_method', to_jsonb('internal'::text), 'Metode persetujuan regulasi', '§8/§16: internal = persetujuan elektronik AUREKA; tte = wajib tanda tangan elektronik tersertifikasi di luar AUREKA.'),
  ('tte_provider', to_jsonb(''::text), 'Penyedia TTE tersertifikasi', 'Diisi bila metode persetujuan = tte.'),
  ('director_acting_name', to_jsonb(''::text), 'Pejabat Plt. Direktur (bila ada)', '§16: dicatat untuk keperluan audit pergantian pejabat.'),
  ('sensitive_access_requires_purpose', to_jsonb(true), 'Wajib isi tujuan saat membuka data sensitif', '§13: pengguna menuliskan tujuan sebelum identitas pasien ditampilkan.')
on conflict (key) do nothing;

create or replace function public.aureka_gov_settings_get()
returns jsonb language plpgsql stable security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record;
begin
  select * into v from aureka_governance.me();
  if v.role_code is null then raise exception 'Akses ditolak.'; end if;
  return jsonb_build_object('can_edit', v.role_code = 'ADMIN',
    'settings', (select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'label', s.label, 'description', s.description, 'updated_at', s.updated_at) order by s.key) from aureka_governance.system_settings s));
end $$;

create or replace function public.aureka_gov_settings_set(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = aureka_governance, aureka_system, public as $$
declare v record; old jsonb;
begin
  select * into v from aureka_governance.me();
  if coalesce(v.role_code,'') <> 'ADMIN' then raise exception 'Hanya Super Admin yang dapat mengubah konfigurasi sistem.'; end if;
  select value into old from aureka_governance.system_settings where key = p_key;
  if not found then raise exception 'Kunci konfigurasi tidak dikenal.'; end if;
  update aureka_governance.system_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform aureka_governance.write_audit('setting_update', 'system_setting', p_key, jsonb_build_object('before', old, 'after', p_value));
end $$;

revoke all on function public.aureka_has_permission(text) from public, anon;
revoke all on function public.aureka_gov_perm_matrix() from public, anon;
revoke all on function public.aureka_gov_perm_set(text, text, boolean) from public, anon;
revoke all on function public.aureka_gov_log_access(text, text, text, jsonb) from public, anon;
revoke all on function public.aureka_gov_settings_get() from public, anon;
revoke all on function public.aureka_gov_settings_set(text, jsonb) from public, anon;
grant execute on function public.aureka_has_permission(text) to authenticated;
grant execute on function public.aureka_gov_perm_matrix() to authenticated;
grant execute on function public.aureka_gov_perm_set(text, text, boolean) to authenticated;
grant execute on function public.aureka_gov_log_access(text, text, text, jsonb) to authenticated;
grant execute on function public.aureka_gov_settings_get() to authenticated;
grant execute on function public.aureka_gov_settings_set(text, jsonb) to authenticated;

commit;
