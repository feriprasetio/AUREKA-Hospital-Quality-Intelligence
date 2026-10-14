-- AUREKA · Pengamanan profil pengguna
--
-- Policy "Users can update own profile" mengizinkan pengguna memperbarui baris
-- profilnya sendiri tanpa batasan kolom. Karena role_id, is_active, dan
-- primary_room_id menentukan hak akses (mis. PIC hanya melihat risiko unitnya),
-- pengguna biasa tidak boleh mengubah kolom-kolom tersebut sendiri.
--
-- Trigger ini mengizinkan perubahan kolom akses hanya jika:
--   * dijalankan tanpa sesi pengguna (SQL editor / service role, auth.uid() IS NULL), atau
--   * pelaku adalah Super Admin (aureka_system.is_admin()).
-- Nama lengkap tetap dapat diubah oleh pemilik akun.

create or replace function aureka_system.guard_user_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = aureka_system, public
as $$
begin
  if auth.uid() is null or aureka_system.is_admin() then
    return new;
  end if;

  if new.role_id is distinct from old.role_id
     or new.is_active is distinct from old.is_active
     or new.primary_room_id is distinct from old.primary_room_id
     or new.user_id is distinct from old.user_id then
    raise exception 'FORBIDDEN: role, status akun, dan unit utama hanya dapat diubah oleh Super Admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_user_profile_privileges on aureka_system.user_profiles;
create trigger guard_user_profile_privileges
before update on aureka_system.user_profiles
for each row execute function aureka_system.guard_user_profile_privileges();

-- Penugasan ruangan juga menentukan akses; pastikan tidak ada policy tulis
-- untuk pengguna biasa (hanya fungsi admin SECURITY DEFINER yang menulis).
revoke insert, update, delete on aureka_system.user_room_assignments from authenticated;
