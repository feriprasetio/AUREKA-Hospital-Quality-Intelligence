-- AUREKA · Hapus akun pengguna oleh Super Admin
--
-- Menghapus akun (auth.users) beserta profil & penugasan ruangannya (ON DELETE CASCADE).
-- Pengaman data:
--   * hanya Super Admin; tidak dapat menghapus akun sendiri;
--   * akun yang sudah pernah membuat data (risiko, RTP, FMEA, IKP, investigasi, dll.)
--     TIDAK dapat dihapus karena tabel data mereferensikan auth.users tanpa CASCADE.
--     Penghapusan dibatalkan utuh dan admin diminta menonaktifkan akun tersebut.
--     Dengan begitu data operasional tidak pernah ikut terhapus.

create or replace function public.aureka_admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, aureka_system, auth
as $$
begin
  if not aureka_system.is_admin() then
    raise exception 'FORBIDDEN: hanya Super Admin yang dapat menghapus akun' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'User tidak valid';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Tidak dapat menghapus akun Anda sendiri';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Akun tidak ditemukan';
  end if;

  begin
    delete from auth.users where id = p_user_id;
  exception when foreign_key_violation then
    raise exception 'USER_HAS_DATA: Akun ini sudah memiliki data (risiko, laporan, atau rekam mutu) sehingga tidak dapat dihapus agar data tetap utuh. Nonaktifkan akun sebagai gantinya.'
      using errcode = '23503';
  end;

  return true;
end;
$$;

revoke all on function public.aureka_admin_delete_user(uuid) from public, anon;
grant execute on function public.aureka_admin_delete_user(uuid) to authenticated;
