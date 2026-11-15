-- Pilihan Role di Pengaturan › Pengguna dan Role belum menampilkan Direktur, Kepala Bidang,
-- dan Dewan Pengawas. Migration ini:
-- 1) memastikan ketiga peran tata kelola aktif di aureka_system.app_roles;
-- 2) mendefinisikan ulang public.aureka_list_active_roles() agar mengembalikan SEMUA peran aktif
--    (sebelumnya fungsi ini hanya ada di database dan tidak tercatat di folder migrations).
-- Kolom yang dikembalikan sama dengan yang dipakai aplikasi: id, code, name, description.

insert into aureka_system.app_roles (code, name, description, is_active)
values
  ('DIREKTUR', 'Direktur', 'Pimpinan rumah sakit; melihat seluruh modul', true),
  ('KABID', 'Kepala Bidang', 'Memantau unit di bawah bidangnya; reviewer tahap pertama rencana mitigasi risiko', true),
  ('DEWAN_PENGAWAS', 'Dewan Pengawas', 'Pengawas; ringkasan agregat tanpa data pribadi; pengesah tahap akhir mitigasi risiko', true)
on conflict (code) do update
set is_active = true, updated_at = now();

drop function if exists public.aureka_list_active_roles();

create function public.aureka_list_active_roles()
returns table (id uuid, code text, name text, description text)
language sql
stable
security definer
set search_path = aureka_system, public
as $$
  select r.id, r.code, r.name, r.description
  from aureka_system.app_roles r
  where r.is_active
    and auth.uid() is not null
  order by
    array_position(array['ADMIN','PMKP','DIREKTUR','MANAGEMENT','KABID','DEWAN_PENGAWAS','VALIDATOR','PIC'], r.code) nulls last,
    r.name
$$;

revoke all on function public.aureka_list_active_roles() from public, anon;
grant execute on function public.aureka_list_active_roles() to authenticated;
