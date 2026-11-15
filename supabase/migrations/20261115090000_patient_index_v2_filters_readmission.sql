-- =====================================================================
-- Database Pasien v2: filter cepat, penanda readmisi ≤30 hari, ringkasan seluruh populasi.
-- Membutuhkan 20261111140000_patient_index.sql (tabel aureka_quality.patient_index,
-- fungsi aureka_quality.normalize_no_rm).
--
-- Tidak mengubah tabel maupun RLS; hanya menambah fungsi baca (security definer)
-- yang memakai pemeriksaan hak akses unit yang sama (aureka_system.has_quality_room_access).
-- Fungsi v1 (aureka_patient_index_search / _summary) tetap ada; aplikasi memakai v2 bila tersedia.
--
-- Definisi readmisi ≤30 hari (perkiraan dari Logbook):
--   dua episode RAWAT INAP pasien yang sama (episode yang memiliki tanggal keluar)
--   dengan selisih tanggal logbook 1–30 hari. Bukan pengganti indikator readmisi resmi SIMRS.
-- =====================================================================

-- Episode rawat inap per No. RM, hanya untuk unit yang boleh diakses pengguna.
create or replace function aureka_quality.patient_readmission_30(p_room_ids bigint[])
returns table (no_rm text, readmisi_30 integer, readmisi_terakhir date)
language sql stable security definer set search_path = aureka_quality, public as $$
  with ep as (
    select aureka_quality.normalize_no_rm(coalesce(q.core_data->>'medical_record_no',
             coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. Rekam Medis',
             coalesce(q.core_data->'form_fields', q.core_data->'form_data')->>'No. RM')) as rm,
           coalesce(q.record_date, q.created_at::date) as d
    from aureka_quality.quality_records q
    where q.room_id = any(p_room_ids)
      and q.measurement_grain = 'patient_episode' and q.archived_at is null and q.status <> 'archived'
      and (q.core_data ? 'discharge_at' or coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb) ? 'Tanggal Keluar')
  ), seq as (
    select rm, d, d - lag(d) over (partition by rm order by d) as gap from ep where rm is not null
  )
  select rm, count(*)::int, max(d) from seq where gap between 1 and 30 group by rm;
$$;
revoke all on function aureka_quality.patient_readmission_30(bigint[]) from public, anon, authenticated;

-- Cari pasien dengan filter. p_filter: 'semua' | 'berulang' | 'readmisi30'.
-- p_room: hanya pasien yang pernah dilayani di unit tsb. p_from/p_to: rentang kunjungan terakhir.
create or replace function public.aureka_patient_index_search_v2(
  p_query text default null, p_filter text default 'semua', p_room bigint default null,
  p_from date default null, p_to date default null, p_limit integer default 50, p_offset integer default 0)
returns table (no_rm text, nama_pasien text, nik text, no_ihs text, simrs_patient_id text, tanggal_lahir date, jenis_kelamin text,
               first_seen date, last_seen date, total_episode integer, unit_terakhir text, diagnosis_terakhir text,
               bridging_status text, bridging_at timestamptz, readmisi_30 integer, readmisi_terakhir date, total_count bigint)
language sql stable security definer set search_path = aureka_quality, aureka_system, public as $$
  with allowed as (
    select coalesce(array_agg(r.id), '{}') as ids from public.master_rooms r
    where auth.uid() is not null and aureka_system.has_quality_room_access(r.id) and (p_room is null or r.id = p_room)
  ), q as (
    select nullif(trim(coalesce(p_query,'')), '') as t, regexp_replace(coalesce(p_query,''), '[^0-9]', '', 'g') as digits
  ), ra as (
    select * from aureka_quality.patient_readmission_30((select ids from allowed))
  ), hit as (
    select p.*, coalesce(ra.readmisi_30, 0) as readmisi_30, ra.readmisi_terakhir
    from aureka_quality.patient_index p
    cross join allowed a cross join q
    left join ra on ra.no_rm = p.no_rm
    where p.room_ids && a.ids
      and (q.t is null
           or p.no_rm = aureka_quality.normalize_no_rm(q.t)
           or (q.digits <> '' and replace(p.no_rm, '-', '') like '%' || q.digits || '%')
           or p.nama_pasien ilike '%' || q.t || '%'
           or p.nik = q.t)
      and (coalesce(p_filter, 'semua') = 'semua'
           or (p_filter = 'berulang' and p.total_episode > 1)
           or (p_filter = 'readmisi30' and ra.readmisi_30 > 0))
      and (p_from is null or p.last_seen >= p_from)
      and (p_to is null or p.last_seen <= p_to)
  )
  select h.no_rm, h.nama_pasien, h.nik, h.no_ihs, h.simrs_patient_id, h.tanggal_lahir, h.jenis_kelamin,
         h.first_seen, h.last_seen, h.total_episode, h.unit_terakhir, h.diagnosis_terakhir,
         h.bridging_status, h.bridging_at, h.readmisi_30, h.readmisi_terakhir, count(*) over () as total_count
  from hit h
  order by h.last_seen desc nulls last, h.no_rm
  limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
$$;

-- Ringkasan seluruh populasi yang boleh dilihat (bukan hanya halaman tabel).
create or replace function public.aureka_patient_index_overview()
returns jsonb language sql stable security definer set search_path = aureka_quality, aureka_system, public as $$
  with allowed as (
    select coalesce(array_agg(r.id), '{}') as ids from public.master_rooms r
    where auth.uid() is not null and aureka_system.has_quality_room_access(r.id)
  ), p as (
    select p.* from aureka_quality.patient_index p, allowed a where p.room_ids && a.ids
  ), ra as (
    select * from aureka_quality.patient_readmission_30((select ids from allowed))
  )
  select jsonb_build_object(
    'total', (select count(*) from p),
    'kunjungan_berulang', (select count(*) from p where total_episode > 1),
    'readmisi_30', (select count(*) from ra join p using (no_rm)),
    'dengan_nik', (select count(*) from p where nik is not null),
    'dengan_ihs', (select count(*) from p where no_ihs is not null),
    'dengan_simrs_id', (select count(*) from p where simrs_patient_id is not null),
    'dengan_nama', (select count(*) from p where nullif(trim(nama_pasien), '') is not null),
    'terhubung_simrs', (select count(*) from p where bridging_status = 'terhubung'),
    'bridging', (select coalesce(jsonb_object_agg(bridging_status, n), '{}'::jsonb)
                 from (select bridging_status, count(*) as n from p group by bridging_status) b),
    'terakhir_diperbarui', (select max(updated_at) from p)
  );
$$;

revoke all on function public.aureka_patient_index_search_v2(text, text, bigint, date, date, integer, integer) from public, anon;
revoke all on function public.aureka_patient_index_overview() from public, anon;
grant execute on function public.aureka_patient_index_search_v2(text, text, bigint, date, date, integer, integer) to authenticated;
grant execute on function public.aureka_patient_index_overview() to authenticated;
