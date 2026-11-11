-- Rekapan Pasien dibaca lewat satu fungsi (bukan query langsung ber-RLS per baris):
-- * hak akses diperiksa sekali per unit (aureka_system.has_quality_room_access)
-- * hanya kolom yang ditampilkan yang dikirim (bukan seluruh isi formulir)
-- * pencarian No. RM memakai normalisasi yang sama dengan Database Pasien (36539 = 03-65-39)
-- Membutuhkan aureka_quality.normalize_no_rm dari 20261111140000_patient_index.sql.

create index if not exists quality_records_room_year_grain_date_idx
  on aureka_quality.quality_records (room_id, profile_year, measurement_grain, record_date desc, created_at desc)
  where archived_at is null;

create or replace function public.aureka_patient_episodes_page(
  p_room bigint, p_year integer, p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, room_id bigint, unit text, record_date date, status text, nama_pasien text, no_rm text, no_rm_norm text,
               masuk text, keluar text, diagnosis text, dpjp text, los text, rawat_inap boolean, total_count bigint)
language sql stable security definer set search_path = aureka_quality, aureka_system, public as $$
  with allowed as (
    select array_agg(r.id) as ids from public.master_rooms r
    where auth.uid() is not null and aureka_system.has_quality_room_access(r.id) and (p_room is null or r.id = p_room)
  ), qn as (
    select nullif(trim(coalesce(p_query, '')), '') as t
  ), x as (
    select q.id, q.room_id, q.record_date, q.status, q.created_at, q.core_data as c,
           coalesce(q.core_data->'form_fields', q.core_data->'form_data', '{}'::jsonb) as f
    from aureka_quality.quality_records q, allowed a
    where q.room_id = any(coalesce(a.ids, '{}')) and q.profile_year = p_year and q.measurement_grain = 'patient_episode'
      and q.archived_at is null and q.status <> 'archived'
  ), y as (
    select x.*,
      coalesce(nullif(trim(c->>'medical_record_no'),''), nullif(trim(f->>'No. Rekam Medis'),''), nullif(trim(f->>'No. RM'),'')) as rm_raw,
      coalesce(nullif(trim(c->>'patient_name'),''), nullif(trim(f->>'Nama Pasien'),'')) as nama
    from x
  ), hit as (
    select y.* from y, qn
    where qn.t is null
       or aureka_quality.normalize_no_rm(y.rm_raw) = aureka_quality.normalize_no_rm(qn.t)
       or y.rm_raw ilike '%' || qn.t || '%'
       or y.nama ilike '%' || qn.t || '%'
  ), page as (
    select h.*, count(*) over () as total_count from hit h
    order by h.record_date desc nulls last, h.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  )
  select p.id, p.room_id::bigint, r.name, p.record_date, p.status, p.nama, p.rm_raw, aureka_quality.normalize_no_rm(p.rm_raw),
    coalesce(nullif(trim(p.c->>'admission_at'),''), nullif(trim(p.f->>'Tanggal Masuk'),''), nullif(trim(p.f->>'Waktu Masuk'),''),
             nullif(trim(p.f->>'Tanggal Dilayani'),''), p.record_date::text),
    coalesce(nullif(trim(p.c->>'discharge_at'),''), nullif(trim(p.f->>'Tanggal Keluar'),'')),
    coalesce(nullif(trim(p.c->>'diagnosis'),''), nullif(trim(p.f->>'Diagnosa Tegak'),''), nullif(trim(p.f->>'Diagnosa IGD'),''),
             nullif(trim(p.f->>'Diagnosa'),''), nullif(trim(p.f->>'Diagnosa Operasi'),'')),
    coalesce(nullif(trim(p.c->>'dpjp'),''), nullif(trim(p.f->>'DPJP'),''), nullif(trim(p.f->>'Dpjp'),''), nullif(trim(p.f->>'Nama Dokter'),''),
             nullif(trim(p.f->>'Dokter Umum'),''), nullif(trim(p.f->>'Petugas'),''), nullif(trim(p.f->>'Nama Terapis'),''), nullif(trim(p.f->>'Nutrisionis'),'')),
    coalesce(p.c->>'los_days', p.c->'calculated_fields'->>'Length of Stay', p.c->'calculated_fields'->>'Lenght of Stay',
             p.f->>'Length of Stay', p.f->>'Lenght of Stay'),
    (p.c ? 'discharge_at' or p.f ? 'Tanggal Keluar'),
    p.total_count
  from page p left join public.master_rooms r on r.id = p.room_id
  order by p.record_date desc nulls last, p.created_at desc;
$$;

revoke all on function public.aureka_patient_episodes_page(bigint, integer, text, integer, integer) from public, anon;
grant execute on function public.aureka_patient_episodes_page(bigint, integer, text, integer, integer) to authenticated;
