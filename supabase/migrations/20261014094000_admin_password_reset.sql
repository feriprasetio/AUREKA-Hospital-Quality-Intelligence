-- AUREKA · Reset password oleh Super Admin
--
-- Bila PIC lupa password, Super Admin dapat menyetel password sementara tanpa
-- menghapus dan membuat ulang akun (data PIC tetap utuh). Password disimpan
-- ter-hash (bcrypt) di auth.users seperti password biasa Supabase Auth.
-- Fungsi ini juga mengonfirmasi email akun bila belum terkonfirmasi, karena
-- admin telah memverifikasi pemilik akun secara langsung.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.aureka_admin_set_user_password(p_user_id uuid, p_new_password text)
returns boolean
language plpgsql
security definer
set search_path = public, aureka_system, auth, extensions
as $$
begin
  if not aureka_system.is_admin() then
    raise exception 'FORBIDDEN: hanya Super Admin yang dapat mereset password' using errcode = '42501';
  end if;
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT: Password minimal 8 karakter.';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'Akun tidak ditemukan';
  end if;
  return true;
end;
$$;

revoke all on function public.aureka_admin_set_user_password(uuid, text) from public, anon;
grant execute on function public.aureka_admin_set_user_password(uuid, text) to authenticated;
