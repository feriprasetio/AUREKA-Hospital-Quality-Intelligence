-- =====================================================================
-- Database Pasien (Master Patient Index) — No. Rekam Medis sebagai PRIMARY KEY
-- Disiapkan untuk bridging SIMRS / SATUSEHAT (lihat docs/SPEC-BRIDGING-SIMRS.md).
--
-- * Diisi otomatis dari Logbook episode pasien (quality_records, grain patient_episode)
--   lewat trigger, plus fungsi sinkron ulang untuk data lama.
-- * Kolom identitas tambahan (NIK, No. IHS SATUSEHAT, tgl lahir, jenis kelamin, alamat, telepon)
--   disiapkan untuk diisi dari SIMRS saat bridging; AUREKA tidak mengarangnya.
-- * Tabel tidak bisa diakses langsung (RLS aktif tanpa policy); akses lewat fungsi
--   yang memeriksa hak akses unit (aureka_system.has_quality_room_access).
-- =====================================================================

create table if not exists aureka_quality.patient_index (
  no_rm              text primary key check (no_rm ~ '^([0-9]{2}-[0-9]{2}-[0-9]{2}|[0-9]{7,12})$'),
  nama_pasien        text,
  nik                text check (nik is null or nik ~ '^[0-9]{16}$'),
  no_ihs             text,               -- ID Patient SATUSEHAT (IHS number)
  simrs_patient_id   text,               -- ID pasien di SIMRS RS
  tanggal_lahir      date,
  jenis_kelamin      text check (jenis_kelamin is null or jenis_kelamin in ('L','P')),
  alamat             text,
  telepon            text,
  first_seen         date,
  last_seen          date,
  total_episode      integer not null default 0,
  room_ids           bigint[] not null default '{}',
  unit_terakhir      text,
  diagnosis_terakhir text,
  bridging_status    text not null default 'belum_terhubung'
                     check (bridging_status in ('belum_terhubung','menunggu','terhubung','gagal','konflik')),
  bridging_at        timestamptz,
  bridging_note      text,
  source             text not null default 'aureka_logbook',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists patient_index_nama_idx on aureka_quality.patient_index (lower(nama_pasien));
create index if not exists patient_index_last_seen_idx on aureka_quality.patient_index (last_seen desc);
create index if not exists patient_index_room_ids_idx on aureka_quality.patient_index using gin (room_ids);
alter table aureka_quality.patient_index enable row level security;
revoke all on aureka_quality.patient_index from anon, authenticated;

-- Normalisasi No. RM (kunci utama):
--  * hanya angka yang dipakai; tanda kutip, spasi, strip, garis miring dibuang
--  * 1–6 digit -> dilengkapi nol di depan menjadi 6 digit, ditulis XX-XX-XX (format RSUD)
--    (Excel sering menghapus nol depan: 36539 dan 03-65-39 adalah pasien yang sama)
--  * 7–12 digit -> disimpan angka saja (cadangan bila SIMRS memakai No. RM lebih panjang)
--  * berisi huruf (mis. "Sat Nov ... GMT") atau berbentuk tanggal (YYYY-MM-DD, DD/MM/YYYY) -> ditolak (NULL)
create or replace function aureka_quality.normalize_no_rm(p text)
returns text language sql immutable as $$
  with d as (select coalesce(p, '') as raw, regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as digits)
  select case
    when d.raw ~* '[a-z]' then null
    when d.raw ~ '\d{4}-\d{1,2}-\d{1,2}' or d.raw ~ '\d{1,2}/\d{1,2}/\d{2,4}' then null
    when length(d.digits) between 1 and 6 then regexp_replace(lpad(d.digits, 6, '0'), '^(\d{2})(\d{2})(\d{2})$', '\1-\2-\3')
    when length(d.digits) between 7 and 12 then d.digits
    else null
  end
  from d;
$$;

-- Satu episode -> perbarui indeks pasiennya.
create or replace function aureka_quality.patient_index_touch(p_core jsonb, p_room bigint, p_date date)
returns void language plpgsql security definer set search_path = aureka_quality, public as $$
declare
  f jsonb := coalesce(p_core->'form_fields', p_core->'form_data', '{}'::jsonb);
  v_rm text := aureka_quality.normalize_no_rm(coalesce(p_core->>'medical_record_no', f->>'No. Rekam Medis', f->>'No. RM'));
  v_nama text := nullif(trim(coalesce(p_core->>'patient_name', f->>'Nama Pasien')), '');
  v_diag text := coalesce(nullif(trim(p_core->>'diagnosis'),''), nullif(trim(f->>'Diagnosa Tegak'),''), nullif(trim(f->>'Diagnosa IGD'),''),
                          nullif(trim(f->>'Diagnosa'),''), nullif(trim(f->>'Diagnosa Operasi'),''));
  v_unit text;
begin
  if v_rm is null then return; end if;
  select name into v_unit from public.master_rooms where id = p_room;
  insert into aureka_quality.patient_index as p (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
  values (v_rm, v_nama, p_date, p_date, 1, array[p_room], v_unit, v_diag)
  on conflict (no_rm) do update set
    nama_pasien = case when excluded.last_seen >= coalesce(p.last_seen, excluded.last_seen) then coalesce(excluded.nama_pasien, p.nama_pasien) else coalesce(p.nama_pasien, excluded.nama_pasien) end,
    first_seen = least(p.first_seen, excluded.first_seen),
    last_seen = greatest(p.last_seen, excluded.last_seen),
    total_episode = p.total_episode + 1,
    room_ids = (select array(select distinct unnest(p.room_ids || excluded.room_ids))),
    unit_terakhir = case when excluded.last_seen >= coalesce(p.last_seen, excluded.last_seen) then excluded.unit_terakhir else p.unit_terakhir end,
    diagnosis_terakhir = case when excluded.last_seen >= coalesce(p.last_seen, excluded.last_seen) then coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir) else p.diagnosis_terakhir end,
    updated_at = now();
end $$;

create or replace function aureka_quality.patient_index_on_record()
returns trigger language plpgsql security definer set search_path = aureka_quality, public as $$
begin
  if new.measurement_grain = 'patient_episode' and new.archived_at is null and new.status <> 'archived'
     and (tg_op = 'INSERT' or new.core_data is distinct from old.core_data) then
    perform aureka_quality.patient_index_touch(new.core_data, new.room_id, coalesce(new.record_date, new.created_at::date));
  end if;
  return new;
end $$;
drop trigger if exists patient_index_sync on aureka_quality.quality_records;
create trigger patient_index_sync after insert or update of core_data on aureka_quality.quality_records
  for each row execute function aureka_quality.patient_index_on_record();

-- Bangun ulang seluruh indeks dari logbook (Super Admin). Mempertahankan kolom bridging/identitas SIMRS.
create or replace function public.aureka_patient_index_sync()
returns integer language plpgsql security definer set search_path = aureka_quality, aureka_system, public as $$
declare v_count integer;
begin
  if aureka_system.current_role_code() <> 'ADMIN' then raise exception 'Hanya Super Admin yang dapat menyinkronkan Database Pasien.'; end if;
  with e as (
    select aureka_quality.normalize_no_rm(coalesce(q.core_data->>'medical_record_no', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM')) as rm,
           nullif(trim(coalesce(q.core_data->>'patient_name', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Nama Pasien')),'') as nama,
           coalesce(nullif(trim(q.core_data->>'diagnosis'),''), nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Tegak'),''),
                    nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa IGD'),''), nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa'),''),
                    nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Operasi'),'')) as diag,
           q.room_id, coalesce(q.record_date, q.created_at::date) as d
    from aureka_quality.quality_records q
    where q.measurement_grain = 'patient_episode' and q.archived_at is null and q.status <> 'archived'
  ), g as (
    select rm,
      (array_agg(nama order by d desc nulls last) filter (where nama is not null))[1] as nama,
      min(d) as first_seen, max(d) as last_seen, count(*)::int as total,
      array_agg(distinct room_id) as room_ids,
      (array_agg(room_id order by d desc nulls last))[1] as last_room,
      (array_agg(diag order by d desc nulls last) filter (where diag is not null))[1] as diag
    from e where rm is not null group by rm
  )
  insert into aureka_quality.patient_index as p (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
  select g.rm, g.nama, g.first_seen, g.last_seen, g.total, g.room_ids, r.name, g.diag
  from g left join public.master_rooms r on r.id = g.last_room
  on conflict (no_rm) do update set
    nama_pasien = coalesce(excluded.nama_pasien, p.nama_pasien), first_seen = excluded.first_seen, last_seen = excluded.last_seen,
    total_episode = excluded.total_episode, room_ids = excluded.room_ids, unit_terakhir = excluded.unit_terakhir,
    diagnosis_terakhir = coalesce(excluded.diagnosis_terakhir, p.diagnosis_terakhir), updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Cari pasien (No. RM atau nama). Hanya pasien yang pernah dilayani di unit yang boleh diakses pengguna.
create or replace function public.aureka_patient_index_search(p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns table (no_rm text, nama_pasien text, nik text, no_ihs text, simrs_patient_id text, tanggal_lahir date, jenis_kelamin text,
               first_seen date, last_seen date, total_episode integer, unit_terakhir text, diagnosis_terakhir text,
               bridging_status text, bridging_at timestamptz, total_count bigint)
language sql stable security definer set search_path = aureka_quality, aureka_system, public as $$
  with allowed as (
    select array_agg(r.id) as ids from public.master_rooms r
    where auth.uid() is not null and aureka_system.has_quality_room_access(r.id)
  ), q as (
    select nullif(trim(coalesce(p_query,'')), '') as t
  ), hit as (
    select p.* from aureka_quality.patient_index p, allowed a, q
    where p.room_ids && coalesce(a.ids, '{}')
      and (q.t is null
           or p.no_rm = aureka_quality.normalize_no_rm(q.t)
           or replace(p.no_rm, '-', '') like '%' || regexp_replace(q.t, '[^0-9]', '', 'g') || '%' and regexp_replace(q.t, '[^0-9]', '', 'g') <> ''
           or p.nama_pasien ilike '%' || q.t || '%'
           or p.nik = q.t)
  )
  select h.no_rm, h.nama_pasien, h.nik, h.no_ihs, h.simrs_patient_id, h.tanggal_lahir, h.jenis_kelamin,
         h.first_seen, h.last_seen, h.total_episode, h.unit_terakhir, h.diagnosis_terakhir,
         h.bridging_status, h.bridging_at, count(*) over () as total_count
  from hit h
  order by h.last_seen desc nulls last, h.no_rm
  limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
$$;

-- Daftar episode dengan No. RM kosong/tidak valid (untuk dibetulkan di Logbook).
create or replace function public.aureka_patient_index_invalid_rm(p_limit integer default 100)
returns table (record_id uuid, room_name text, record_date date, no_rm_asli text)
language sql stable security definer set search_path = aureka_quality, aureka_system, public as $$
  select q.id, r.name, q.record_date,
         coalesce(q.core_data->>'medical_record_no', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis')
  from aureka_quality.quality_records q
  join public.master_rooms r on r.id = q.room_id
  where auth.uid() is not null and aureka_system.has_quality_room_access(q.room_id)
    and q.measurement_grain = 'patient_episode' and q.archived_at is null and q.status <> 'archived'
    and aureka_quality.normalize_no_rm(coalesce(q.core_data->>'medical_record_no', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM')) is null
  order by q.record_date desc nulls last
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke all on function public.aureka_patient_index_invalid_rm(integer) from public, anon;
grant execute on function public.aureka_patient_index_invalid_rm(integer) to authenticated;

-- Ringkasan untuk kartu angka.
create or replace function public.aureka_patient_index_summary()
returns jsonb language sql stable security definer set search_path = aureka_quality, aureka_system, public as $$
  with allowed as (
    select array_agg(r.id) as ids from public.master_rooms r
    where auth.uid() is not null and aureka_system.has_quality_room_access(r.id)
  ), p as (
    select p.* from aureka_quality.patient_index p, allowed a where p.room_ids && coalesce(a.ids, '{}')
  )
  select jsonb_build_object(
    'total', (select count(*) from p),
    'kunjungan_berulang', (select count(*) from p where total_episode > 1),
    'dengan_nik', (select count(*) from p where nik is not null),
    'terhubung_simrs', (select count(*) from p where bridging_status = 'terhubung'),
    'terakhir_diperbarui', (select max(updated_at) from p)
  );
$$;

revoke all on function public.aureka_patient_index_sync() from public, anon;
revoke all on function public.aureka_patient_index_search(text, integer, integer) from public, anon;
revoke all on function public.aureka_patient_index_summary() from public, anon;
grant execute on function public.aureka_patient_index_sync() to authenticated;
grant execute on function public.aureka_patient_index_search(text, integer, integer) to authenticated;
grant execute on function public.aureka_patient_index_summary() to authenticated;

-- Isi awal dari seluruh logbook yang sudah ada (dijalankan sekali saat migrasi, tanpa cek peran).
do $$ begin
  insert into aureka_quality.patient_index (no_rm, nama_pasien, first_seen, last_seen, total_episode, room_ids, unit_terakhir, diagnosis_terakhir)
  select g.rm, g.nama, g.first_seen, g.last_seen, g.total, g.room_ids, r.name, g.diag from (
    select aureka_quality.normalize_no_rm(coalesce(q.core_data->>'medical_record_no', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM')) as rm,
      (array_agg(nullif(trim(coalesce(q.core_data->>'patient_name', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Nama Pasien')),'') order by coalesce(q.record_date, q.created_at::date) desc nulls last)
         filter (where nullif(trim(coalesce(q.core_data->>'patient_name', coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Nama Pasien')),'') is not null))[1] as nama,
      min(coalesce(q.record_date, q.created_at::date)) as first_seen, max(coalesce(q.record_date, q.created_at::date)) as last_seen,
      count(*)::int as total, array_agg(distinct q.room_id) as room_ids,
      (array_agg(q.room_id order by coalesce(q.record_date, q.created_at::date) desc nulls last))[1] as last_room,
      (array_agg(coalesce(nullif(trim(q.core_data->>'diagnosis'),''), nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Tegak'),''),
                          nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa IGD'),''), nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa'),''),
                          nullif(trim(coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'Diagnosa Operasi'),''))
                 order by coalesce(q.record_date, q.created_at::date) desc nulls last))[1] as diag
    from aureka_quality.quality_records q
    where q.measurement_grain = 'patient_episode' and q.archived_at is null and q.status <> 'archived'
    group by 1
  ) g left join public.master_rooms r on r.id = g.last_room
  where g.rm is not null
  on conflict (no_rm) do nothing;
end $$;
